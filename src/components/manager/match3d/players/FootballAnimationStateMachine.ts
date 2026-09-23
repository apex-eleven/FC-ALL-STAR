import type { MovementState } from '@/match-engine';
import type { PlayerVisualActionKind, PlayerVisualState } from './PlayerVisualAdapter';
import { shortestAngle } from './visualMath';

/**
 * The football animation state machine: visual data in, animation command out.
 *
 * PURE and deterministic — no React, no three, no DOM, no clock of its own. Time is
 * always handed in: the same previous state, the same `PlayerVisualState`, the same
 * time and delta give the same command. One instance per player, keyed by that
 * player's id by whoever owns it; it keeps its own small runtime state and writes one
 * reused `AnimationCommand`, so twenty-two of them allocate nothing per frame.
 *
 *   PlayerVisualAdapter   simulation → visual data and resolved actions
 *   this                  visual data → which animation, how far in, how fast
 *   Player3D / (STEP 6)   command → joint angles today, AnimationMixer later
 *
 * Two layers, never merged:
 *
 *   BASE LOCOMOTION   IDLE · WALK · JOG · RUN · SPRINT · GK_READY
 *                     chosen from the ENGINE'S speed with hysteresis, always running
 *   ONE-SHOT ACTION   PASS · RECEIVE · INTERCEPTION · SHOOT · TACKLE · CELEBRATE ·
 *                     GK_DIVE_LEFT · GK_DIVE_RIGHT · GK_CATCH
 *                     started once per adapter action (by its `seq`), layered over
 *                     the locomotion with a weight, then handed back to it
 *
 * So a player passing on the run is RUN + PASS, never "in PASS".
 *
 * Nothing here moves a player. Position and speed stay the engine's; the machine only
 * decides how the body that the engine is moving should look while it moves.
 *
 * Deferred on purpose, because the engine does not publish what they would need:
 *   - TURN_LEFT / TURN_RIGHT: turning stays procedural; `facing.turnRate` is exposed.
 *   - BACKPEDAL / STRAFE: engine facing always follows velocity above 0.35 m/s, so
 *     there is no authoritative "moving one way, facing another" to animate.
 *   - DRIBBLE / BALL_CONTROL: there is no per-touch signal. ON_BALL uses normal
 *     locomotion; `onBall` is passed through for when one exists.
 */

/* ── States ─────────────────────────────────────────────────────────────────── */

export type LocomotionState = 'IDLE' | 'WALK' | 'JOG' | 'RUN' | 'SPRINT' | 'GK_READY';

export type AnimationAction =
  | 'PASS'
  | 'RECEIVE'
  | 'INTERCEPTION'
  | 'SHOOT'
  | 'TACKLE'
  | 'CELEBRATE'
  | 'GK_DIVE_LEFT'
  | 'GK_DIVE_RIGHT'
  | 'GK_CATCH';

export type AnimationClipId = LocomotionState | AnimationAction;

/* ── Clip contract (STEP 6 fills these from authored clips) ─────────────────── */

/**
 * What an animation clip must declare so it can be driven without foot sliding.
 * Times are normalised 0..1 over the clip. The locomotion numbers below are
 * PLACEHOLDERS derived from the current procedural gait, so the procedural body
 * moves exactly as it did; authored clips replace them with measured values.
 */
export interface AnimationClipMetadata {
  id: AnimationClipId;
  /** Seconds, at playback rate 1. For locomotion, one full two-step cycle. */
  duration: number;
  loop: boolean;
  /** Ground covered per cycle at playback rate 1, metres. 0 for on-the-spot clips. */
  strideMeters: number;
  /** Normalised times the left and right foot plant. Loops start at left-foot contact. */
  footContacts?: readonly [left: number, right: number];
  /** Normalised time the foot or hands meet the ball. */
  ballContactTime?: number;
}

