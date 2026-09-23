import type { MatchEngine } from '@/features/manager/matchEngine';
import type {
  MatchSide,
  MatchSimEvent,
  MovementState,
  PlayerAgent,
  PlayerDecision,
} from '@/match-engine';
import { engineToWorldX, engineToWorldZ } from '../Match3DAdapter';
import { CELEBRATION_VARIANTS } from './FootballAnimationStateMachine';
import { easeFactor, lerp, lerpAngle, shortestAngle } from './visualMath';

/**
 * The bridge between the match engine and anything that draws a footballer.
 *
 * PURE: no React, no three, no DOM. It reads the engine every render frame and never
 * writes to it. It turns what the engine publishes into render-ready state, keyed by
 * PLAYER ID, never by array position:
 *
 *   engine.core.players (PlayerAgent)     → position, velocity, speed, facing,
 *                                            movement state, decision, stamina
 *   engine.core.ball.owner                → who is on the ball
 *   engine.core.eventsSince(visualCursor) → pass, receive, tackle, shot, save, goal…
 *
 * ── Interpolation ──────────────────────────────────────────────────────────────
 * The engine steps at a fixed 20 Hz inside the live screen's own frame loop, and the
 * 3D view draws at the display's rate from a second one. Reading raw positions each
 * frame shows a player standing still for two frames and jumping on the third.
 *
 * So every time the engine's clock (`engine.t`) moves, the adapter records a sample
 * of every player into a small ring, stamped with that SIMULATION time. It runs a
 * render clock, also in simulation time, a short way behind the newest sample, and
 * draws each player interpolated between the two samples either side of it. The clock
 * advances by (real time × the rate the simulation is actually running at), measured
 * from the samples themselves — so x1, x2 and x4 need no special handling, a pause
 * holds still, and a long render frame just moves the clock further.
 *
 * ── Placements ─────────────────────────────────────────────────────────────────
 * The engine only ever moves a player without running there in two places:
 * `resetToKickoff()` (kick-off, after a goal, second half), which always emits a
 * `kickoff` event, and `substitute()`, which puts a NEW id on the pitch. A `kickoff`
 * event therefore marks the next sample as a placement for everybody. As a safety net,
 * a sample that moved a player further than their own `topSpeed` allows over the
 * simulated gap is also a placement. Both tests are in simulation time, so a long
 * render frame can never look like a teleport. A placement is never interpolated
 * across — the player is shown at the new spot.
 */

/* ── Tuning ─────────────────────────────────────────────────────────────────── */

/** Samples kept per player. At 20 Hz x1 that is 0.8 s; at x4 it still covers well over the lag. */
const RING_SIZE = 16;
/** Slack on the top-speed test, in metres — rounding, clampToPitch, separation pushes. */
const PLACEMENT_TOLERANCE = 0.25;
/** The ball is only ever placed by `reset()` at kick-off; this is the safety-net bound, m/s. */
const BALL_SPEED_BOUND = 60;
/**
 * How far behind the newest sample the render clock runs, in REAL seconds. It has to
 * cover the longest gap between two samples, which is one engine step at x1 (50 ms)
 * and up to two at x4 on a 60 Hz display.
 */
const LAG_REAL = 0.075;
/** How quickly the measured simulation rate follows a change (x1 → x4, pause). Real seconds. */
const RATE_TAU = 0.3;
/** How quickly the render clock is pulled back onto its target lag. Real seconds. */
const CATCH_UP_TAU = 0.35;
/** Further behind than this (simulation seconds) and the clock jumps rather than catching up. */
const MAX_LAG = 1;
/** Visual smoothing of the engine's facing, in simulation seconds. */
const HEADING_TAU = 0.06;
/**
 * A standing (or shuffling) player's facing. Below 0.35 m/s the engine stops facing
 * its velocity and turns to the ball instead, and a player settling onto their mark
 * pulses between 0.1 and 0.5 m/s as they arrive — so their engine facing flips between
 * the two targets a few times a second. Measured over a match: about 90 heading
 * reversals per standing player-minute, a third after a swing of under 0.1 rad. So
 * below SLOW_SPEED the body keeps the facing it has until the engine's is more than
 * STANDING_DEADBAND away, then turns to it — smoothly, as always, and one way only —
 * and settles again within STANDING_SETTLED. Measured with these values: back-and-forth
 * wobbles (reversals after < 0.05 rad) fell from 28.5 to 8 per standing player-minute,
 * while real turns to follow the ball are kept. At a walk and above it simply follows.
 */
