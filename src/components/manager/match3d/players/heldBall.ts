import { Vector3 } from 'three';
import {
  ACTION_METADATA,
  DISTRIBUTE_VARIANT,
  type AnimationCommand,
} from './FootballAnimationStateMachine';

/**
 * Where the ball is drawn while a keeper holds it (`BallVisualState.inHandsOf`): in
 * the hands that hold it, read off the body's bones each frame.
 *
 * The engine keeps the ball at the keeper's feet the whole time — it has no hands —
 * so, like the ball's height in flight, this is cosmetic and changes nothing it
 * decides. What it follows is the command the body is already playing:
 *
 *   catch / dive    both hands, from the moment they close on it
 *   distribution    both hands, then the one that plays it (a roll or a throw: the
 *                   right; a drop kick: the left, which lets it fall onto the boot)
 *   in between      held against the chest, eased to and from the hands with the
 *                   action's own weight
 *
 * Without the model's hand bones (the procedural body) the chest point stands in for
 * the hands. Pure over its inputs apart from the scratch vectors; allocates nothing.
 */

export type Grip = 'both' | 'right' | 'left';

/** A body that can say where a held ball sits in its hands this frame. */
export interface HandsSource {
  gripPoint(out: Vector3, grip: Grip): boolean;
}

/** Held against the chest, in front of the body: metres at stature 1 (where every catch ends). */
const CARRY_FORWARD = 0.3;
const CARRY_HEIGHT = 1.0;

/**
 * Each distribution take's hold, in the take's normalised time (the pack fits every
 * take to GK_DISTRIBUTE's 1.3 s with the release at 0.5; README in
 * public/models/players): the ball goes from both hands to `grip` between `from` and
 * `to`, where the clip's hands part (measured from the clips' wrist spacing).
 */
const DISTRIBUTE_GRIP: Readonly<Record<number, { grip: Grip; from: number; to: number }>> = {
  [DISTRIBUTE_VARIANT.ROLL]: { grip: 'right', from: 0.025, to: 0.1 },
  [DISTRIBUTE_VARIANT.THROW]: { grip: 'right', from: 0, to: 0.07 },
  [DISTRIBUTE_VARIANT.OVERHAND]: { grip: 'right', from: 0.21, to: 0.27 },
  [DISTRIBUTE_VARIANT.DROP_KICK]: { grip: 'left', from: 0.02, to: 0.1 },
};

/**
 * The drop kick: the left hand lets the ball go at DROP_RELEASE and it falls from in
 * front of the body onto the right boot, which meets it at the take's contact, out to
 * the right — the kick sweeps round. Body-local metres at stature 1 (to the left,
 * forward, up), measured on player_v1: the ball in the left hand at the release, and
 * the right toe at the kick with the ball's radius above it.
 */
const DROP_RELEASE = 0.25;
const DROP_FROM = { side: 0.02, forward: 0.8, height: 0.9 } as const;
const DROP_TO = { side: -0.56, forward: 0.36, height: 0.3 } as const;
const DROP_CONTACT = ACTION_METADATA.GK_DISTRIBUTE.clip.ballContactTime ?? 0.5;

const carry = new Vector3();
const both = new Vector3();
const one = new Vector3();

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

/**
 * A point `forward` in front of the body, `height` up and `side` to its left, scaled by
 * stature, into `out`. The body faces (sin h, cos h); its left is (cos h, −sin h).
 */
function bodyPoint(
  out: Vector3,
  x: number,
  z: number,
  heading: number,
  stature: number,
  forward: number,
  height: number,
  side = 0,
): Vector3 {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return out.set(x + (sin * forward + cos * side) * stature, height * stature, z + (cos * forward - sin * side) * stature);
}

/**
 * The held ball's world position into `out`, for the keeper at (x, z) facing
 * `heading`, drawn by `command`. `body` is the posed model, or null for the procedural
 * body.
 */
export function heldBallPoint(
  out: Vector3,
  command: AnimationCommand,
  x: number,
  z: number,
  heading: number,
  stature: number,
  body: HandsSource | null,
): Vector3 {
  bodyPoint(carry, x, z, heading, stature, CARRY_FORWARD, CARRY_HEIGHT);
  const action = command.action;
  const weight = action.state === null ? 0 : clamp01(action.weight);
  if (weight <= 0) return out.copy(carry);
  const p = action.normalizedTime;

  if (action.state === 'GK_DISTRIBUTE' && action.variant === DISTRIBUTE_VARIANT.DROP_KICK && p >= DROP_RELEASE) {
    // Let go: falling, faster as it goes, onto the boot.
    // Falling, faster as it goes (down by the square of the time), onto the boot. After
    // the kick the flight has it.
    const k = clamp01((p - DROP_RELEASE) / Math.max(1e-3, DROP_CONTACT - DROP_RELEASE));
    const drop = k * k;
    bodyPoint(
      one,
      x,
      z,
      heading,
      stature,
      DROP_FROM.forward + (DROP_TO.forward - DROP_FROM.forward) * k,
      DROP_FROM.height + (DROP_TO.height - DROP_FROM.height) * drop,
      DROP_FROM.side + (DROP_TO.side - DROP_FROM.side) * k,
    );
    return out.copy(carry).lerp(one, weight);
  }

  let held = carry;
  if (body && (action.state === 'GK_CATCH' || action.state === 'GK_DIVE_LEFT' || action.state === 'GK_DIVE_RIGHT')) {
    if (body.gripPoint(both, 'both')) held = both;
  } else if (body && action.state === 'GK_DISTRIBUTE') {
    const plan = DISTRIBUTE_GRIP[action.variant];
    if (body.gripPoint(both, 'both')) held = both;
    const share = plan ? clamp01((p - plan.from) / Math.max(1e-3, plan.to - plan.from)) : 0;
    if (plan && share > 0 && body.gripPoint(one, plan.grip)) {
      held = held === both ? both.lerp(one, share) : one;
    }
  }
  if (held === carry && action.state === 'GK_DISTRIBUTE' && action.variant === DISTRIBUTE_VARIANT.DROP_KICK) {
    // No hands to follow: brought out in front to where it is let go.
    bodyPoint(one, x, z, heading, stature, DROP_FROM.forward, DROP_FROM.height, DROP_FROM.side);
    held = one.lerp(carry, 1 - clamp01(p / DROP_RELEASE));
  }
  return out.copy(carry).lerp(held, weight);
}
