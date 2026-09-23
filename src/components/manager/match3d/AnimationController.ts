import type {
  AnimationAction,
  AnimationCommand,
} from './players/FootballAnimationStateMachine';

/**
 * Procedural poses — the temporary body animation for the primitive `Player3D`.
 *
 * Nothing here decides WHAT a player is doing. `FootballAnimationStateMachine` does
 * that from the engine's data and hands over an `AnimationCommand`: a locomotion
 * state and gait phase, an optional one-shot action with its progress and weight, and
 * the turn rate. `commandPose()` turns that command into joint angles. With the GLB
 * body the same command drives an AnimationMixer instead, and this file is the
 * fallback — for the whole body when there is no model, and joint by joint
 * (`proceduralOverlay`) for whatever the model has no clip for.
 *
 * Every state has a procedural version: IDLE · WALK · JOG · RUN · SPRINT (the
 * stride), TURN (the pivot), PASS · SHOOT · RECEIVE · INTERCEPTION · TACKLE,
 * CELEBRATE (three takes), and the keeper's GK_READY, dive and save.
 *
 * Nothing here is a clip — the poses are written as joint angles over a normalised
 * time, so there is no animation asset to load. Every function writes into a `Pose`
 * it is handed, so a frame with twenty-two players allocates nothing.
 */

/** The poses this body knows. The state machine's actions map onto these. */
export type PlayerAction =
  | 'pass'
  | 'shoot'
  | 'tackle'
  | 'save'
  | 'catch'
  | 'receive'
  | 'intercept'
  | 'celebrate';

/**
 * Every joint the stage drives, as one plain object so blending allocates nothing.
 *
 * Sign convention, the same for both sides: a positive hip or shoulder swings the
 * limb FORWARD of the body; a positive knee or elbow FOLDS the joint; a positive
 * lean, tilt or ankle is forward, chin down, toes down. The stage turns these into
 * three's rotations — the convention lives here so a pose reads like a description.
 */
export interface Pose {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  /** Foot flex at the ankle: positive points the toes down. */
  ankleL: number;
  ankleR: number;
  /** Arm swing, forward and back. π is straight overhead. */
  shoulderL: number;
  shoulderR: number;
  /** Arms held away from the body. Always written as "outward", the stage signs it. */
  armOutL: number;
  armOutR: number;
  elbowL: number;
  elbowR: number;
  /** Lean: forward from the waist, and sideways. */
  spineX: number;
  spineZ: number;
  /** Shoulders turned against the hips, as a runner's do. */
  twist: number;
  /** Where the head is turned and tilted. */
  neckY: number;
  neckX: number;
  /** Legs opening away from each other. */
  spreadL: number;
  spreadR: number;
  /** Lifted or dropped from standing height. */
  rootY: number;
}

export function makePose(): Pose {
  return {
    hipL: 0,
    hipR: 0,
    kneeL: 0,
    kneeR: 0,
    ankleL: 0,
    ankleR: 0,
    shoulderL: 0,
    shoulderR: 0,
    armOutL: 0,
    armOutR: 0,
    elbowL: 0,
    elbowR: 0,
    spineX: 0,
    spineZ: 0,
    twist: 0,
    neckY: 0,
    neckX: 0,
    spreadL: 0,
    spreadR: 0,
    rootY: 0,
  };
}