const SLOW_SPEED = 1.0;
const STANDING_DEADBAND = 0.2;
const STANDING_SETTLED = 0.03;

/** A shot this close to the keeper, across the goal, is gathered rather than dived at. Metres. */
const CATCH_REACH = 1.5;
/** A keeper goes as the shot is on its way, not when it has arrived. Simulation seconds. */
const SAVE_DELAY_MAX = 0.28;
/** A `save` event this soon after a dive has started belongs to that dive. */
const SAVE_MEMORY = 1.2;
/** The scorer turns away a beat after the ball crosses. */
const CELEBRATE_DELAY = 0.15;
/**
 * Teammates this close to the scorer (metres) join the celebration — measured over
 * twelve matches' goals, that is the scorer's fellow attackers, about three a goal
 * (25 m caught fewer than one). Each starts CELEBRATE_JOIN_MIN + up to
 * CELEBRATE_JOIN_SPREAD seconds after the scorer, so the last one still finishes its
 * 2.0 s inside the 2.6 s the engine holds play for.
 */
const CELEBRATE_JOIN_RADIUS = 35;
const CELEBRATE_JOIN_MIN = 0.12;
const CELEBRATE_JOIN_SPREAD = 0.3;

/** FNV-1a — the same hash the players' looks are seeded with. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** A seeded number in [0, 1). */
function unit(seed: string): number {
  return (hash(seed) >>> 8) / 0x1000000;
}

/** A player's take on the celebration for one goal. */
function celebrationVariant(id: string, goal: number): number {
  return hash(`${id}:goal${goal}:take`) % CELEBRATION_VARIANTS;
}

/* ── Public types ───────────────────────────────────────────────────────────── */

/**
 * What a player is seen to DO. Each one comes from exactly one engine event and is
 * given to the player that event names — never inferred from counters or the ball.
 * Two events reach a second player by the event's own data: a shot on target sends
 * the defending keeper, and a goal brings the scorer's nearby teammates in to
 * celebrate.
 *
 * 'foul' and 'booked' are not movements of their own — a foul is a tackle that went
 * wrong — so they are kept in `discipline` and never replace the body's `action`.
 */
export type PlayerVisualActionKind =
  | 'pass'
  | 'shoot'
  | 'receive'
  | 'intercept'
  | 'tackle'
  | 'save'
  | 'catch'
  | 'celebrate'
  | 'foul'
  | 'booked';

export interface PlayerVisualAction {
  kind: PlayerVisualActionKind;
  /** Counts up per player, so a consumer can tell a new action from the one it is playing. */
  seq: number;
  /**
   * Simulation time the action begins. Compare with `adapter.renderTime`: before it
   * the action is pending, after it `renderTime − at` is how far in it is.
   */
  at: number;
  /** Keeper dives: which way across the goal, in engine y (+ is towards y = 68). */
  dir: number;
  /** Tackle: the engine's 'won' | 'lost'. Otherwise null. */
  outcome: string | null;
  /**
   * Which take to play, 0-based: a celebration's variant, from the player's id and the
   * goal's number, so the same match always celebrates the same way. 0 otherwise.
   */
  variant: number;
  /** The engine event type it came from. */
  source: string;
}

/** One sampled moment of one player, in world space (see Match3DAdapter). */
export interface PlayerSnapshot {
  /** Simulation time of the sample. */
  time: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Engine facing, already in world heading convention (0 = +Z, turning towards +X). */
  facing: number;
  speed: number;
  stamina: number;
  onBall: boolean;
  state: MovementState;
  decision: PlayerDecision;
}

/** Everything a renderer needs about one player this frame. One object per player, reused. */
export interface PlayerVisualState {
  id: string;
  side: MatchSide;
  shirtNumber: number;
  isKeeper: boolean;
  /** World metres, interpolated at render time. */
  position: { x: number; z: number };
  /** World metres per simulation second — the engine's velocity, interpolated. */
  velocity: { x: number; z: number };
  /** The engine's speed, interpolated. Metres per simulation second. */
  speed: number;
  /** This player's engine top speed (5.4–7.8 m/s), fixed for the match. */
  topSpeed: number;
  /** The engine's facing, interpolated the short way round. */
  facing: number;
  /** `facing`, visually smoothed. What a body should be turned to. */
  heading: number;
  /** The engine's movement state at the nearest sample. */
  state: MovementState;
  /** The engine's decision at the nearest sample. */
  decision: PlayerDecision;
  /** On the ball at the nearest sample, from `ball.owner`. */
  onBall: boolean;
  /** 0.15..1, the engine's own figure. */
  stamina: number;
  active: boolean;
  /**
   * True for the one frame the render clock crosses a placement (kick-off reset,
   * or first appearance). Locomotion state that depends on continuity should reset.
   */
  placed: boolean;
  /** The latest body action, which may still be pending (`at` in the future) or finished. */
  action: PlayerVisualAction | null;
  /** The latest 'foul' or 'booked' against this player. Never displaces `action`. */
  discipline: PlayerVisualAction | null;
}