/** Everything a one-shot action needs beyond its clip. */
export interface ActionMetadata {
  clip: AnimationClipMetadata;
  /** Higher interrupts lower. */
  priority: number;
  /** Normalised time after which anything may interrupt it — the recovery tail. */
  interruptibleAfter: number;
  /** Normalised ease-in and ease-out lengths of the action's weight. */
  blendIn: number;
  blendOut: number;
  /** The pose owns the head; the renderer should not turn it to watch the ball. */
  holdsHead: boolean;
  /** Only a goalkeeper may play it. */
  keeperOnly: boolean;
  /** The renderer should turn the body to the camera while it plays. */
  facesCamera: boolean;
  /**
   * Not tied to a ball contact, so if something more important is still playing it
   * waits its turn (until its own length has passed) instead of being dropped. A pass
   * or a tackle shown late would be worse than not shown, so those never wait.
   */
  waitsForTurn: boolean;
}

/** Placeholder stride model: the procedural gait's own cycle length at a given speed. */
function proceduralStride(speed: number): number {
  return 1.5 + Math.min(speed / EFFORT_FULL_SPEED, 1) * 1.8;
}

/** Speed at which "effort" reads as flat out, m/s. The procedural stride's scale. */
const EFFORT_FULL_SPEED = 8;

function locomotionClip(
  id: LocomotionState,
  referenceSpeed: number,
  idleDuration = 0,
): AnimationClipMetadata {
  if (referenceSpeed <= 0) return { id, duration: idleDuration, loop: true, strideMeters: 0 };
  const strideMeters = proceduralStride(referenceSpeed);
  return {
    id,
    duration: strideMeters / referenceSpeed,
    loop: true,
    strideMeters,
    footContacts: [0, 0.5],
  };
}

/**
 * The standing loop's length: the procedural idle sways at 0.9 rad/s of stride
 * phase, i.e. one breath cycle every 2π / 0.9 ≈ 7 s.
 */
const IDLE_LOOP_SECONDS = (Math.PI * 2) / 0.9;

/** Reference speeds sit mid-band — what the clip is authored at. */
export const LOCOMOTION_CLIPS: Readonly<Record<LocomotionState, AnimationClipMetadata>> = {
  IDLE: locomotionClip('IDLE', 0, IDLE_LOOP_SECONDS),
  GK_READY: locomotionClip('GK_READY', 0, IDLE_LOOP_SECONDS),
  WALK: locomotionClip('WALK', 1.2),
  JOG: locomotionClip('JOG', 2.8),
  RUN: locomotionClip('RUN', 4.9),
  SPRINT: locomotionClip('SPRINT', 6.9),
};

function actionMeta(
  id: AnimationAction,
  duration: number,
  priority: number,
  interruptibleAfter: number,
  extra: Partial<Omit<ActionMetadata, 'clip' | 'priority' | 'interruptibleAfter'>> & {
    ballContactTime?: number;
  } = {},
): ActionMetadata {
  return {
    clip: { id, duration, loop: false, strideMeters: 0, ballContactTime: extra.ballContactTime },
    priority,
    interruptibleAfter,
    blendIn: extra.blendIn ?? 0.12,
    blendOut: extra.blendOut ?? 0.18,
    holdsHead: extra.holdsHead ?? false,
    keeperOnly: extra.keeperOnly ?? false,
    facesCamera: extra.facesCamera ?? false,
    waitsForTurn: extra.waitsForTurn ?? false,
  };
}

/**
 * Durations are the procedural poses' own (AnimationController), which were fitted to
 * the engine's rhythm — a pass at 0.5 s fits between the engine's decisions, and the
 * celebration's 2.0 s fits inside the 2.6 s the engine holds play after a goal.
 * Ball contact is where the pose's kick swing passes through the ball (0.3 → 0.62,
 * through the middle), the tackle's reach peaks at 0.4, the catch gathers at 0.45.
 *
 * Priority follows the brief after checking the engine's sequences: a keeper's dive
 * is never cut short; a tackle beats the pass the winner may play the same instant;
 * a shot beats a pass; receiving is the least committed movement; a celebration
 * yields to anything (nothing else happens in the dead ball it plays in).
 */
