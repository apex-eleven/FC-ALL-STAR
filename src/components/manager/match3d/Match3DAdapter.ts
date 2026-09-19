import { PITCH_LENGTH, PITCH_WIDTH } from '@/features/manager/matchEngine';

/**
 * Presentation-only mapping from the match engine's flat pitch coordinates into the
 * 3D scene's world space. Nothing here decides anything about the match: the engine
 * stays authoritative and this file only relabels the numbers it already produces.
 *
 * Engine space: `x` runs 0..105 from the home goal to the away goal, `y` runs 0..68
 * from the top touchline to the bottom one. World space: X is the pitch's width, Z
 * is its length, Y is height. The pitch centre (52.5, 34) is the world origin, which
 * keeps the engine's own "home attacks +x" convention as "home attacks +Z".
 */

export const PITCH_HALF_LENGTH = PITCH_LENGTH / 2;
export const PITCH_HALF_WIDTH = PITCH_WIDTH / 2;

/** Everything the engine reports is on the deck; height is a rendering choice. */
export const GROUND_Y = 0;

export function engineToWorldX(engineY: number): number {
  return engineY - PITCH_HALF_WIDTH;
}

export function engineToWorldZ(engineX: number): number {
  return engineX - PITCH_HALF_LENGTH;
}

/** Structurally a THREE.Vector3, so this file never has to import three. */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export function engineToWorldPosition(
  engineX: number,
  engineY: number,
  height: number = GROUND_Y,
): WorldPoint {
  return { x: engineToWorldX(engineY), y: height, z: engineToWorldZ(engineX) };
}

/**
 * How high a ball in flight looks like it is.
 *
 * COSMETIC ONLY. The engine's ball is flat — it has an x and a y and no third
 * dimension — and it stays the authority on where the ball is and what becomes of
 * it. This only answers the question the engine never asks: how far off the deck it
 * should be drawn while it travels.
 *
 * The curve starts and ends at `rest`, so the ball never jumps when a flight begins
 * or the ball is collected. A driven shot is flatter than a ball played up the pitch.
 */
export function flightHeight(
  kind: 'pass' | 'shot',
  distance: number,
  progress: number,
  rest: number,
  endHeight: number,
): number {
  const along = Math.max(0, Math.min(1, progress));
  const rise = Math.max(0, endHeight - rest);
  // A pass comes back down to the deck, so it is a plain arc. A shot is aimed at a
  // height, and how much it bows depends on how high that is: a drive along the
  // ground barely leaves it, a ball into the top corner climbs.
  const bow =
    kind === 'shot'
      ? Math.min(1, distance * 0.02) * (0.25 + rise * 0.4)
      : Math.min(2.6, Math.max(0.15, distance * 0.09));
  return rest + (endHeight - rest) * along + Math.sin(along * Math.PI) * bow;
}

/** Crossbar height. A shot on target finishes below this, one off it may not. */
const CROSSBAR = 2.44;

/**
 * How high a shot finishes.
 *
 * DERIVED, NOT SIMULATED. The engine decides whether a shot is on target and whether
 * it goes in; it has no notion of height at all, so this invents one — the same one
 * every time for a given shot, because it is seeded from the shot's own numbers.
 * Nothing reads it back: it changes how the ball is drawn and nothing else.
 */
export function shotEndHeight(
  fromX: number,
  fromY: number,
  toY: number,
  onTarget: boolean,
  rest: number,
): number {
  let seed = 0x811c9dc5;
  for (const value of [fromX, fromY, toY]) {
    seed ^= Math.round(value * 1000) >>> 0;
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const roll = (seed >>> 8) / 0x1000000;

  if (onTarget) {
    // Most shots on target are hit low; the top corner is the rarer one.
    return rest + roll * roll * (CROSSBAR - rest - 0.15);
  }
  // Off target can still be a low ball dragged wide, or one lifted over.
  return rest + roll * 3.1;
}

/**
 * A loose ball settling, once nobody has collected it. Cosmetic like the arc above —
 * the engine has already decided where on the grass it ends up.
 */
export function bounceHeight(elapsed: number, energy: number, rest: number): number {
  const decay = Math.exp(-elapsed * 2.4);
  if (decay < 0.04) return rest;
  return rest + Math.abs(Math.sin(elapsed * 6.5)) * energy * decay;
}

/** The frame-loop form: writes in place so a moving player allocates nothing. */
export function writeWorldPosition(
  target: WorldPoint,
  engineX: number,
  engineY: number,
  height: number = GROUND_Y,
): void {
  target.x = engineToWorldX(engineY);
  target.y = height;
  target.z = engineToWorldZ(engineX);
}