export interface PlayerVisualRuntime {
  readonly id: string;
  /** The engine's own agent. Read, never written. */
  readonly agent: PlayerAgent;
  /** Render-ready state, rewritten in place every frame. */
  readonly visual: PlayerVisualState;
  /** The samples either side of the render clock this frame. */
  readonly previous: PlayerSnapshot;
  readonly current: PlayerSnapshot;
  /** What appearance is seeded from. The player's id, so a substitute never inherits a look. */
  readonly appearanceKey: string;
  /** Simulation time this player first took the pitch in this view. */
  readonly spawnedAt: number;
  /** Simulation time of the latest sample that included this player. */
  readonly lastSeenSimulationTime: number;
}

export interface BallVisualState {
  x: number;
  z: number;
  /** Who has it at the nearest sample. */
  ownerId: string | null;
  placed: boolean;
}

export type RemovalReason = 'substituted' | 'sent_off' | 'left';

/* ── Internals ──────────────────────────────────────────────────────────────── */

/** Per-sample fields in a player's ring. */
const F_X = 0;
const F_Z = 1;
const F_VX = 2;
const F_VZ = 3;
const F_FACING = 4;
const F_SPEED = 5;
const F_STAMINA = 6;
const F_FLAGS = 7;
const FIELDS = 8;

const FLAG_PLACED = 1;
const FLAG_ON_BALL = 2;

/** Ball ring fields. */
const B_X = 0;
const B_Z = 1;
const B_FLAGS = 2;
const BALL_FIELDS = 3;

function makeSnapshot(): PlayerSnapshot {
  return {
    time: 0,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    facing: 0,
    speed: 0,
    stamina: 1,
    onBall: false,
    state: 'IDLE',
    decision: 'HOLD',
  };
}

class Runtime implements PlayerVisualRuntime {
  readonly id: string;
  readonly agent: PlayerAgent;
  readonly visual: PlayerVisualState;
  readonly previous = makeSnapshot();
  readonly current = makeSnapshot();
  readonly appearanceKey: string;
  readonly spawnedAt: number;
  lastSeenSimulationTime: number;

  readonly ring = new Float64Array(RING_SIZE * FIELDS);
  readonly states: MovementState[] = new Array<MovementState>(RING_SIZE).fill('IDLE');
  readonly decisions: PlayerDecision[] = new Array<PlayerDecision>(RING_SIZE).fill('HOLD');
  /** Roster pass that last saw this id. */
  stamp = 0;
  /** Sequence of the latest sample flagged as a placement, and the latest one shown. */
  placedSeq = -1;
  placedShownSeq = -1;
  actionSeq = 0;
  /** The drawn heading is turning to the engine's facing (always, on the move). */
  headingFollows = true;
  /** Which way a slow player's turn is going (+1 / −1), fixed when it starts. */
  headingTurn = 0;

  constructor(agent: PlayerAgent, now: number) {
    this.id = agent.id;
    this.agent = agent;
    this.appearanceKey = agent.id;
    this.spawnedAt = now;
    this.lastSeenSimulationTime = now;
    this.visual = {
      id: agent.id,
      side: agent.side,
      shirtNumber: agent.shirtNumber,
      isKeeper: agent.role === 'gk',
      position: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      speed: 0,
      topSpeed: agent.topSpeed,
      facing: 0,
      heading: 0,
      state: agent.state,
      decision: agent.decision,
      onBall: false,
      stamina: agent.stamina,
      active: true,
      placed: true,
      action: null,
      discipline: null,
    };
  }
}

/* ── The adapter ────────────────────────────────────────────────────────────── */

export class PlayerVisualAdapter {
  private readonly engine: MatchEngine;

  private readonly byId = new Map<string, Runtime>();
  private readonly list: Runtime[] = [];
  private readonly reasons = new Map<string, RemovalReason>();

  /** Sample times, and the real-clock time each one arrived. */
  private readonly times = new Float64Array(RING_SIZE);
  private readonly ballRing = new Float64Array(RING_SIZE * BALL_FIELDS);
  private readonly ballOwners: (string | null)[] = new Array<string | null>(RING_SIZE).fill(null);
  /** Sequence number of the newest sample; slot = seq % RING_SIZE. */
  private newestSeq = -1;
  private sampleCount = 0;