export const ACTION_METADATA: Readonly<Record<AnimationAction, ActionMetadata>> = {
  GK_DIVE_LEFT: actionMeta('GK_DIVE_LEFT', 0.85, 6, 0.7, { holdsHead: true, keeperOnly: true, ballContactTime: 0.5 }),
  GK_DIVE_RIGHT: actionMeta('GK_DIVE_RIGHT', 0.85, 6, 0.7, { holdsHead: true, keeperOnly: true, ballContactTime: 0.5 }),
  GK_CATCH: actionMeta('GK_CATCH', 0.7, 6, 0.6, { holdsHead: true, keeperOnly: true, ballContactTime: 0.45 }),
  TACKLE: actionMeta('TACKLE', 0.75, 5, 0.6, { ballContactTime: 0.4 }),
  SHOOT: actionMeta('SHOOT', 0.62, 4, 0.62, { ballContactTime: 0.46 }),
  PASS: actionMeta('PASS', 0.5, 3, 0.62, { ballContactTime: 0.46 }),
  RECEIVE: actionMeta('RECEIVE', 0.55, 2, 0.5, { ballContactTime: 0.5 }),
  INTERCEPTION: actionMeta('INTERCEPTION', 0.55, 1, 0.5, { ballContactTime: 0.5 }),
  // A close-range goal lands while the SHOOT is still early; the celebration waits.
  CELEBRATE: actionMeta('CELEBRATE', 2.0, 0, 0, { holdsHead: true, facesCamera: true, waitsForTurn: true }),
};

/* ── Speed bands ────────────────────────────────────────────────────────────── */

/**
 * Speed bands, m/s, checked against the running engine (four full matches, 150k
 * samples): with these bands players spend ~7% IDLE, 31% WALK, 31% JOG, 26% RUN and
 * 5% SPRINT; flat-out states (MOVING_TO_BALL, PRESSING) sit at a median of 6.0–6.3.
 *
 * Each boundary has an UP threshold (to enter the faster band) and a lower DOWN
 * threshold (to fall back out of it), 0.4 m/s apart except at a standstill. Between
 * them the current band holds, so speed wobbling around a boundary cannot flip the
 * animation.
 *
 *   boundary          nominal   up      down
 *   IDLE ↔ WALK        0.15    0.40    0.15   (0.35 down when the engine says IDLE)
 *   WALK ↔ JOG         1.8     2.0     1.6
 *   JOG  ↔ RUN         3.8     3.9     3.5
 *   RUN  ↔ SPRINT      6.0*    +0.1    −0.3
 *
 * * Capped at 90% of the player's own engine top speed (5.4–7.8 m/s), so a slow
 *   player running flat out still reads as a sprint: 7.8 → 6.0, 5.4 → 4.86.
 *
 * The band is chosen from the engine's speed eased over BAND_SPEED_TAU. The engine
 * accelerates at up to 11 m/s², so a defender can go 1 → 5 → 0.5 → 5.5 m/s inside
 * 2.5 s, and a shuffling player alternates 1.0 / 1.5 m/s every step; unfiltered, that
 * changed state every 0.27 s. The easing only decides WHICH clip — playback rate,
 * effort and gait phase all use the instantaneous engine speed, so the feet still
 * match the ground exactly.
 */
const IDLE_UP = 0.4;
const IDLE_DOWN = 0.15;
/** The engine's IDLE means "arrived at my mark": settle into the standing loop sooner. */
const IDLE_DOWN_SETTLING = 0.35;
const WALK_UP = 2.0;
const WALK_DOWN = 1.6;
const RUN_UP = 3.9;
const RUN_DOWN = 3.5;
/** Easing of the speed the band is chosen from, simulation seconds. */
const BAND_SPEED_TAU = 0.25;
const SPRINT_NOMINAL = 6.0;
const SPRINT_TOP_SHARE = 0.9;
const SPRINT_UP_MARGIN = 0.1;
const SPRINT_DOWN_MARGIN = 0.3;
/**
 * A band held for less than this (simulation seconds) cannot step to a neighbour —
 * a second guard against chatter. A jump of two or more bands is never held back.
 */
