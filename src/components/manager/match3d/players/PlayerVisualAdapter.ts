import type { BallFlight, MatchEngine } from '@/features/manager/matchEngine';
import type {
  MatchSide,
  MatchSimEvent,
  MovementState,
  PlayerAgent,
  PlayerDecision,
} from '@/match-engine';
import { engineToWorldX, engineToWorldZ } from '../Match3DAdapter';
import { ACTION_METADATA, CELEBRATION_VARIANTS, type AnimationAction } from './FootballAnimationStateMachine';
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
/** How far from the keeper's body their hands meet a shot, metres (a stretched arm, not a full dive). */
const KEEPER_HANDS_M = 1.6;
/** The engine settles a shot on target once it is this close to the keeper (SAVE_REACH in match-engine/goalkeeper.ts, mirrored). */
const KEEPER_SAVE_REACH_M = 3.2;
/** With no flight to time it from, a keeper goes this long after the shot. Simulation seconds. */
const SAVE_DELAY_MAX = 0.28;

/**
 * How long after an action starts the foot (or the hands) meets the ball: the state
 * machine's own length and contact point for it, so body and ball share one clock.
 */
function contactLead(id: AnimationAction): number {
  const clip = ACTION_METADATA[id].clip;
  return clip.duration * (clip.ballContactTime ?? 0.5);
}
const LEAD = {
  pass: contactLead('PASS'),
  shoot: contactLead('SHOOT'),
  receive: contactLead('RECEIVE'),
  intercept: contactLead('INTERCEPTION'),
  tackle: contactLead('TACKLE'),
  dive: contactLead('GK_DIVE_LEFT'),
  catch: contactLead('GK_CATCH'),
} as const;
/**
 * The actions whose contact is heard, and how long into the action it lands. A dive or
 * gather is not here: whether the hands touch the ball is only known at the save.
 */
const CONTACT_SOUND: Partial<Record<PlayerVisualActionKind, readonly [SoundCueKind, number]>> = {
  pass: ['pass', LEAD.pass],
  shoot: ['shot', LEAD.shoot],
  receive: ['touch', LEAD.receive],
  intercept: ['touch', LEAD.intercept],
  tackle: ['tackle', LEAD.tackle],
};
/**
 * The drawn ball waits at the kicker's foot for the strike, but for no more than this
 * share of its flight — it then travels at most 2.5× its engine speed to arrive on time.
 */
const MAX_HOLD_SHARE = 0.6;
/**
 * The engine slows a loose ball exponentially: it keeps this share of its speed per
 * simulated second (FRICTION_PER_SECOND in match-engine/ball.ts — mirrored, not
 * imported, because the engine does not export it). A pass therefore takes longer
 * than distance ÷ launch speed, and the longer the pass the more so.
 */
const BALL_KEEPS_PER_SECOND = 0.32;
const LN_KEEPS = Math.log(BALL_KEEPS_PER_SECOND);

/**
 * Simulated seconds for a ball struck at `launchSpeed` to cover `distance` under that
 * friction. A ball that would stop short is given the time to where it stops.
 */
function travelTime(distance: number, launchSpeed: number): number {
  if (launchSpeed <= 1e-3) return 0;
  const left = 1 + (distance * LN_KEEPS) / launchSpeed;
  return Math.log(Math.max(left, 0.05)) / LN_KEEPS;
}
/**
 * The engine hands a pass to its receiver once the ball is this close (RECEIVE_RADIUS in
 * match-engine/MatchEngine.ts, mirrored), and the ball then reaches their foot within
 * about one engine step (it follows the foot at 14 m/s). So a pass reaches the foot
 * this much short of its target, a step later — measured: 0.035 s after the handover.
 */