  /** The visual cursor into the engine's event history — independent of anyone else's. */
  private cursor: number;
  private placementPending = false;
  /** Goals seen so far this match: part of each celebration's seed. */
  private goalsSeen = 0;
  private stamp = 0;

  private renderT = 0;
  private delta = 0;
  private rate = 0;
  private lastObservedT = 0;

  private ballPlacedSeq = -1;
  private ballPlacedShownSeq = -1;

  /** Render-ready ball, rewritten in place. */
  readonly ball: BallVisualState = { x: 0, z: 0, ownerId: null, placed: true };
  /** Ids that took the pitch this frame. Reused; read it before the next `update`. */
  readonly spawned: string[] = [];
  /** Ids that left the pitch this frame. Reused; read it before the next `update`. */
  readonly removed: string[] = [];

  constructor(engine: MatchEngine) {
    this.engine = engine;
    // Only what happens from now on is animated; the history before this view opened
    // has already been played out.
    this.cursor = engine.core.emittedCount;
    this.syncRoster();
    this.writeSample();
    this.renderT = this.newestTime;
    this.lastObservedT = this.newestTime;
    this.resolve();
  }

  /* ── Reading ─────────────────────────────────────────────────────────────── */

  /** Every player on the pitch, in no particular order. Iterate; do not keep. */
  get players(): readonly PlayerVisualRuntime[] {
    return this.list;
  }

  get(id: string): PlayerVisualRuntime | undefined {
    return this.byId.get(id);
  }

  /** Why an id left the pitch, if the engine said so. */
  reasonFor(id: string): RemovalReason | undefined {
    return this.reasons.get(id);
  }

  /** The simulation time being drawn. */
  get renderTime(): number {
    return this.renderT;
  }

  /** Simulation seconds the render clock moved this frame — what strides and actions advance by. */
  get renderDelta(): number {
    return this.delta;
  }

  /** Simulation time of the newest sample. */
  get newestTime(): number {
    return this.times[this.slot(this.newestSeq)] ?? 0;
  }

  /** How far the drawing runs behind the simulation, in simulation seconds. */
  get lag(): number {
    return this.newestTime - this.renderT;
  }

  /** The measured simulation rate: ~1, 2 or 4 while playing, ~0 while halted. */
  get simulationRate(): number {
    return this.rate;
  }

  /* ── The frame ───────────────────────────────────────────────────────────── */

  /**
   * Call once per render frame, from the one frame loop, with that frame's real
   * elapsed seconds. Allocates nothing unless the roster changed or events arrived.
   */
  update(realDelta: number): void {
    this.spawned.length = 0;
    this.removed.length = 0;

    this.syncRoster();
    this.readEvents();

    // A new sample whenever the engine's clock moved, or a placement happened while it
    // stood still (the half-time restart runs from a button, not from a step).
    if (this.engine.t !== this.newestTime || this.placementPending) this.writeSample();

    this.advanceClock(Math.max(0, realDelta));
    this.resolve();
  }

  /* ── Roster ──────────────────────────────────────────────────────────────── */

  private syncRoster(): void {
    const agents = this.engine.core.players;
    const stamp = ++this.stamp;
    const now = this.engine.t;
    let spawnedAny = false;

    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      if (!agent || agent.availability !== 'active') continue;
      let runtime = this.byId.get(agent.id);
      if (!runtime) {
        runtime = new Runtime(agent, now);
        this.fillRing(runtime);
        runtime.visual.heading = runtime.visual.facing = agent.facing;
        this.byId.set(agent.id, runtime);
        this.list.push(runtime);
        this.spawned.push(agent.id);
        spawnedAny = true;
      }
      runtime.stamp = stamp;
    }

    // Same count and nobody new means the same set of ids: nothing can have left.
    if (!spawnedAny && this.list.length === this.countActive(agents)) return;