const MIN_BAND_HOLD = 0.25;
/** Locomotion crossfade length, simulation seconds. */
const LOCOMOTION_CROSSFADE = 0.2;
/** Playback-rate clamp for moving clips. */
const RATE_MIN = 0.5;
const RATE_MAX = 1.6;
/** Where the running cycle count wraps. Even, see `AnimationCommand.locomotion.cycle`. */
const CYCLE_WRAP = 1024;
/** How quickly the exposed turn rate follows the heading, per simulation second. */
const TURN_RATE_EASE = 8;

/** Band order, slowest first. GK_READY stands in for IDLE and WALK on a keeper. */
const BANDS: readonly LocomotionState[] = ['IDLE', 'WALK', 'JOG', 'RUN', 'SPRINT'];

/**
 * How each engine movement state is drawn. Every state is listed, so a new engine
 * state is a compile error here rather than a silent default.
 *
 *   'speed'   — locomotion purely from the engine's speed
 *   'settle'  — the engine says they have arrived: speed still decides (a player
 *               decelerating onto a mark is still stepping), but the standing loop is
 *               entered at walking-pace rather than dead stop
 */
const MOVEMENT_STATE_LOCOMOTION: Readonly<Record<MovementState, 'speed' | 'settle'>> = {
  IDLE: 'settle',
  POSITIONING: 'speed',
  MOVING_TO_BALL: 'speed',
  SUPPORT: 'speed',
  DEFENDING: 'speed',
  ATTACKING: 'speed',
  // Ball-control animation is deferred; the carrier runs with normal locomotion.
  ON_BALL: 'speed',
  // RECEIVE plays from the adapter's receive event, not from this state.
  RECEIVING: 'speed',
  PRESSING: 'speed',
};

/** Adapter actions → animation actions. Keeper dives resolve left/right at start. */
function actionFor(kind: PlayerVisualActionKind): AnimationAction | 'DIVE' | null {
  switch (kind) {
    case 'pass':
      return 'PASS';
    case 'receive':
      return 'RECEIVE';
    case 'intercept':
      return 'INTERCEPTION';
    case 'shoot':
      return 'SHOOT';
    case 'tackle':
      return 'TACKLE';
    case 'celebrate':
      return 'CELEBRATE';
    case 'save':
      return 'DIVE';
    case 'catch':
      return 'GK_CATCH';
    // Discipline lives in its own adapter slot and never reaches here; kept for
    // exhaustiveness.
    case 'foul':
    case 'booked':
      return null;
  }
}

/* ── The command ────────────────────────────────────────────────────────────── */

/** What the renderer does with a player this frame. One per machine, rewritten in place. */
export interface AnimationCommand {
  locomotion: {
    state: LocomotionState;
    /** The state being faded out of, and how far the fade has got (1 = done). */
    previous: LocomotionState;
    blend: number;
    /**
     * Rate to play `state`'s clip at so its stride matches the ground the engine is
     * actually covering. 1 at the clip's reference speed; 1 for standing loops.
     */
    playbackRate: number;
    /**
     * Shared gait phase, 0..1 (0 = left-foot contact). Advanced by ground covered, so
     * every locomotion clip being blended stays in step with the others.
     */
    phase: number;
    /**
     * The same phase as a running count of cycles, wrapping every 1024 (an even
     * number, so oscillators at half the gait rate stay seamless across the wrap).
     */
    cycle: number;
    /** Gait cycles per simulation second — what `phase` is advancing at. */
    cyclesPerSecond: number;
    clip: AnimationClipMetadata;
  };
  action: {
    state: AnimationAction | null;
    /** 0..1 through the action. */
    normalizedTime: number;
    /** Simulation seconds since it started. */
    elapsed: number;
    /** 0..1 — eased in and out over the locomotion. */
    weight: number;
    /** Counts actions started by this machine: a new value means restart the clip. */
    seq: number;
    holdsHead: boolean;
    facesCamera: boolean;
    clip: AnimationClipMetadata | null;
  };
  facing: {
    /** The adapter's smoothed engine facing. The renderer may only ease towards it. */
    heading: number;
    /** Radians per simulation second, signed (+ = turning left), smoothed. */
    turnRate: number;
  };
  /** 0 standing, 1 flat out, from the engine's speed. */
  effort: number;
  /** 0 fresh … 0.85 spent, from the engine's stamina. Visual weight only. */
  fatigue: number;
  isKeeper: boolean;
  onBall: boolean;
}