const RECEIVE_RADIUS_M = 1.9;
const HANDOVER_TO_FOOT = 0.035;
/** A receive started at the pass and the engine's own receive event this close together are one touch. */
const RECEIVE_MEMORY = 0.6;
/**
 * The receiver's touch and the keeper's hands are not settled when the ball is struck:
 * the receiver runs to meet a pass, and a pass can die short of its target. So every
 * frame the ball's path is run forward (LOOKAHEAD simulated seconds, LOOKAHEAD_STEP at a
 * time) against where they are going, and the action is sent once its start is within
 * COMMIT_AHEAD of the drawn clock — by then the meeting is a fraction of a second away
 * and the forecast is close to exact.
 */
const LOOKAHEAD = 3;
const LOOKAHEAD_STEP = 0.02;
const COMMIT_AHEAD = 0.1;
/** Flights kept for drawing: the one in the air, and the one just before it. */
const MAX_WARPS = 3;
/**
 * Sound cues. A cue due this long ago (simulation seconds) is dropped rather than
 * played late — the drawing jumped, or nobody is listening.
 */
const CUE_STALE = 0.5;
/** A saved shot reaches the keeper's hands this long after the save (3.2 m at the shot's pace). */
const SAVE_TO_HANDS = 0.12;
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
  /** The flight being drawn, on the drawn timeline; null while the ball is at a foot or on the ground. */
  flight: DrawnFlight | null;
}

/**
 * A pass or shot as it is DRAWN: the engine's flight, re-timed so the ball leaves the
 * foot when the kick reaches it and still arrives when the engine says it arrives.
 */
/**
 * Something to be heard, at a moment on the DRAWN timeline: a foot or hands meeting the
 * ball, the referee, the crowd. The adapter only says what and when; whatever plays it
 * takes each cue as `renderTime` reaches it (`takeCue`).
 */
export type SoundCueKind =
  | 'pass'
  | 'shot'
  | 'touch'
  | 'tackle'
  | 'catch'
  | 'whistle'
  | 'whistle_kickoff'
  | 'whistle_half'
  | 'whistle_full'
  | 'goal'
  | 'save'
  | 'miss';

export interface SoundCue {
  kind: SoundCueKind;
  /** Simulation time it is heard at. */
  at: number;
  /** World position it comes from. */
  x: number;
  z: number;
  /** 0..1: how hard (a long ball is struck harder than a lay-off). */
  power: number;
}

export interface DrawnFlight {
  kind: 'pass' | 'shot';
  /** Engine coordinates of where it was struck and where it is going. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** A shot the engine had on target when it was struck. */
  onTarget: boolean;
  /** How long it is in the air, and how far into that the drawn ball is. Simulation seconds. */
  duration: number;
  elapsed: number;
}

/**
 * One struck ball on the drawn timeline. Until `kickT + hold` it stays at the foot
 * (the strike is still coming); from there it runs through the engine's own flight
 * fast enough to reach wherever the engine has it by `end`, and from then on is the
 * engine's ball again. Nothing about where the ball goes changes — only when, within
 * the flight, the drawing shows it.
 */
interface BallWarp {
  kickT: number;
  hold: number;
  end: number;
  holdX: number;
  holdZ: number;
  /** The engine's flight object, to see when it ends; null once it has. */
  engineFlight: BallFlight | null;
  drawn: DrawnFlight;
  /** A pass: who it is played to, and whether their receive has been sent. */
  receiverId: string | null;
  receiveSent: boolean;
  /** A shot on target: the keeper facing it, which way, and whether they have been sent. */
  keeperId: string | null;
  keeperDir: number;
  keeperGathers: boolean;
  keeperSent: boolean;
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
  /** When a receive started at the pass expects the ball, so the engine's own event does not start a second. */
  predictedReceive = -Infinity;
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
  /** Struck balls still being drawn, oldest first. */
  private readonly warps: BallWarp[] = [];
  /** Sound cues not yet heard, in the order they are due. */
  private readonly cues: SoundCue[] = [];

  /** Render-ready ball, rewritten in place. */
  readonly ball: BallVisualState = { x: 0, z: 0, ownerId: null, placed: true, flight: null };
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