    for (let index = this.list.length - 1; index >= 0; index -= 1) {
      const runtime = this.list[index];
      if (!runtime || runtime.stamp === stamp) continue;
      runtime.visual.active = false;
      this.list.splice(index, 1);
      this.byId.delete(runtime.id);
      this.removed.push(runtime.id);
      if (!this.reasons.has(runtime.id)) this.reasons.set(runtime.id, 'left');
    }
  }

  private countActive(agents: readonly PlayerAgent[]): number {
    let count = 0;
    for (const agent of agents) if (agent.availability === 'active') count += 1;
    return count;
  }

  /**
   * A player seen for the first time has no history, so every slot of their ring is
   * filled with where they are now — whatever the render clock asks for, they are
   * there, and nothing is inherited from whoever stood in that spot before.
   */
  private fillRing(runtime: Runtime): void {
    const agent = runtime.agent;
    const onBall = this.engine.core.ball.owner === agent.id;
    for (let slot = 0; slot < RING_SIZE; slot += 1) {
      this.writeAgent(runtime, slot, agent, onBall, FLAG_PLACED);
    }
    runtime.placedSeq = Math.max(0, this.newestSeq);
  }

  /* ── Events ──────────────────────────────────────────────────────────────── */

  private readEvents(): void {
    const core = this.engine.core;
    // Checked first: eventsSince() hands back a fresh array even when nothing is new.
    if (core.emittedCount === this.cursor) return;
    const fresh = core.eventsSince(this.cursor);
    this.cursor = core.emittedCount;
    for (const event of fresh) this.handleEvent(event);
  }

  private handleEvent(event: MatchSimEvent): void {
    const now = this.engine.t;
    switch (event.type) {
      case 'kickoff':
        this.placementPending = true;
        return;
      case 'pass':
        this.trigger(event.playerId, 'pass', now, 0, null, event.type);
        return;
      case 'receive':
        this.trigger(event.playerId, 'receive', now, 0, null, event.type);
        return;
      case 'interception':
        this.trigger(event.playerId, 'intercept', now, 0, null, event.type);
        return;
      case 'tackle': {
        // playerId is the DEFENDER who went in; secondaryPlayerId is the carrier.
        const outcome = event.detail?.outcome;
        this.trigger(event.playerId, 'tackle', now, 0, outcome === undefined ? null : String(outcome), event.type);
        return;
      }
      case 'shot':
        this.handleShot(event, now);
        return;
      case 'save': {
        const keeper = event.playerId ? this.byId.get(event.playerId) : undefined;
        const current = keeper?.visual.action;
        // Already diving for this one: the save is the end of that dive, not a new one.
        if (
          current &&
          (current.kind === 'save' || current.kind === 'catch') &&
          now - current.at < SAVE_MEMORY
        ) {
          return;
        }
        this.trigger(event.playerId, 'catch', now, 0, null, event.type);
        return;
      }
      case 'goal':
        this.handleGoal(event, now);
        return;
      case 'foul':
        this.trigger(event.playerId, 'foul', now, 0, null, event.type);
        return;
      case 'yellow_card':
        this.trigger(event.playerId, 'booked', now, 0, null, event.type);
        return;
      case 'red_card':
        if (event.playerId) this.reasons.set(event.playerId, 'sent_off');
        return;
      case 'substitution':
        // playerId came on, secondaryPlayerId went off.
        if (event.secondaryPlayerId) this.reasons.set(event.secondaryPlayerId, 'substituted');
        return;
      default:
        return;
    }
  }

  /**
   * The shooter strikes it. A shot the engine has put ON TARGET will be resolved
   * against the defending keeper, so that keeper is sent now — as the ball travels,
   * which way the flight is aimed — rather than when the save event lands with the
   * ball already there. Off target, the keeper watches it go.
   */
  private handleShot(event: MatchSimEvent, now: number): void {
    this.trigger(event.playerId, 'shoot', now, 0, null, event.type);
    if (!event.detail?.onTarget) return;

    const shooter = event.playerId ? this.byId.get(event.playerId) : undefined;
    const side = event.side ?? shooter?.visual.side;
    if (!side) return;
    const keeper = this.keeperOf(side === 'home' ? 'away' : 'home');
    if (!keeper) return;

    const flight = this.engine.ball.flight;
    const aimed =
      flight && flight.kind === 'shot' && flight.shooterId === event.playerId ? flight : null;
    const dir = aimed ? aimed.toY - keeper.agent.position2d.y : 0;
    const delay = aimed ? Math.min(SAVE_DELAY_MAX, aimed.duration * 0.4) : SAVE_DELAY_MAX * 0.5;
    this.trigger(
      keeper.id,
      Math.abs(dir) < CATCH_REACH ? 'catch' : 'save',
      now + delay,
      dir,
      null,
      event.type,
    );
  }

  private keeperOf(side: MatchSide): Runtime | undefined {
    for (const runtime of this.list) {
      if (runtime.visual.isKeeper && runtime.visual.side === side) return runtime;
    }
    return undefined;
  }

  /**
   * A goal: the scorer wheels away a beat after the ball crosses, and the teammates
   * near enough to join in follow, each a little later than the last and each with a
   * take of their own. Who, when and which take all come from the player's id and the
   * goal's number — the same match always celebrates the same way, and no two players
   * move in lockstep. The keeper stays in goal; the other side does nothing.
   */
  private handleGoal(event: MatchSimEvent, now: number): void {
    this.goalsSeen += 1;
    const goal = this.goalsSeen;
    const scorer = event.playerId ? this.byId.get(event.playerId) : undefined;
    this.trigger(event.playerId, 'celebrate', now + CELEBRATE_DELAY, 0, null, event.type, celebrationVariant(event.playerId ?? '', goal));
    if (!scorer) return;
    const side = scorer.visual.side;
    const from = scorer.agent.position2d;
    for (const mate of this.list) {
      if (mate === scorer || mate.visual.side !== side || mate.visual.isKeeper) continue;
      const at = mate.agent.position2d;
      if (Math.hypot(at.x - from.x, at.y - from.y) > CELEBRATE_JOIN_RADIUS) continue;
      const lag = CELEBRATE_JOIN_MIN + unit(`${mate.id}:goal${goal}:lag`) * CELEBRATE_JOIN_SPREAD;
      this.trigger(mate.id, 'celebrate', now + CELEBRATE_DELAY + lag, 0, null, event.type, celebrationVariant(mate.id, goal));
    }
  }

  private trigger(
    playerId: string | undefined,
    kind: PlayerVisualActionKind,
    at: number,
    dir: number,
    outcome: string | null,
    source: string,
    variant = 0,
  ): void {
    if (!playerId) return;
    const runtime = this.byId.get(playerId);
    if (!runtime) return;
    runtime.actionSeq += 1;
    const made: PlayerVisualAction = { kind, seq: runtime.actionSeq, at, dir, outcome, source, variant };
    if (kind === 'foul' || kind === 'booked') runtime.visual.discipline = made;
    else runtime.visual.action = made;
  }

  /* ── Sampling ────────────────────────────────────────────────────────────── */

  private slot(seq: number): number {
    return ((seq % RING_SIZE) + RING_SIZE) % RING_SIZE;
  }

  private writeAgent(
    runtime: Runtime,
    slot: number,
    agent: PlayerAgent,
    onBall: boolean,
    flags: number,
  ): void {
    const base = slot * FIELDS;
    const ring = runtime.ring;
    // Engine x (length) is world Z, engine y (width) is world X; the same swap turns
    // the engine's facing, atan2(vy, vx), into the world heading atan2(X, Z) as is.
    ring[base + F_X] = engineToWorldX(agent.position2d.y);
    ring[base + F_Z] = engineToWorldZ(agent.position2d.x);
    ring[base + F_VX] = agent.velocity.y;
    ring[base + F_VZ] = agent.velocity.x;
    ring[base + F_FACING] = agent.facing;
    ring[base + F_SPEED] = agent.speed;
    ring[base + F_STAMINA] = agent.stamina;
    ring[base + F_FLAGS] = flags | (onBall ? FLAG_ON_BALL : 0);
    runtime.states[slot] = agent.state;
    runtime.decisions[slot] = agent.decision;
  }

  private writeSample(): void {
    const t = this.engine.t;
    const hadSample = this.newestSeq >= 0;
    const previousSlot = hadSample ? this.slot(this.newestSeq) : 0;
    const previousTime = hadSample ? (this.times[previousSlot] ?? t) : t;
    // Same simulation time (a placement while the clock stood still): overwrite the
    // newest sample rather than add a second one at the same instant.
    const overwrite = hadSample && t <= previousTime;
    const gap = overwrite ? 0 : t - previousTime;
    if (!overwrite) {
      this.newestSeq += 1;
      this.sampleCount = Math.min(this.sampleCount + 1, RING_SIZE);
    }
    const slot = this.slot(this.newestSeq);
    this.times[slot] = t;

    const pending = this.placementPending || !hadSample;
    this.placementPending = false;
    const owner = this.engine.core.ball.owner;

    for (const runtime of this.list) {
      const agent = runtime.agent;
      let placed = pending;
      if (!placed) {
        const base = previousSlot * FIELDS;
        const moved = Math.hypot(
          engineToWorldX(agent.position2d.y) - (runtime.ring[base + F_X] ?? 0),
          engineToWorldZ(agent.position2d.x) - (runtime.ring[base + F_Z] ?? 0),
        );
        // Further than they can run in the simulated gap — the engine put them there.
        placed = moved > agent.topSpeed * gap + PLACEMENT_TOLERANCE;
      }
      this.writeAgent(runtime, slot, agent, owner === agent.id, placed ? FLAG_PLACED : 0);
      if (placed) runtime.placedSeq = this.newestSeq;
      runtime.lastSeenSimulationTime = t;
    }

    const ball = this.engine.core.ball;
    const bx = engineToWorldX(ball.position.y);
    const bz = engineToWorldZ(ball.position.x);
    let ballPlaced = pending;
    if (!ballPlaced) {
      const base = previousSlot * BALL_FIELDS;
      const moved = Math.hypot(bx - (this.ballRing[base + B_X] ?? 0), bz - (this.ballRing[base + B_Z] ?? 0));
      ballPlaced = moved > BALL_SPEED_BOUND * gap + PLACEMENT_TOLERANCE;
    }
    const ballBase = slot * BALL_FIELDS;
    this.ballRing[ballBase + B_X] = bx;
    this.ballRing[ballBase + B_Z] = bz;
    this.ballRing[ballBase + B_FLAGS] = ballPlaced ? FLAG_PLACED : 0;
    this.ballOwners[slot] = owner;
    if (ballPlaced) this.ballPlacedSeq = this.newestSeq;
  }

  /* ── Render clock ────────────────────────────────────────────────────────── */

  /**
   * Moves the render clock on, in simulation time.
   *
   * It advances at the measured simulation rate — how much simulated time arrived per
   * real second, eased — and is pulled gently towards "newest sample minus the lag",
   * so it neither drifts off nor runs into the newest sample and stalls. Nothing here
   * depends on which of the two frame loops ran first this frame.
   */
  private advanceClock(realDelta: number): void {
    const newest = this.newestTime;
    const oldestSeq = this.newestSeq - this.sampleCount + 1;
    const oldest = this.times[this.slot(oldestSeq)] ?? newest;

    if (realDelta > 0) {
      const instant = (newest - this.lastObservedT) / realDelta;
      this.rate += (instant - this.rate) * easeFactor(realDelta, RATE_TAU);
    }
    this.lastObservedT = newest;

    const lag = LAG_REAL * Math.max(1, this.rate);
    const target = newest - lag;
    const before = this.renderT;

    let next = before + realDelta * Math.max(0, this.rate);
    next += (target - next) * easeFactor(realDelta, CATCH_UP_TAU);
    // Far behind (a stalled tab, a very long frame): jump rather than fast-forward.
    if (newest - next > MAX_LAG) next = target;
    next = Math.min(Math.max(next, oldest), newest);
    // Time on screen never runs backwards.
    if (next < before) next = before;

    this.renderT = next;
    this.delta = next - before;
  }

  /* ── Resolving the frame ─────────────────────────────────────────────────── */

  private resolve(): void {
    // The two samples either side of the render clock. The same pair for everyone.
    const newestSlot = this.slot(this.newestSeq);
    let olderSeq = this.newestSeq;
    let newerSeq = this.newestSeq;
    let alpha = 1;

    if (this.renderT < (this.times[newestSlot] ?? 0)) {
      const oldestSeq = this.newestSeq - this.sampleCount + 1;
      olderSeq = oldestSeq;
      newerSeq = oldestSeq;
      alpha = 0;
      for (let seq = this.newestSeq - 1; seq >= oldestSeq; seq -= 1) {
        const time = this.times[this.slot(seq)] ?? 0;
        if (time <= this.renderT) {
          olderSeq = seq;
          newerSeq = seq + 1;
          const next = this.times[this.slot(newerSeq)] ?? time;
          alpha = next > time ? (this.renderT - time) / (next - time) : 1;
          break;
        }
      }
    }

    const olderSlot = this.slot(olderSeq);
    const newerSlot = this.slot(newerSeq);
    const smoothing = easeFactor(this.delta, HEADING_TAU);

    for (const runtime of this.list) {
      this.resolvePlayer(runtime, olderSlot, newerSlot, newerSeq, alpha, smoothing);
    }
    this.resolveBall(olderSlot, newerSlot, newerSeq, alpha);
  }

  private readSnapshot(runtime: Runtime, slot: number, out: PlayerSnapshot): void {
    const base = slot * FIELDS;
    const ring = runtime.ring;
    out.time = this.times[slot] ?? 0;
    out.x = ring[base + F_X] ?? 0;
    out.z = ring[base + F_Z] ?? 0;
    out.vx = ring[base + F_VX] ?? 0;
    out.vz = ring[base + F_VZ] ?? 0;
    out.facing = ring[base + F_FACING] ?? 0;
    out.speed = ring[base + F_SPEED] ?? 0;
    out.stamina = ring[base + F_STAMINA] ?? 1;
    out.onBall = ((ring[base + F_FLAGS] ?? 0) & FLAG_ON_BALL) !== 0;
    out.state = runtime.states[slot] ?? 'IDLE';
    out.decision = runtime.decisions[slot] ?? 'HOLD';
  }

  private resolvePlayer(
    runtime: Runtime,
    olderSlot: number,
    newerSlot: number,
    newerSeq: number,
    bracketAlpha: number,
    smoothing: number,
  ): void {
    const previous = runtime.previous;
    const current = runtime.current;
    this.readSnapshot(runtime, olderSlot, previous);
    this.readSnapshot(runtime, newerSlot, current);

    // Never draw a player part-way across a placement: they are simply at the new spot.
    const crossesPlacement = ((runtime.ring[newerSlot * FIELDS + F_FLAGS] ?? 0) & FLAG_PLACED) !== 0;
    const alpha = crossesPlacement ? 1 : bracketAlpha;

    const visual = runtime.visual;
    visual.position.x = lerp(previous.x, current.x, alpha);
    visual.position.z = lerp(previous.z, current.z, alpha);
    visual.velocity.x = lerp(previous.vx, current.vx, alpha);
    visual.velocity.z = lerp(previous.vz, current.vz, alpha);
    visual.speed = lerp(previous.speed, current.speed, alpha);
    visual.stamina = lerp(previous.stamina, current.stamina, alpha);
    visual.facing = lerpAngle(previous.facing, current.facing, alpha);

    // Discrete values come from whichever sample is nearer.
    const nearest = alpha < 0.5 ? previous : current;
    visual.state = nearest.state;
    visual.decision = nearest.decision;
    visual.onBall = nearest.onBall;

    visual.placed = runtime.placedSeq > runtime.placedShownSeq && newerSeq >= runtime.placedSeq;
    if (visual.placed) {
      runtime.placedShownSeq = runtime.placedSeq;
      visual.heading = visual.facing;
      runtime.headingFollows = false;
      // An action that had already started belongs to the play before the reset.
      const action = visual.action;
      if (action && action.at <= this.renderT) visual.action = null;
    } else {
      // Shortest way round, eased — never a snap. Standing, only past the deadband.
      const gap = shortestAngle(visual.heading, visual.facing);
      const slow = visual.speed < SLOW_SPEED;
      if (!slow) {
        runtime.headingFollows = true;
        runtime.headingTurn = 0;
      } else if (!runtime.headingFollows && Math.abs(gap) > STANDING_DEADBAND) {
        runtime.headingFollows = true;
        runtime.headingTurn = gap > 0 ? 1 : -1;
      } else if (runtime.headingFollows && runtime.headingTurn === 0) {
        // Slowed down mid-turn: carry on the way it was going.
        runtime.headingTurn = gap >= 0 ? 1 : -1;
      }
      if (runtime.headingFollows) {
        // A slow player's turn goes one way: if the facing swings back past the body,
        // it stops there rather than turning back, until the deadband is crossed again.
        const back = slow && gap * runtime.headingTurn < 0;
        if (!back) visual.heading += gap * smoothing;
        if (slow && (back || Math.abs(gap) < STANDING_SETTLED)) {
          runtime.headingFollows = false;
          runtime.headingTurn = 0;
        }
      }
    }
  }

  private resolveBall(olderSlot: number, newerSlot: number, newerSeq: number, bracketAlpha: number): void {
    const older = olderSlot * BALL_FIELDS;
    const newer = newerSlot * BALL_FIELDS;
    const crosses = ((this.ballRing[newer + B_FLAGS] ?? 0) & FLAG_PLACED) !== 0;
    const alpha = crosses ? 1 : bracketAlpha;
    this.ball.x = lerp(this.ballRing[older + B_X] ?? 0, this.ballRing[newer + B_X] ?? 0, alpha);
    this.ball.z = lerp(this.ballRing[older + B_Z] ?? 0, this.ballRing[newer + B_Z] ?? 0, alpha);
    this.ball.ownerId = (alpha < 0.5 ? this.ballOwners[olderSlot] : this.ballOwners[newerSlot]) ?? null;
    this.ball.placed = this.ballPlacedSeq > this.ballPlacedShownSeq && newerSeq >= this.ballPlacedSeq;
    if (this.ball.placed) this.ballPlacedShownSeq = this.ballPlacedSeq;
  }
}