interface QueuedAction {
  kind: AnimationAction | 'DIVE';
  /** Simulation time it is due to start. */
  at: number;
  /** Engine-y offset of the shot from the keeper, for a dive. */
  dir: number;
}

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/* ── The machine ────────────────────────────────────────────────────────────── */

export class FootballAnimationStateMachine {
  readonly command: AnimationCommand = {
    locomotion: {
      state: 'IDLE',
      previous: 'IDLE',
      blend: 1,
      playbackRate: 1,
      phase: 0,
      cycle: 0,
      cyclesPerSecond: 0,
      clip: LOCOMOTION_CLIPS.IDLE,
    },
    action: {
      state: null,
      normalizedTime: 0,
      elapsed: 0,
      weight: 0,
      seq: 0,
      holdsHead: false,
      facesCamera: false,
      clip: null,
    },
    facing: { heading: 0, turnRate: 0 },
    effort: 0,
    fatigue: 0,
    isKeeper: false,
    onBall: false,
  };

  /** Band index into BANDS, how long it has been held, and the eased speed it is chosen from. */
  private band = -1;
  private bandSpeed = 0;
  private bandHeld = 0;
  private fadeTime = LOCOMOTION_CROSSFADE;
  private lastHeading = 0;
  private started = false;

  /** The adapter action last taken in, so each is started at most once. */
  private seenActionSeq = 0;
  private queued: QueuedAction = { kind: 'PASS', at: 0, dir: 0 };
  private hasQueued = false;
  private active: AnimationAction | null = null;
  private activeStart = 0;

  /**
   * Ground covered per gait cycle at a given speed. The procedural body's own gait
   * until an authored model supplies measured strides (`setStrideModel`), so the
   * phase a GLB clip is locked to matches the clip — not the placeholder.
   */
  private strideOf: (speed: number) => number = proceduralStride;

  /** Diagnostics: actions refused by priority, and actions never started. */
  refused = 0;
  expired = 0;

  /**
   * Advances the machine. `time` is the simulation time being drawn (the adapter's
   * render clock) and `dt` how far it moved this frame. A pause is dt = 0 and freezes
   * everything; x4 is four times the dt and plays everything four times as fast.
   */
  update(visual: PlayerVisualState, time: number, dt: number): AnimationCommand {
    const command = this.command;
    const step = Math.max(0, dt);

    if (!this.started || visual.placed) {
      // First sight, or the engine placed them (kick-off): no crossfade, no leftover
      // action from the play before, no turn carried across.
      this.bandSpeed = visual.speed;
      this.band = this.bandFor(visual, this.bandSpeed, this.started ? this.band : -1);
      this.bandHeld = 0;
      this.fadeTime = LOCOMOTION_CROSSFADE;
      this.lastHeading = visual.heading;
      command.facing.turnRate = 0;
      // Anything from the play before the reset — playing or still queued — is dropped.
      if (this.active !== null && this.activeStart <= time) this.active = null;
      if (this.hasQueued && this.queued.at <= time) this.hasQueued = false;
      this.started = true;
    }

    this.takeAction(visual);
    this.advanceAction(visual, time);
    this.advanceLocomotion(visual, step);

    // Facing: the engine's, via the adapter. Only the turn rate is derived here.
    const turned = shortestAngle(this.lastHeading, visual.heading);
    this.lastHeading = visual.heading;
    if (step > 0) {
      command.facing.turnRate += (turned / step - command.facing.turnRate) * Math.min(1, step * TURN_RATE_EASE);
    }
    command.facing.heading = visual.heading;

    command.effort = Math.min(visual.speed / EFFORT_FULL_SPEED, 1);
    command.fatigue = Math.max(0, Math.min(0.85, 1 - visual.stamina));
    command.isKeeper = visual.isKeeper;
    command.onBall = visual.onBall;
    return command;
  }