function smooth(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Below this much effort the player is standing, and gets the idle instead. */
const IDLE_EFFORT = 0.06;
/** Below this a keeper is holding the goal, not leaving it, and stays set. */
const KEEPER_SET_EFFORT = 0.4;

/**
 * Standing, walking, running or sprinting — the pose the body falls back to.
 *
 * `effort` is 0 standing and 1 flat out. A walk is a small, upright swing with the
 * arms loose; a run folds the knees and elbows and leans in; a sprint leans hard,
 * with the elbows pumping high. `keeper` adds the set stance a goalkeeper drops into
 * when they are not going anywhere.
 */
export function stridePose(out: Pose, phase: number, effort: number, keeper: boolean): void {
  const sin = Math.sin(phase);
  // Pace, above a walk: 0 at a jog, 1 at a sprint.
  const pace = Math.max(0, (effort - 0.4) / 0.6);
  const swing = sin * (0.14 + effort * 0.8);

  out.hipL = swing;
  out.hipR = -swing;
  // Knees only fold the way knees fold — behind the player, never in front — and
  // a runner's never quite straighten.
  const slack = 0.08 + effort * 0.18;
  out.kneeL = Math.max(0, swing) * (1.4 + pace * 0.5) + slack;
  out.kneeR = Math.max(0, -swing) * (1.4 + pace * 0.5) + slack;
  // Toes point as the foot trails and lift as it comes through.
  out.ankleL = -swing * 0.35;
  out.ankleR = swing * 0.35;

  // Arms swing against the legs, higher and tighter the faster they go.
  out.shoulderL = -swing * (0.55 + pace * 0.3);
  out.shoulderR = swing * (0.55 + pace * 0.3);
  const elbow = 0.35 + effort * 0.9 + pace * 0.35;
  out.elbowL = elbow;
  out.elbowR = elbow;
  const armOut = 0.14 + effort * 0.12;
  out.armOutL = armOut;
  out.armOutR = armOut;

  out.spineX = effort * 0.12 + pace * pace * 0.24;
  out.spineZ = 0;
  out.twist = sin * (0.05 + effort * 0.14);
  out.neckY = 0;
  // Eyes up as the lean comes in, so the runner looks ahead and not at the grass.
  out.neckX = -(effort * 0.1 + pace * 0.18);
  out.spreadL = 0;
  out.spreadR = 0;
  out.rootY = Math.abs(sin) * 0.05 * effort;

  if (effort < IDLE_EFFORT * 4) {
    // Standing: the stride fades out and a slow shift of weight fades in.
    const still = 1 - effort / (IDLE_EFFORT * 4);
    const sway = Math.sin(phase * 0.5);
    out.spineZ = sway * 0.03 * still;
    out.hipL = mix(out.hipL, 0.04 * sway, still);
    out.hipR = mix(out.hipR, -0.04 * sway, still);
    out.spreadL = -0.06 * still;
    out.spreadR = 0.06 * still;
    out.shoulderL = mix(out.shoulderL, 0.05 * sway, still);
    out.shoulderR = mix(out.shoulderR, -0.05 * sway, still);
    out.elbowL = mix(out.elbowL, 0.28, still);
    out.elbowR = mix(out.elbowR, 0.28, still);
    out.rootY = 0;
  }

  if (keeper && effort < KEEPER_SET_EFFORT) {
    // The set position: knees soft, weight forward, hands ready. A keeper shuffling
    // across the goal keeps it, so it blends out over a wider band than the idle.
    const set = 1 - effort / KEEPER_SET_EFFORT;
    out.hipL = mix(out.hipL, 0.5, set);
    out.hipR = mix(out.hipR, 0.5, set);
    out.kneeL = mix(out.kneeL, 0.7, set);
    out.kneeR = mix(out.kneeR, 0.7, set);
    out.spreadL = mix(out.spreadL, -0.22, set);
    out.spreadR = mix(out.spreadR, 0.22, set);
    out.spineX = mix(out.spineX, 0.42, set);
    out.shoulderL = mix(out.shoulderL, 0.55, set);
    out.shoulderR = mix(out.shoulderR, 0.55, set);
    out.elbowL = mix(out.elbowL, 1.1, set);
    out.elbowR = mix(out.elbowR, 1.1, set);
    out.armOutL = mix(out.armOutL, 0.55, set);
    out.armOutR = mix(out.armOutR, 0.55, set);
    out.neckX = mix(out.neckX, -0.3, set);
    out.rootY = mix(out.rootY, -0.16, set);
  }
}

/** Written by `kickSwing` — reused so a kick allocates nothing. */
const swingOut = { hip: 0, knee: 0 };

/**
 * A leg swinging through a ball: backswing (0 → 0.3), through the ball (contact at
 * 0.46, the middle of 0.3 → 0.62), follow-through to 0.62, and back to standing.
 */
function kickSwing(p: number, depth: number, through: number): typeof swingOut {
  if (p < 0.3) {
    const t = smooth(p / 0.3);
    swingOut.hip = mix(0, -depth, t);
    swingOut.knee = mix(0.1, depth * 1.3, t);
  } else if (p < 0.62) {
    const t = smooth((p - 0.3) / 0.32);
    swingOut.hip = mix(-depth, through, t);
    swingOut.knee = mix(depth * 1.3, 0.05, t);
  } else {
    const t = smooth((p - 0.62) / 0.38);
    swingOut.hip = mix(through, 0, t);
    swingOut.knee = mix(0.05, 0.18, t);
  }
  return swingOut;
}

/**
 * A phase envelope: 0 before `a`, easing up to 1 at `b`, held to `c`, easing back to
 * 0 at `d`. How every phased action below is written.
 */
function envelope(p: number, a: number, b: number, c: number, d: number): number {
  if (p <= a || p >= d) return 0;
  if (p < b) return smooth((p - a) / (b - a));
  if (p <= c) return 1;
  return 1 - smooth((p - c) / (d - c));
}

/** Everything relaxed, for actions that only move some of the body. */
function neutral(out: Pose): void {
  out.hipL = 0;
  out.hipR = 0;
  out.kneeL = 0.1;
  out.kneeR = 0.1;
  out.ankleL = 0;
  out.ankleR = 0;
  out.shoulderL = 0;
  out.shoulderR = 0;
  out.armOutL = 0.15;
  out.armOutR = 0.15;
  out.elbowL = 0.3;
  out.elbowR = 0.3;
  out.spineX = 0;
  out.spineZ = 0;
  out.twist = 0;
  out.neckY = 0;
  out.neckX = 0;
  out.spreadL = 0;
  out.spreadR = 0;
  out.rootY = 0;
}

/*
 * Sides. The rig's "L" limbs hang at local −X and its "R" limbs at +X, and the body
 * faces +Z; `footed` +1 kicks with the +X leg. A positive `spineZ` rolls the body
 * towards −X, a positive `twist` or `neckY` turns towards +X — which is also the way a
 * rising heading turns (heading = atan2(X, Z)), so a turn direction of +1 is towards
 * the +X side. A positive spread swings either leg towards +X.
 */

/** Pass and shot: preparation, plant, backswing, strike, follow-through, recovery. */
function kickPose(out: Pose, p: number, footed: -1 | 1, hard: boolean): void {
  const arc = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
  const swing = kickSwing(p, hard ? 1.05 : 0.55, hard ? 0.95 : 0.55);
  // The support foot is planted as the backswing starts and held through the strike,
  // then the weight comes off it in the recovery.
  const plant = envelope(p, 0, 0.22, 0.62, 1);
  const plantHip = (hard ? 0.2 : 0.12) * plant;
  const plantKnee = 0.1 + (hard ? 0.32 : 0.16) * plant;
  // The kicking foot points through the ball, the standing foot stays flat.
  const toe = (hard ? 0.7 : 0.45) * arc;

  if (footed > 0) {
    out.hipR = swing.hip;
    out.kneeR = swing.knee;
    out.ankleR = toe;
    out.hipL = plantHip;
    out.kneeL = plantKnee;
  } else {
    out.hipL = swing.hip;
    out.kneeL = swing.knee;
    out.ankleL = toe;
    out.hipR = plantHip;
    out.kneeR = plantKnee;
  }

  // The opposite arm counterweights the kicking leg, wider for a shot.
  const reach = (hard ? 1.15 : 0.7) * arc;
  out.shoulderL = footed > 0 ? reach : -reach * 0.5;
  out.shoulderR = footed > 0 ? -reach * 0.5 : reach;
  out.armOutL = 0.2 + (hard ? 0.45 : 0.25) * arc;
  out.armOutR = out.armOutL;
  out.elbowL = 0.4;
  out.elbowR = 0.4;
  out.spreadL = -0.25 * arc;
  out.spreadR = 0.25 * arc;
  // Lean back over the ball in the backswing, then follow through onto it.
  out.spineX = (p < 0.35 ? -0.2 : 0.26) * arc;
  out.spineZ = (hard ? -0.2 : -0.1) * footed * arc;
  out.twist = (hard ? 0.35 : 0.2) * footed * (p < 0.35 ? -arc : arc);
  // Head down over the ball.
  out.neckX = 0.35 * arc;
  out.rootY = hard ? 0.05 * arc : 0;
}

/**
 * Receive: approach, prepare (the controlling foot comes up to meet it), contact at
 * 0.5 (the foot gives with the ball — the cushion), control (set it down in front),
 * recovery.
 */
function receivePose(out: Pose, p: number, footed: -1 | 1): void {
  const lead = footed;
  const meet = envelope(p, 0.1, 0.4, 0.6, 0.85);
  // The give: centred on the contact, the foot drawn back and the knee soft.
  const cushion = envelope(p, 0.4, 0.5, 0.52, 0.66);
  const body = envelope(p, 0.05, 0.35, 0.72, 1);
  const hip = 0.55 * meet - 0.28 * cushion;
  const knee = 0.3 * meet + 0.35 * cushion;
  if (lead > 0) {
    out.hipR = hip;
    out.kneeR = knee;
    out.ankleR = -0.25 * meet;
    out.spreadR = 0.3 * meet;
    out.hipL = 0.15 * body;
    out.kneeL = 0.1 + 0.4 * body;
  } else {
    out.hipL = hip;
    out.kneeL = knee;
    out.ankleL = -0.25 * meet;
    out.spreadL = -0.3 * meet;
    out.hipR = 0.15 * body;
    out.kneeR = 0.1 + 0.4 * body;
  }
  out.armOutL = 0.2 + 0.5 * body;
  out.armOutR = 0.2 + 0.5 * body;
  out.elbowL = 0.5;
  out.elbowR = 0.5;
  out.spineX = 0.22 * body + 0.08 * cushion;
  out.spineZ = -0.08 * lead * body;
  out.neckX = 0.4 * body;
  out.rootY = -0.06 * body;
}

/**
 * Intercept: driving at the ball's line (the forward lean), stretching the near leg
 * across it to reach it at 0.5, then gathering back into the run.
 */
function interceptPose(out: Pose, p: number, footed: -1 | 1): void {
  const lead = footed;
  const drive = envelope(p, 0, 0.2, 0.4, 0.7);
  const reach = envelope(p, 0.15, 0.45, 0.58, 0.95);
  const leadHip = 0.95 * reach;
  const leadKnee = 0.15 + 0.2 * (1 - reach);
  const supportKnee = 0.25 + 0.6 * reach;
  if (lead > 0) {
    out.hipR = leadHip;
    out.kneeR = leadKnee;
    out.ankleR = -0.3 * reach;
    out.spreadR = 0.35 * reach;
    out.hipL = 0.15 + 0.15 * drive;
    out.kneeL = supportKnee;
  } else {
    out.hipL = leadHip;
    out.kneeL = leadKnee;
    out.ankleL = -0.3 * reach;
    out.spreadL = -0.35 * reach;
    out.hipR = 0.15 + 0.15 * drive;
    out.kneeR = supportKnee;
  }
  // Arms out for balance, the far arm swinging across.
  out.armOutL = 0.25 + 0.5 * reach;
  out.armOutR = 0.25 + 0.5 * reach;
  out.shoulderL = (lead > 0 ? 0.6 : -0.2) * reach;
  out.shoulderR = (lead > 0 ? -0.2 : 0.6) * reach;
  out.elbowL = 0.5;
  out.elbowR = 0.5;
  out.spineX = 0.35 * drive + 0.25 * reach;
  // The body goes over the reaching leg.
  out.spineZ = -0.22 * lead * reach;
  out.twist = 0.18 * lead * reach;
  out.neckX = 0.35 * reach;
  out.rootY = -0.2 * reach;
}

/** Tackle: forward lean, support leg folded under, tackling leg stretched, recovery. */
function tacklePose(out: Pose, p: number, footed: -1 | 1): void {
  // Down and in by 0.4 (the reach), held a beat, then a controlled getting up.
  const go = envelope(p, 0, 0.4, 0.5, 1);
  const lead = footed;
  const leadHip = 1.2 * go;
  const trailHip = -0.5 * go;
  if (lead > 0) {
    out.hipR = leadHip;
    out.kneeR = 0.12 * go;
    out.ankleR = 0.5 * go;
    out.hipL = trailHip;
    out.kneeL = 1.5 * go;
  } else {
    out.hipL = leadHip;
    out.kneeL = 0.12 * go;
    out.ankleL = 0.5 * go;
    out.hipR = trailHip;
    out.kneeR = 1.5 * go;
  }
  out.shoulderL = 0.9 * go;
  out.shoulderR = 0.9 * go;
  out.armOutL = 0.5 * go;
  out.armOutR = 0.5 * go;
  out.elbowL = 0.25;
  out.elbowR = 0.25;
  out.spineX = 0.6 * go;
  out.spineZ = 0.35 * lead * go;
  out.twist = 0.3 * lead * go;
  out.spreadL = -0.3 * go;
  out.spreadR = 0.3 * go;
  out.rootY = -0.42 * go;
}

/**
 * Celebrations, one per take (`variant`): 0 arms up with a couple of hops, 1 the
 * aeroplane — arms out wide, banking side to side on a light jog — and 2 the roar:
 * crouched, one fist pumping. Every take eases in over the first 15% and lets go over
 * the last 15%, so the weight fades never snap.
 */
function celebratePose(out: Pose, p: number, footed: -1 | 1, variant: number): void {
  const up = envelope(p, 0, 0.15, 0.85, 1);
  const take = ((variant % 3) + 3) % 3;

  if (take === 1) {
    const bank = Math.sin(p * Math.PI * 3) * up;
    const stride = Math.sin(p * Math.PI * 8) * up;
    out.shoulderL = 0.1 * up;
    out.shoulderR = 0.1 * up;
    out.armOutL = 1.45 * up;
    out.armOutR = 1.45 * up;
    out.elbowL = 0.1;
    out.elbowR = 0.1;
    out.hipL = 0.35 * stride;
    out.hipR = -0.35 * stride;
    out.kneeL = 0.2 + 0.5 * Math.max(0, stride);
    out.kneeR = 0.2 + 0.5 * Math.max(0, -stride);
    out.spineX = 0.1 * up;
    out.spineZ = 0.3 * bank;
    out.twist = 0.1 * bank;
    out.neckX = -0.25 * up;
    out.rootY = 0.04 * Math.abs(stride);
    return;
  }

  if (take === 2) {
    // The fist on the kicking side pumps three times; the other arm is clenched low.
    const pump = (0.5 + 0.5 * Math.sin(p * Math.PI * 6 - Math.PI / 2)) * up;
    const high = 2.1 * up + 0.5 * pump;
    const fold = 1.2 + 0.5 * pump;
    out.shoulderL = footed > 0 ? 0.3 * up : high;
    out.shoulderR = footed > 0 ? high : 0.3 * up;
    out.elbowL = footed > 0 ? 1.3 : fold;
    out.elbowR = footed > 0 ? fold : 1.3;
    out.armOutL = 0.35 * up;
    out.armOutR = 0.35 * up;
    out.hipL = 0.35 * up;
    out.hipR = 0.35 * up;
    out.kneeL = 0.6 * up;
    out.kneeR = 0.6 * up;
    out.spreadL = -0.18 * up;
    out.spreadR = 0.18 * up;
    out.spineX = 0.25 * up;
    out.neckX = -0.45 * up;
    out.rootY = -0.12 * up;
    return;
  }

  // Arms up and a couple of hops, chin up.
  const hop = Math.max(0, Math.sin(p * Math.PI * 3)) * up;
  out.shoulderL = 2.9 * up;
  out.shoulderR = 2.9 * up;
  out.armOutL = 0.45 * up;
  out.armOutR = 0.45 * up;
  out.elbowL = 0.25;
  out.elbowR = 0.25;
  out.hipL = 0.3 * (1 - hop) * up;
  out.hipR = 0.3 * (1 - hop) * up;
  out.kneeL = 0.55 * (1 - hop) * up;
  out.kneeR = 0.55 * (1 - hop) * up;
  out.ankleL = 0.6 * hop;
  out.ankleR = 0.6 * hop;
  out.spineX = -0.15 * up;
  out.neckX = -0.4 * up;
  out.rootY = 0.22 * hop - 0.08 * (1 - hop) * up;
}

/**
 * GOALKEEPER_SAVE, a shot at them: set (0 → 0.2), reach out for it (→ 0.45),
 * gather it into the chest at 0.45–0.55, and stand back up with it (→ 1).
 */
function catchPose(out: Pose, p: number): void {
  const set = envelope(p, 0, 0.2, 0.6, 1);
  const reach = envelope(p, 0.15, 0.42, 0.46, 0.62);
  const gather = envelope(p, 0.44, 0.56, 0.8, 1);
  out.shoulderL = 1.5 * reach + 1.05 * gather + 0.3 * set;
  out.shoulderR = out.shoulderL;
  out.armOutL = 0.3 - 0.4 * reach - 0.3 * gather;
  out.armOutR = out.armOutL;
  out.elbowL = 0.3 + 0.1 * reach + 1.2 * gather;
  out.elbowR = out.elbowL;
  out.hipL = 0.55 * set;
  out.hipR = 0.55 * set;
  out.kneeL = 0.1 + 0.8 * set;
  out.kneeR = 0.1 + 0.8 * set;
  out.spreadL = -0.25 * set;
  out.spreadR = 0.25 * set;
  out.spineX = 0.3 * set + 0.15 * reach;
  out.neckX = 0.25 * set;
  out.rootY = -0.22 * set;
}

/**
 * GOALKEEPER_DIVE, towards `side` (+1 the −X side of the body, −1 the +X side; see
 * the side note above): set (0 → 0.12), push off the near leg (→ 0.3), fully
 * stretched in the air with the arms beyond the head, hands on the ball at 0.4,
 * landing on the side (0.55 → 0.72), and getting back up (→ 1).
 */
function divePose(out: Pose, p: number, side: 1 | -1): void {
  const set = envelope(p, 0, 0.08, 0.14, 0.3);
  const lay = envelope(p, 0.1, 0.36, 0.72, 0.98);
  const air = envelope(p, 0.14, 0.3, 0.46, 0.6);
  const ground = envelope(p, 0.5, 0.64, 0.74, 0.96);
  // Crouch, then the whole body goes flat: the torso rolls one way and both legs
  // swing out the other, so the body lies in a line.
  out.hipL = 0.5 * set - 0.15 * lay;
  out.hipR = 0.5 * set - 0.15 * lay;
  out.kneeL = 0.1 + 0.6 * set + 0.3 * lay;
  out.kneeR = 0.1 + 0.6 * set + 0.3 * lay;
  out.ankleL = 0.45 * lay;
  out.ankleR = 0.45 * lay;
  out.spreadL = side * 1.3 * lay - 0.2 * set;
  out.spreadR = side * 1.3 * lay + 0.2 * set;
  out.spineX = 0.3 * set - 0.1 * lay;
  out.spineZ = side * 1.35 * lay;
  // Arms beyond the head, reaching for it.
  out.shoulderL = 0.5 * set + 2.6 * lay;
  out.shoulderR = 0.5 * set + 2.6 * lay;
  out.armOutL = 0.5 * set + 0.35 * lay;
  out.armOutR = 0.5 * set + 0.35 * lay;
  out.elbowL = 0.9 * set + 0.1 * lay;
  out.elbowR = 0.9 * set + 0.1 * lay;
  // Shoulders and head turned the way the dive goes.
  out.twist = -0.2 * side * lay;
  out.neckY = -0.5 * side * lay;
  // Down into the set, up off the ground, then down to lie on the grass.
  out.rootY = -0.14 * set + 0.3 * air - 0.72 * ground;
}

/**
 * Writes the pose for an action at `p`, 0 to 1. `footed` is the kicking side, −1 for
 * the left foot and +1 for the right; `dir` is which way a keeper goes; `variant` is
 * the take, where an action has more than one.
 */
export function actionPose(
  out: Pose,
  kind: PlayerAction,
  p: number,
  footed: -1 | 1,
  dir: number,
  variant = 0,
): void {
  neutral(out);
  switch (kind) {
    case 'pass':
      kickPose(out, p, footed, false);
      return;
    case 'shoot':
      kickPose(out, p, footed, true);
      return;
    case 'receive':
      receivePose(out, p, footed);
      return;
    case 'intercept':
      interceptPose(out, p, footed);
      return;
    case 'tackle':
      tacklePose(out, p, footed);
      return;
    case 'celebrate':
      celebratePose(out, p, footed, variant);
      return;
    case 'catch':
      catchPose(out, p);
      return;
    case 'save':
      divePose(out, p, dir >= 0 ? 1 : -1);
      return;
  }
}

/**
 * TURN, pivoting on the spot (a standing player only; see the state machine): little
 * steps with alternate feet at the pivot's cadence (`phase` in radians), the head
 * leading into the turn, the shoulders after it and a slight lean in. `direction` +1
 * turns towards +X (a rising heading).
 */
export function turnPose(out: Pose, phase: number, direction: number): void {
  const dir = direction >= 0 ? 1 : -1;
  const stepA = Math.max(0, Math.sin(phase));
  const stepB = Math.max(0, -Math.sin(phase));
  neutral(out);
  out.hipL = 0.3 * stepA + 0.08;
  out.hipR = 0.3 * stepB + 0.08;
  out.kneeL = 0.25 + 0.55 * stepA;
  out.kneeR = 0.25 + 0.55 * stepB;
  // The inside foot opens towards the turn as it steps.
  out.spreadL = dir * 0.18 * stepA;
  out.spreadR = dir * 0.18 * stepB;
  out.ankleL = -0.15 * stepA;
  out.ankleR = -0.15 * stepB;
  out.armOutL = 0.28;
  out.armOutR = 0.28;
  out.elbowL = 0.45;
  out.elbowR = 0.45;
  out.shoulderL = 0.15 * dir;
  out.shoulderR = -0.15 * dir;
  out.twist = 0.22 * dir;
  out.neckY = 0.4 * dir;
  out.spineX = 0.08;
  out.spineZ = -0.06 * dir;
  out.rootY = -0.02;
}

/** `out = from` blended `weight` of the way to `to`. */
export function blendPose(out: Pose, from: Pose, to: Pose, weight: number): void {
  out.hipL = mix(from.hipL, to.hipL, weight);
  out.hipR = mix(from.hipR, to.hipR, weight);
  out.kneeL = mix(from.kneeL, to.kneeL, weight);
  out.kneeR = mix(from.kneeR, to.kneeR, weight);
  out.ankleL = mix(from.ankleL, to.ankleL, weight);
  out.ankleR = mix(from.ankleR, to.ankleR, weight);
  out.shoulderL = mix(from.shoulderL, to.shoulderL, weight);
  out.shoulderR = mix(from.shoulderR, to.shoulderR, weight);
  out.armOutL = mix(from.armOutL, to.armOutL, weight);
  out.armOutR = mix(from.armOutR, to.armOutR, weight);
  out.elbowL = mix(from.elbowL, to.elbowL, weight);
  out.elbowR = mix(from.elbowR, to.elbowR, weight);
  out.spineX = mix(from.spineX, to.spineX, weight);
  out.spineZ = mix(from.spineZ, to.spineZ, weight);
  out.twist = mix(from.twist, to.twist, weight);
  out.neckY = mix(from.neckY, to.neckY, weight);
  out.neckX = mix(from.neckX, to.neckX, weight);
  out.spreadL = mix(from.spreadL, to.spreadL, weight);
  out.spreadR = mix(from.spreadR, to.spreadR, weight);
  out.rootY = mix(from.rootY, to.rootY, weight);
}

function copyPose(out: Pose, from: Pose): void {
  blendPose(out, from, from, 0);
}

/** How much a runner leans into a turn: radians of lean per radian a second. */
const TURN_LEAN = 0.04;
/**
 * The gait phase fed to `stridePose` in radians. The standing sway runs at half the
 * gait rate (sin(phase / 2)), so the phase must not wrap every cycle; the command's
 * running cycle count wraps only every 1024 cycles, which is even and so seamless.
 */
const TAU = Math.PI * 2;

/** The procedural pose for a state-machine action, or null for none. */
export function proceduralActionOf(action: AnimationAction | null): PlayerAction | null {
  switch (action) {
    case 'PASS':
      return 'pass';
    case 'SHOOT':
      return 'shoot';
    case 'RECEIVE':
      return 'receive';
    case 'INTERCEPTION':
      return 'intercept';
    case 'TACKLE':
      return 'tackle';
    case 'CELEBRATE':
      return 'celebrate';
    case 'GK_DIVE_LEFT':
    case 'GK_DIVE_RIGHT':
      return 'save';
    case 'GK_CATCH':
      return 'catch';
    default:
      return null;
  }
}

/** Scratch poses, one set per renderer, so composing a command allocates nothing. */
export interface PoseScratch {
  stride: Pose;
  action: Pose;
  turn: Pose;
  full: Pose;
}

export function makePoseScratch(): PoseScratch {
  return { stride: makePose(), action: makePose(), turn: makePose(), full: makePose() };
}

/**
 * How much of TURN is showing: all of it once faded in, fading as it hands back to
 * the band's state — the same crossfade the locomotion clips use.
 */
export function turnWeight(command: AnimationCommand): number {
  const locomotion = command.locomotion;
  if (locomotion.state === 'TURN') return locomotion.blend;
  if (locomotion.previous === 'TURN') return 1 - locomotion.blend;
  return 0;
}

/** The body the command asks for, minus nothing: gait, then TURN, then the action. */
function compose(
  out: Pose,
  command: AnimationCommand,
  footed: -1 | 1,
  scratch: PoseScratch,
  withTurn: boolean,
  withAction: boolean,
): void {
  copyPose(out, scratch.stride);
  const pivot = withTurn ? turnWeight(command) : 0;
  if (pivot > 0) {
    turnPose(scratch.turn, command.locomotion.cycle * TAU, command.locomotion.turnDirection);
    blendPose(out, out, scratch.turn, pivot);
  }
  const action = command.action;
  const pose = withAction ? proceduralActionOf(action.state) : null;
  if (pose && action.weight > 0) {
    const side = action.state === 'GK_DIVE_LEFT' ? -1 : 1;
    actionPose(scratch.action, pose, action.normalizedTime, footed, side, action.variant);
    blendPose(out, out, scratch.action, action.weight);
  }
}

/**
 * The whole procedural body for one command: the gait at the command's phase and
 * effort, leaning into the turn, the TURN pivot over it while it shows, and the
 * one-shot action (if any) over that at the command's weight. `footed` is the kicking
 * side (−1 left, +1 right) — a property of the player's look, not of the animation
 * state.
 */
export function commandPose(
  out: Pose,
  command: AnimationCommand,
  footed: -1 | 1,
  scratch: PoseScratch,
): void {
  const stride = scratch.stride;
  stridePose(stride, command.locomotion.cycle * TAU, command.effort, command.isKeeper);
  // Leaning into the turn: heading grows turning left, and a left lean is a negative
  // roll of the spine.
  stride.spineZ -= command.facing.turnRate * TURN_LEAN * command.effort;
  compose(out, command, footed, scratch, true, true);
}

/**
 * For a body whose clips cannot show part of a command — the realistic model with no
 * clip for an action, or for TURN: what the procedural body would add on top of its
 * plain gait for that part, joint by joint (`out` = with − without). The clip-driven
 * locomotion stays underneath, and this is laid over it, so the action is still seen
 * rather than dropped. Returns false when there is nothing to add.
 */
export function proceduralOverlay(
  out: Pose,
  command: AnimationCommand,
  footed: -1 | 1,
  scratch: PoseScratch,
  withTurn: boolean,
  withAction: boolean,
): boolean {
  const stride = scratch.stride;
  stridePose(stride, command.locomotion.cycle * TAU, command.effort, command.isKeeper);
  const full = scratch.full;
  compose(full, command, footed, scratch, withTurn, withAction);
  out.hipL = full.hipL - stride.hipL;
  out.hipR = full.hipR - stride.hipR;
  out.kneeL = full.kneeL - stride.kneeL;
  out.kneeR = full.kneeR - stride.kneeR;
  out.ankleL = full.ankleL - stride.ankleL;
  out.ankleR = full.ankleR - stride.ankleR;
  out.shoulderL = full.shoulderL - stride.shoulderL;
  out.shoulderR = full.shoulderR - stride.shoulderR;
  out.armOutL = full.armOutL - stride.armOutL;
  out.armOutR = full.armOutR - stride.armOutR;
  out.elbowL = full.elbowL - stride.elbowL;
  out.elbowR = full.elbowR - stride.elbowR;
  out.spineX = full.spineX - stride.spineX;
  out.spineZ = full.spineZ - stride.spineZ;
  out.twist = full.twist - stride.twist;
  out.neckY = full.neckY - stride.neckY;
  out.neckX = full.neckX - stride.neckX;
  out.spreadL = full.spreadL - stride.spreadL;
  out.spreadR = full.spreadR - stride.spreadR;
  out.rootY = full.rootY - stride.rootY;
  return (
    Math.abs(out.hipL) + Math.abs(out.hipR) + Math.abs(out.kneeL) + Math.abs(out.kneeR) +
      Math.abs(out.shoulderL) + Math.abs(out.shoulderR) + Math.abs(out.spineX) + Math.abs(out.spineZ) +
      Math.abs(out.twist) + Math.abs(out.neckY) + Math.abs(out.rootY) + Math.abs(out.armOutL) +
      Math.abs(out.armOutR) + Math.abs(out.spreadL) + Math.abs(out.spreadR) + Math.abs(out.elbowL) +
      Math.abs(out.elbowR) + Math.abs(out.ankleL) + Math.abs(out.ankleR) + Math.abs(out.neckX) >
    1e-5
  );
}
