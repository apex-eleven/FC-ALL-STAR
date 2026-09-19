import type { MatchEngine } from '@/features/manager/matchEngine';

/**
 * Poses, and the reading of the engine that decides when to strike one.
 *
 * The engine is never asked to help: it publishes a ball, a flight and a set of
 * counters, and everything below is worked out from watching those change. Nothing
 * here is a clip — the poses are written as joint angles over a normalised time, so
 * there is no animation asset to load. Every function writes into a `Pose` it is
 * handed, so a frame with twenty-two players allocates nothing.
 */

export type PlayerAction =
  | 'pass'
  | 'shoot'
  | 'tackle'
  | 'save'
  | 'catch'
  | 'receive'
  | 'celebrate';

/** How long each one runs, in seconds. */
export const ACTION_SECONDS: Record<PlayerAction, number> = {
  pass: 0.5,
  shoot: 0.62,
  tackle: 0.75,
  save: 0.85,
  catch: 0.7,
  receive: 0.55,
  // The engine holds play for 2.6 s after a goal; this fits inside it.
  celebrate: 2.0,
};

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

/** A leg swinging through a ball: back, through, and back to standing. */
function kickSwing(p: number, depth: number, through: number): { hip: number; knee: number } {
  if (p < 0.3) {
    const t = smooth(p / 0.3);
    return { hip: mix(0, -depth, t), knee: mix(0.1, depth * 1.3, t) };
  }
  if (p < 0.62) {
    const t = smooth((p - 0.3) / 0.32);
    return { hip: mix(-depth, through, t), knee: mix(depth * 1.3, 0.05, t) };
  }
  const t = smooth((p - 0.62) / 0.38);
  return { hip: mix(through, 0, t), knee: mix(0.05, 0.18, t) };
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

/**
 * Writes the pose for an action at `p`, 0 to 1. `footed` is the kicking side, −1 for
 * the left foot and +1 for the right; `dir` is which way a keeper goes.
 */
export function actionPose(
  out: Pose,
  kind: PlayerAction,
  p: number,
  footed: -1 | 1,
  dir: number,
): void {
  const arc = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
  neutral(out);

  if (kind === 'pass' || kind === 'shoot') {
    const hard = kind === 'shoot';
    const swing = kickSwing(p, hard ? 1.05 : 0.55, hard ? 0.95 : 0.55);
    const plantHip = hard ? 0.2 : 0.12;
    const plantKnee = hard ? 0.42 : 0.26;
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
    // Lean back over the ball, then follow through onto it.
    out.spineX = (p < 0.35 ? -0.2 : 0.26) * arc;
    out.spineZ = (hard ? -0.2 : -0.1) * footed * arc;
    out.twist = (hard ? 0.35 : 0.2) * footed * (p < 0.35 ? -arc : arc);
    // Head down over the ball.
    out.neckX = 0.35 * arc;
    out.rootY = hard ? 0.05 * arc : 0;
    return;
  }

  if (kind === 'receive') {
    // A touch to bring it under control: the controlling foot forward and turned
    // out, weight down on the other, arms out for balance.
    const lead = footed > 0 ? 1 : -1;
    const step = arc;
    if (lead > 0) {
      out.hipR = 0.55 * step;
      out.kneeR = 0.35 * step;
      out.ankleR = -0.2 * step;
      out.spreadR = 0.3 * step;
      out.hipL = 0.15 * step;
      out.kneeL = 0.45 * step;
    } else {
      out.hipL = 0.55 * step;
      out.kneeL = 0.35 * step;
      out.ankleL = -0.2 * step;
      out.spreadL = -0.3 * step;
      out.hipR = 0.15 * step;
      out.kneeR = 0.45 * step;
    }
    out.armOutL = 0.2 + 0.5 * step;
    out.armOutR = 0.2 + 0.5 * step;
    out.elbowL = 0.5;
    out.elbowR = 0.5;
    out.spineX = 0.22 * step;
    out.spineZ = -0.08 * lead * step;
    out.neckX = 0.4 * step;
    out.rootY = -0.06 * step;
    return;
  }

  if (kind === 'tackle') {
    // Down and in: one leg stretched at the ball, the other folded under.
    const go = p < 0.4 ? smooth(p / 0.4) : 1 - smooth((p - 0.4) / 0.6);
    const lead = footed > 0 ? 1 : -1;
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
    return;
  }

  if (kind === 'celebrate') {
    // Arms up and a couple of hops, chin up, held to the end and let go quickly.
    const up = p < 0.15 ? smooth(p / 0.15) : p > 0.85 ? 1 - smooth((p - 0.85) / 0.15) : 1;
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
    return;
  }

  if (kind === 'catch') {
    // Straight at them: drop, hands together in front, gather it into the chest.
    const gather = p < 0.45 ? smooth(p / 0.45) : 1 - smooth((p - 0.45) / 0.55) * 0.6;
    out.shoulderL = 1.5 * gather;
    out.shoulderR = 1.5 * gather;
    out.armOutL = 0.3 - 0.45 * gather;
    out.armOutR = 0.3 - 0.45 * gather;
    out.elbowL = 0.4 + 0.7 * gather;
    out.elbowR = 0.4 + 0.7 * gather;
    out.hipL = 0.6 * gather;
    out.hipR = 0.6 * gather;
    out.kneeL = 0.9 * gather;
    out.kneeR = 0.9 * gather;
    out.spreadL = -0.25 * gather;
    out.spreadR = 0.25 * gather;
    out.spineX = 0.35 * gather;
    out.neckX = 0.25 * gather;
    out.rootY = -0.24 * gather;
    return;
  }

  // save — off the line, arms up, thrown to one side.
  const side = dir >= 0 ? 1 : -1;
  out.shoulderL = 2.3 * arc;
  out.shoulderR = 2.3 * arc;
  out.armOutL = 0.5 * arc;
  out.armOutR = 0.5 * arc;
  out.elbowL = 0.1;
  out.elbowR = 0.1;
  out.spineX = -0.15 * arc;
  out.spineZ = 1.05 * side * arc;
  out.twist = 0.2 * side * arc;
  out.neckY = 0.5 * side * arc;
  out.hipL = -0.25 * arc;
  out.hipR = -0.25 * arc;
  out.kneeL = 0.5 * arc;
  out.kneeR = 0.5 * arc;
  out.ankleL = 0.5 * arc;
  out.ankleR = 0.5 * arc;
  out.spreadL = -0.5 * arc;
  out.spreadR = 0.5 * arc;
  out.rootY = 0.42 * arc;
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

/** How much of the action shows, so it eases in and hands back to the stride. */
export function actionWeight(p: number): number {
  if (p < 0.12) return smooth(p / 0.12);
  if (p > 0.82) return smooth((1 - p) / 0.18);
  return 1;
}

/** Actions that hold the body still — the head keeps looking where the pose says. */
export function actionHoldsHead(kind: PlayerAction): boolean {
  return kind === 'celebrate' || kind === 'save' || kind === 'catch';
}

export interface ActionTrigger {
  playerId: string;
  kind: PlayerAction;
  /** Seconds to wait before it starts — a keeper goes as the shot is on its way. */
  delay: number;
  dir: number;
}

/** A save this close to the keeper is gathered, not dived at. Metres. */
const CATCH_REACH = 1.5;

/**
 * Reads the engine each frame and says who just did what.
 *
 * A pass and a shot are a new `ball.flight` appearing, which also carries the
 * outcome the engine has already rolled — so a keeper can be sent the right way
 * before the ball arrives. A flight ENDING is a receive (a pass has been taken) or a
 * celebration (a shot went in). A tackle is logged nowhere, so it is read from the
 * tackle counter going up: whoever has the ball at that moment is the one who won it.
 */
export class ActionWatcher {
  private flight: MatchEngine['ball']['flight'] = null;
  private tackles = 0;

  /** Fills `out` with anything that started since the last call. */
  poll(engine: MatchEngine, out: ActionTrigger[]): void {
    out.length = 0;

    const flight = engine.ball.flight;
    if (flight !== this.flight) {
      const ended = this.flight;
      if (ended) {
        if (ended.kind === 'pass') {
          const owner = engine.ballOwnerId;
          if (owner && owner !== ended.shooterId) {
            out.push({ playerId: owner, kind: 'receive', delay: 0, dir: 1 });
          }
        } else if (ended.outcome === 'goal') {
          out.push({ playerId: ended.shooterId, kind: 'celebrate', delay: 0.15, dir: 1 });
        }
      }

      if (flight) {
        if (flight.kind === 'pass') {
          out.push({ playerId: flight.shooterId, kind: 'pass', delay: 0, dir: 1 });
        } else {
          out.push({ playerId: flight.shooterId, kind: 'shoot', delay: 0, dir: 1 });
          if (flight.outcome === 'save') {
            const keeper = engine.players.find(
              (player) => player.keeper && player.side !== flight.side,
            );
            if (keeper) {
              const dir = flight.toY - keeper.y;
              out.push({
                playerId: keeper.id,
                kind: Math.abs(dir) < CATCH_REACH ? 'catch' : 'save',
                delay: Math.min(0.28, flight.duration * 0.4),
                dir,
              });
            }
          }
        }
      }
    }
    this.flight = flight;

    const tackles = engine.stats.home.tackles + engine.stats.away.tackles;
    if (tackles > this.tackles && engine.ballOwnerId) {
      out.push({ playerId: engine.ballOwnerId, kind: 'tackle', delay: 0, dir: 1 });
    }
    this.tackles = tackles;
  }
}