  /* ── Actions ─────────────────────────────────────────────────────────────── */

  /** Queues the adapter's newest action, once. Ownership is the adapter's: only this player's own actions ever arrive here. */
  private takeAction(visual: PlayerVisualState): void {
    const incoming = visual.action;
    if (!incoming || incoming.seq === this.seenActionSeq) return;
    this.seenActionSeq = incoming.seq;
    const kind = actionFor(incoming.kind);
    if (kind === null) return;
    // Keeper-only actions on anyone else are refused, whatever sent them.
    if ((kind === 'DIVE' || ACTION_METADATA[kind].keeperOnly) && !visual.isKeeper) {
      this.refused += 1;
      return;
    }
    this.queued.kind = kind;
    this.queued.at = incoming.at;
    this.queued.dir = incoming.dir;
    this.hasQueued = true;
  }

  private advanceAction(visual: PlayerVisualState, time: number): void {
    // A queued action starts when the render clock reaches its time.
    if (this.hasQueued && time >= this.queued.at) {
      const kind = this.resolveDive(this.queued, visual.heading);
      const meta = ACTION_METADATA[kind];
      if (time - this.queued.at >= meta.clip.duration) {
        // Its whole length has already gone by (a long hitch): nothing left to show.
        this.hasQueued = false;
        this.expired += 1;
      } else if (this.mayInterrupt(kind, time)) {
        this.hasQueued = false;
        this.active = kind;
        // A contact action is timed from its event; one that waited starts now, whole.
        this.activeStart = meta.waitsForTurn ? time : this.queued.at;
        this.command.action.seq += 1;
      } else if (!meta.waitsForTurn) {
        this.hasQueued = false;
        this.refused += 1;
      }
    }

    const action = this.command.action;
    if (this.active !== null) {
      const meta = ACTION_METADATA[this.active];
      const elapsed = Math.max(0, time - this.activeStart);
      const progress = elapsed / meta.clip.duration;
      if (progress >= 1) {
        this.active = null;
      } else {
        action.state = this.active;
        action.elapsed = elapsed;
        action.normalizedTime = progress;
        action.weight =
          progress < meta.blendIn
            ? smooth01(progress / meta.blendIn)
            : progress > 1 - meta.blendOut
              ? smooth01((1 - progress) / meta.blendOut)
              : 1;
        action.holdsHead = meta.holdsHead;
        action.facesCamera = meta.facesCamera;
        action.clip = meta.clip;
        return;
      }
    }
    // Back to locomotion alone.
    action.state = null;
    action.elapsed = 0;
    action.normalizedTime = 0;
    action.weight = 0;
    action.holdsHead = false;
    action.facesCamera = false;
    action.clip = null;
  }

  /**
   * A dive goes to the keeper's own left or right: the shot's offset across the pitch
   * (world X) against the keeper's right-hand side, (−cos h, sin h) for heading h.
   */
  private resolveDive(queued: QueuedAction, heading: number): AnimationAction {
    if (queued.kind !== 'DIVE') return queued.kind;
    return -Math.cos(heading) * queued.dir >= 0 ? 'GK_DIVE_RIGHT' : 'GK_DIVE_LEFT';
  }

  private mayInterrupt(next: AnimationAction, time: number): boolean {
    const current = this.active;
    if (current === null) return true;
    const meta = ACTION_METADATA[current];
    const progress = (time - this.activeStart) / meta.clip.duration;
    if (progress >= 1) return true;
    if (ACTION_METADATA[next].priority >= meta.priority) return true;
    return progress >= meta.interruptibleAfter;
  }

  /* ── Locomotion ──────────────────────────────────────────────────────────── */

