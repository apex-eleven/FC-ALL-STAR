/**
 * Small numeric helpers shared by the visual pipeline. Pure: no React, no three.
 */

const TAU = Math.PI * 2;

/** Wraps any angle into (−π, π]. */
export function wrapAngle(angle: number): number {
  let wrapped = angle % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  else if (wrapped <= -Math.PI) wrapped += TAU;
  return wrapped;
}

/** Shortest signed way round from one angle to another, in (−π, π]. */
export function shortestAngle(from: number, to: number): number {
  return wrapAngle(to - from);
}

/**
 * Interpolates two headings the short way round, so 170° → −170° turns 20°
 * through 180° rather than 340° back through 0°.
 */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + shortestAngle(from, to) * t);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * The share of the remaining gap an exponential ease closes over `elapsed`, for a
 * time constant `tau`. Frame-rate independent: two half-frames close the same gap
 * as one whole one.
 */
export function easeFactor(elapsed: number, tau: number): number {
  if (elapsed <= 0) return 0;
  if (tau <= 0) return 1;
  return 1 - Math.exp(-elapsed / tau);
}