  /**
   * The next sound cue that is due on the drawn timeline, or null when none is. Call
   * until it returns null, once per frame after `update`.
   */
  takeCue(): SoundCue | null {
    while (this.cues.length > 0) {
      const first = this.cues[0]!;
      if (first.at > this.renderT) return null;
      this.cues.shift();
      if (first.at >= this.renderT - CUE_STALE) return first;
    }
    return null;
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
    this.closeWarps();
    this.anticipate();

    // A new sample whenever the engine's clock moved, or a placement happened while it
    // stood still (the half-time restart runs from a button, not from a step).
    if (this.engine.t !== this.newestTime || this.placementPending) this.writeSample();

    this.advanceClock(Math.max(0, realDelta));
    this.resolve();
    // Cues nobody took in time are gone for good.
    while (this.cues.length > 0 && this.cues[0]!.at < this.renderT - CUE_STALE) this.cues.shift();
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
        this.cueAtBall('whistle_kickoff', this.eventTime());
        return;
      case 'half_time':
      case 'fulltime':
        // The engine stops here, and so will the drawn clock, a little short of it:
        // the whistle goes now rather than at a moment the drawing never reaches.
        this.cueAtBall(event.type === 'fulltime' ? 'whistle_full' : 'whistle_half', this.renderT);
        return;
      case 'pass':
        this.handlePass(event);
        return;
      case 'receive': {
        const receiver = event.playerId ? this.byId.get(event.playerId) : undefined;
        const at = this.eventTime();
        // Whatever pass was still waiting on this touch has it now.
        for (const warp of this.warps) if (warp.receiverId === event.playerId) warp.receiveSent = true;
        // Already reaching for it: the receive was sent as the ball closed in.
        if (receiver && Math.abs(receiver.predictedReceive - at) < RECEIVE_MEMORY) return;
        this.trigger(event.playerId, 'receive', this.startFor(at, LEAD.receive), 0, null, event.type);
        return;
      }
      case 'interception':
        this.trigger(event.playerId, 'intercept', this.startFor(this.eventTime(), LEAD.intercept), 0, null, event.type);
        return;
      case 'tackle': {
        // playerId is the DEFENDER who went in; secondaryPlayerId is the carrier.
        const outcome = event.detail?.outcome;
        this.trigger(
          event.playerId,
          'tackle',
          this.startFor(this.eventTime(), LEAD.tackle),
          0,
          outcome === undefined ? null : String(outcome),
          event.type,
        );
        return;
      }
      case 'shot':
        this.handleShot(event, now);
        return;
      case 'save': {
        this.cueAtBall('catch', this.eventTime() + SAVE_TO_HANDS);
        this.cueAtBall('save', this.eventTime() + SAVE_TO_HANDS);
        // The shot saved before its dive was sent: the dive goes now, the way it was aimed.
        const pending = this.warps.find((warp) => warp.keeperId === event.playerId && !warp.keeperSent);
        if (pending) {
          this.sendKeeper(pending, this.eventTime());
          return;
        }
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
        this.trigger(event.playerId, 'catch', this.startFor(this.eventTime(), LEAD.catch), 0, null, event.type);
        return;
      }
      case 'goal':
        this.cueAtBall('goal', this.eventTime());
        this.handleGoal(event, now);
        return;
      case 'foul':
        this.cueAtBall('whistle', this.eventTime());
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
   * The engine's clock when an event happened. Events carry no time of their own, and
   * several engine steps can run in one frame (x4), so this is the middle of the steps
   * this frame ran — within half a frame either way.
   */
  private eventTime(): number {
    return (this.newestTime + this.engine.t) / 2;
  }

  /**
   * When an action should start so its contact lands at `contact` on the drawn
   * timeline: `lead` before it — but never in the drawn past, where it would begin
   * part-way through.
   */
  private startFor(contact: number, lead: number): number {
    return Math.max(this.renderT, contact - lead);
  }

  /**
   * A pass or a shot is struck. The engine's flight says exactly when (its own elapsed
   * time), so the kick is started early enough for the foot to reach the ball at that
   * moment. What the drawing is already too late to show — it runs only a fraction of
   * a second behind the engine — the ball makes up: it waits at the foot until the
   * strike reaches it, then travels a little faster, and arrives when the engine says.
   */
  private strike(
    event: MatchSimEvent,
    kind: 'pass' | 'shoot',
  ): { flight: BallFlight; kickT: number; launch: number; warp: BallWarp } | null {
    const live = this.engine.ball.flight;
    const own =
      live && live.shooterId === event.playerId && live.kind === (kind === 'pass' ? 'pass' : 'shot') ? live : null;
    const lead = kind === 'pass' ? LEAD.pass : LEAD.shoot;
    const kickT = own ? this.engine.t - own.elapsed : this.eventTime();
    const at = this.startFor(kickT, lead);
    // Struck harder the further it has to go; a shot is always struck hard.
    const power = kind === 'shoot' ? 1 : own ? Math.min(1, Math.max(0.3, Math.hypot(own.toX - own.fromX, own.toY - own.fromY) / 40)) : 0.5;
    this.trigger(event.playerId, kind, at, 0, null, event.type, 0, power);
    if (!own) return null;
    // The speed it left the foot at: the engine's speed now, wound back through the friction.
    const velocity = this.engine.core.ball.velocity;
    const launch = Math.hypot(velocity.x, velocity.y) / Math.pow(BALL_KEEPS_PER_SECOND, own.elapsed);
    // A pass ends when it is handed to the receiver, short of its target; a shot at the line.
    const reach = Math.max(0, Math.hypot(own.toX - own.fromX, own.toY - own.fromY) - (own.kind === 'pass' ? RECEIVE_RADIUS_M : 0));
    const duration = launch > 0 ? travelTime(reach, launch) : own.duration;
    const warp = this.beginWarp(own, kickT, at + lead - kickT, duration);
    return { flight: own, kickT, launch, warp };
  }

  /**
   * A pass: struck now. The player it is played to is watched from here on
   * (`anticipate`), and starts to receive it so their foot meets the ball as it
   * arrives — not when the engine's receive event lands with the ball already there.
   */
  private handlePass(event: MatchSimEvent): void {
    const struck = this.strike(event, 'pass');
    if (!struck || !struck.flight.receiverId) return;
    struck.warp.receiverId = struck.flight.receiverId;
  }

  /**
   * The shooter strikes it. A shot the engine has put ON TARGET will be resolved
   * against the defending keeper, so that keeper is marked to go as the ball closes in
   * (`anticipate`), timed so the hands reach the line of the ball as the ball reaches
   * the keeper. Off target, the keeper watches it go.
   */
  private handleShot(event: MatchSimEvent, now: number): void {
    const struck = this.strike(event, 'shoot');
    if (!event.detail?.onTarget) return;

    const shooter = event.playerId ? this.byId.get(event.playerId) : undefined;
    const side = event.side ?? shooter?.visual.side;
    if (!side) return;
    const keeper = this.keeperOf(side === 'home' ? 'away' : 'home');
    if (!keeper) return;

    if (!struck) {
      // No flight to follow: the keeper goes half-way into the usual reaction window.
      this.trigger(keeper.id, 'catch', now + SAVE_DELAY_MAX * 0.5, 0, null, event.type);
      return;
    }
    const dir = struck.flight.toY - keeper.agent.position2d.y;
    struck.warp.keeperId = keeper.id;
    struck.warp.keeperDir = dir;
    struck.warp.keeperGathers = Math.abs(dir) < CATCH_REACH;
  }

  /* ── The drawn ball ──────────────────────────────────────────────────────── */

  private beginWarp(flight: BallFlight, kickT: number, wait: number, duration: number): BallWarp {
    const hold = Math.min(Math.max(0, wait), duration * MAX_HOLD_SHARE);
    if (this.warps.length >= MAX_WARPS) this.warps.shift();
    const warp: BallWarp = {
      kickT,
      hold,
      end: kickT + duration,
      holdX: engineToWorldX(flight.fromY),
      holdZ: engineToWorldZ(flight.fromX),
      engineFlight: flight,
      drawn: {
        kind: flight.kind,
        fromX: flight.fromX,
        fromY: flight.fromY,
        toX: flight.toX,
        toY: flight.toY,
        onTarget: flight.kind === 'shot' && flight.outcome !== 'miss',
        duration,
        elapsed: 0,
      },
      receiverId: null,
      receiveSent: false,
      keeperId: null,
      keeperDir: 0,
      keeperGathers: false,
      keeperSent: false,
    };
    this.warps.push(warp);
    return warp;
  }

  /**
   * A flight the engine has finished — collected, cut out, saved, over the line —
   * ends there on the drawn timeline too, however long it was expected to take. A
   * keeper still waiting on it goes now (a goal gives no save event to send them).
   */
  private closeWarps(): void {
    const live = this.engine.ball.flight;
    for (const warp of this.warps) {
      if (warp.engineFlight === null || warp.engineFlight === live) continue;
      // The engine has written how it ended onto the flight it let go of.
      const finished = warp.engineFlight;
      warp.engineFlight = null;
      const ended = Math.max(warp.kickT, this.eventTime());
      if (ended < warp.end) {
        warp.end = ended;
        warp.hold = Math.min(warp.hold, (ended - warp.kickT) * MAX_HOLD_SHARE);
      }
      warp.drawn.duration = Math.max(1e-3, ended - warp.kickT);
      // Wide or over: the crowd groans as it goes.
      if (finished.kind === 'shot' && finished.outcome === 'miss') this.cueAtBall('miss', ended);
      if (warp.keeperId && !warp.keeperSent) this.sendKeeper(warp, ended);
      // An interception or a loose ball: the receive the pass was waiting on never comes.
      warp.receiveSent = true;
    }
  }

  /**
   * Each frame, while the engine's flight is in the air: when it will reach the player
   * it is played to (or the keeper facing it), from where the ball and that player are
   * now and where they are heading. The flight's drawn length follows the forecast, and
   * the action is sent once it is due to start within COMMIT_AHEAD.
   */
  private anticipate(): void {
    const live = this.engine.ball.flight;
    if (!live) return;
    let warp: BallWarp | null = null;
    for (const candidate of this.warps) if (candidate.engineFlight === live) warp = candidate;
    if (!warp) return;
    const due = Math.max(COMMIT_AHEAD, 2 * this.delta);
    const t = this.engine.t;
    // A shot's drawn length: to the line, from where it is now.
    if (live.kind === 'shot') {
      warp.drawn.duration = Math.max(warp.drawn.elapsed, t + this.passTime(live, live.toX, live.toY) - warp.kickT);
    }

    if (warp.receiverId && !warp.receiveSent) {
      const receiver = this.byId.get(warp.receiverId);
      const meet = receiver ? this.meetTime(receiver.agent, RECEIVE_RADIUS_M) : null;
      if (!receiver) warp.receiveSent = true;
      else if (meet !== null) {
        warp.drawn.duration = Math.max(warp.drawn.elapsed, t + meet - warp.kickT);
        // The engine ends the flight at the handover, and the drawing catches up to it
        // there (closeWarps), so the drawn and engine arrivals agree.
        const arrives = t + meet + HANDOVER_TO_FOOT;
        const start = arrives - LEAD.receive;
        if (start - this.renderT <= due) {
          warp.receiveSent = true;
          receiver.predictedReceive = arrives;
          this.trigger(receiver.id, 'receive', Math.max(this.renderT, start), 0, null, 'pass');
        }
      }
    }

    if (warp.keeperId && !warp.keeperSent) {
      const keeper = this.byId.get(warp.keeperId);
      if (!keeper) {
        warp.keeperSent = true;
        return;
      }
      // Into the keeper's reach if it comes that close, else past them.
      const reaches =
        t + (this.meetTime(keeper.agent, KEEPER_HANDS_M) ?? this.passTime(live, keeper.agent.position2d.x, keeper.agent.position2d.y));
      const lead = warp.keeperGathers ? LEAD.catch : LEAD.dive;
      // A save ends the flight when the ball comes within the keeper's save reach, and
      // the drawing catches up there; a goal does not, and the drawn ball is still
      // running behind. Timed for the save — most shots on target are saved.
      const saveAt = this.meetTime(keeper.agent, KEEPER_SAVE_REACH_M);
      const contact = this.drawnTime(warp, reaches, saveAt === null ? warp.end : Math.min(warp.end, t + saveAt));
      if (contact - lead - this.renderT <= due) this.sendKeeper(warp, contact);
    }
  }

  /**
   * When the drawing shows the ball where the engine has it at `t`. While the strike
   * is being waited for and made up, the drawn ball runs behind the engine's; from
   * `end` (the flight's drawn catch-up point) on they agree.
   */
  private drawnTime(warp: BallWarp, t: number, end: number): number {
    const span = end - warp.kickT;
    if (t >= end || span <= 1e-6) return t;
    const hold = Math.min(warp.hold, span * MAX_HOLD_SHARE);
    return warp.kickT + hold + ((t - warp.kickT) * (span - hold)) / span;
  }

  /** The keeper facing `warp`'s shot goes, hands meeting the ball at `contact`. */
  private sendKeeper(warp: BallWarp, contact: number): void {
    warp.keeperSent = true;
    if (!warp.keeperId) return;
    const lead = warp.keeperGathers ? LEAD.catch : LEAD.dive;
    this.trigger(warp.keeperId, warp.keeperGathers ? 'catch' : 'save', this.startFor(contact, lead), warp.keeperDir, null, 'shot');
  }

  /**
   * Simulated seconds until the loose ball comes within `radius` of `agent`, the ball
   * slowing under the engine's friction and the player carrying on as they are moving.
   * Null if that does not happen within LOOKAHEAD.
   */
  private meetTime(agent: PlayerAgent, radius: number): number | null {
    const ball = this.engine.core.ball;
    let bx = ball.position.x;
    let by = ball.position.y;
    let vx = ball.velocity.x;
    let vy = ball.velocity.y;
    let px = agent.position2d.x;
    let py = agent.position2d.y;
    const keep = Math.pow(BALL_KEEPS_PER_SECOND, LOOKAHEAD_STEP);
    for (let s = 0; s <= LOOKAHEAD; s += LOOKAHEAD_STEP) {
      if (Math.hypot(bx - px, by - py) <= radius) return s;
      bx += vx * LOOKAHEAD_STEP;
      by += vy * LOOKAHEAD_STEP;
      vx *= keep;
      vy *= keep;
      px += agent.velocity.x * LOOKAHEAD_STEP;
      py += agent.velocity.y * LOOKAHEAD_STEP;
    }
    return null;
  }

  /**
   * Simulated seconds until a shot passes (x, y): until the ball, slowing under
   * friction, reaches the point on its line that stands square to it.
   */
  private passTime(flight: BallFlight, x: number, y: number): number {
    const ball = this.engine.core.ball;
    const lineX = flight.toX - flight.fromX;
    const lineY = flight.toY - flight.fromY;
    const length = Math.max(1e-3, Math.hypot(lineX, lineY));
    const target = Math.min(length, ((x - flight.fromX) * lineX + (y - flight.fromY) * lineY) / length);
    const done = ((ball.position.x - flight.fromX) * lineX + (ball.position.y - flight.fromY) * lineY) / length;
    const left = Math.max(0, target - done);
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    return travelTime(left, speed);
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
    power = 0.6,
  ): void {
    if (!playerId) return;
    const runtime = this.byId.get(playerId);
    if (!runtime) return;
    runtime.actionSeq += 1;
    const made: PlayerVisualAction = { kind, seq: runtime.actionSeq, at, dir, outcome, source, variant };
    if (kind === 'foul' || kind === 'booked') runtime.visual.discipline = made;
    else runtime.visual.action = made;
    // The foot meets the ball when the action says it does, and that is when it is heard.
    const sound = CONTACT_SOUND[kind];
    if (sound) this.cueAt(sound[0], at + sound[1], runtime.agent.position2d.x, runtime.agent.position2d.y, power);
  }

  /** Queues a sound at simulation time `at`, from engine position (ex, ey). */
  private cueAt(kind: SoundCueKind, at: number, ex: number, ey: number, power = 1): void {
    const cue: SoundCue = { kind, at, x: engineToWorldX(ey), z: engineToWorldZ(ex), power };
    let index = this.cues.length;
    while (index > 0 && this.cues[index - 1]!.at > at) index -= 1;
    this.cues.splice(index, 0, cue);
  }

  /** Queues a sound where the ball is. */
  private cueAtBall(kind: SoundCueKind, at: number, power = 1): void {
    const ball = this.engine.core.ball.position;
    this.cueAt(kind, at, ball.x, ball.y, power);
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

    // A struck ball in the air on the drawn timeline: shown where the re-timed flight has it.
    this.ball.flight = null;
    if (this.ball.placed) {
      this.warps.length = 0;
      return;
    }
    // Drawn to its end: the engine has finished with it and the drawing has caught up.
    while (this.warps.length > 0) {
      const first = this.warps[0]!;
      if (first.engineFlight !== null || this.renderT < Math.max(first.end, first.kickT + first.drawn.duration)) break;
      this.warps.shift();
    }
    let warp: BallWarp | null = null;
    for (const candidate of this.warps) if (candidate.kickT <= this.renderT) warp = candidate;
    if (!warp) return;
    const since = this.renderT - warp.kickT;
    let at = warp.kickT;
    if (since < warp.hold) {
      // The strike has not reached it yet: it is still at the foot.
      this.ball.x = warp.holdX;
      this.ball.z = warp.holdZ;
    } else if (this.renderT >= warp.end) {
      // Caught up, still in the air: the engine's ball as it is.
      at = this.renderT;
    } else {
      const span = warp.end - warp.kickT;
      at = warp.kickT + ((since - warp.hold) * span) / Math.max(1e-6, span - warp.hold);
      this.ballAt(at);
    }
    warp.drawn.elapsed = at - warp.kickT;
    this.ball.flight = warp.drawn;
  }

  /** The engine's ball at simulation time `t`, from the ring, into `this.ball`. */
  private ballAt(t: number): void {
    const oldestSeq = this.newestSeq - this.sampleCount + 1;
    let olderSeq = oldestSeq;
    let newerSeq = oldestSeq;
    let alpha = 0;
    if (t >= (this.times[this.slot(this.newestSeq)] ?? 0)) {
      olderSeq = newerSeq = this.newestSeq;
    } else {
      for (let seq = this.newestSeq - 1; seq >= oldestSeq; seq -= 1) {
        const time = this.times[this.slot(seq)] ?? 0;
        if (time <= t) {
          olderSeq = seq;
          newerSeq = seq + 1;
          const next = this.times[this.slot(newerSeq)] ?? time;
          alpha = next > time ? (t - time) / (next - time) : 1;
          break;
        }
      }
    }
    const older = this.slot(olderSeq) * BALL_FIELDS;
    const newer = this.slot(newerSeq) * BALL_FIELDS;
    this.ball.x = lerp(this.ballRing[older + B_X] ?? 0, this.ballRing[newer + B_X] ?? 0, alpha);
    this.ball.z = lerp(this.ballRing[older + B_Z] ?? 0, this.ballRing[newer + B_Z] ?? 0, alpha);
  }
}