  private sprintUp(visual: PlayerVisualState): number {
    return Math.min(SPRINT_NOMINAL, visual.topSpeed * SPRINT_TOP_SHARE) + SPRINT_UP_MARGIN;
  }

  private sprintDown(visual: PlayerVisualState): number {
    return Math.min(SPRINT_NOMINAL, visual.topSpeed * SPRINT_TOP_SHARE) - SPRINT_DOWN_MARGIN;
  }

  /** Threshold to leave band `index` upwards. */
  private upFrom(index: number, visual: PlayerVisualState): number {
    if (index === 0) return IDLE_UP;
    if (index === 1) return WALK_UP;
    if (index === 2) return RUN_UP;
    return this.sprintUp(visual);
  }

  /** Threshold below which band `index` falls to the one beneath. */
  private downFrom(index: number, visual: PlayerVisualState): number {
    if (index === 1) {
      return MOVEMENT_STATE_LOCOMOTION[visual.state] === 'settle' ? IDLE_DOWN_SETTLING : IDLE_DOWN;
    }
    if (index === 2) return WALK_DOWN;
    if (index === 3) return RUN_DOWN;
    return this.sprintDown(visual);
  }

  /** The band `speed` settles in, starting from `from` (−1: no history, straight lookup). */
  private bandFor(visual: PlayerVisualState, speed: number, from: number): number {
    let index = from < 0 ? 0 : from;
    while (index < BANDS.length - 1 && speed >= this.upFrom(index, visual)) index += 1;
    while (index > 0 && speed < this.downFrom(index, visual)) index -= 1;
    return index;
  }

  private advanceLocomotion(visual: PlayerVisualState, step: number): void {
    const locomotion = this.command.locomotion;
    this.bandHeld += step;
    if (step > 0) this.bandSpeed += (visual.speed - this.bandSpeed) * (1 - Math.exp(-step / BAND_SPEED_TAU));

    const wanted = this.bandFor(visual, this.bandSpeed, this.band);
    const jump = Math.abs(wanted - this.band);
    if (jump >= 2 || (jump === 1 && this.bandHeld >= MIN_BAND_HOLD)) {
      const before = this.stateOf(this.band, visual.isKeeper);
      this.band = wanted;
      this.bandHeld = 0;
      const after = this.stateOf(wanted, visual.isKeeper);
      if (after !== before) {
        locomotion.previous = before;
        this.fadeTime = 0;
      }
    }
    const state = this.stateOf(this.band, visual.isKeeper);
    this.fadeTime = Math.min(LOCOMOTION_CROSSFADE, this.fadeTime + step);

    const clip = LOCOMOTION_CLIPS[state];
    const speed = visual.speed;
    // Ground covered per cycle at this speed; continuous across bands so the
    // cadence never jumps at a boundary.
    const stride = this.strideOf(speed);
    const cycles = speed / stride + (clip.strideMeters === 0 ? 1 / clip.duration : 0);

    locomotion.state = state;
    locomotion.blend = this.fadeTime / LOCOMOTION_CROSSFADE;
    locomotion.clip = clip;
    locomotion.cyclesPerSecond = cycles;
    locomotion.cycle = (locomotion.cycle + cycles * step) % CYCLE_WRAP;
    locomotion.phase = locomotion.cycle % 1;
    locomotion.playbackRate =
      clip.strideMeters === 0
        ? 1
        : Math.max(RATE_MIN, Math.min(RATE_MAX, (speed / stride) * clip.duration));
  }

  /**
   * Replaces the stride model — null restores the procedural placeholder. The gait
   * phase carries on from where it is, so switching mid-match does not jolt the feet.
   */
  setStrideModel(model: ((speed: number) => number) | null): void {
    this.strideOf = model ?? proceduralStride;
  }

  /** A keeper stands and shuffles in the set position; running is running. */
  private stateOf(band: number, keeper: boolean): LocomotionState {
    if (keeper && band <= 1) return 'GK_READY';
    return BANDS[Math.max(0, band)] ?? 'IDLE';
  }
}
