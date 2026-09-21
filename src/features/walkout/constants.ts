import type { WalkoutConfig } from './types';

export const WALKOUT_CONFIG_KEY = 'football-home-ui:walkout:v1';

/**
 * Measured against the shipped clip, `src/assets/video/walkout.mp4`.
 *
 * 28.14s at 60fps, 1080x810, with an audio track. It is the old flight (7.06s) and
 * stage (21.06s) clips joined end to end without re-encoding, so the picture is
 * unchanged. The stage half starts on a keyframe at **7.08s**, which is why that is
 * the default loop point: seeking to a keyframe is instant, so the loop has no seam.
 *
 * Keyframes in the shipped clip, for picking another loop point that stays smooth:
 * 3.86 · 5.52 · 6.94 · 7.08 · 11.30 · 15.47 · 19.63 · 23.80 · 27.97
 *
 * The three reveals sit early in the intro so the last stretch is pure build-up.
 */
export const DEFAULT_WALKOUT: WalkoutConfig = {
  enabled: true,
  // Tier A only, which is what the rating threshold was standing in for before tiers
  // could be selected directly.
  sets: ['A'],
  useMinRating: false,
  minRating: 121,
  nationAt: 1.5,
  positionAt: 3,
  clubAt: 4.5,
  loopStart: 7.08,
  autoCloseSeconds: 0,
};

/** Length of the shipped clip. Only a fallback — the real length is read off the video. */
export const CLIP_DURATION = 28.14;

/**
 * How close to the end the loop jumps back.
 *
 * Seeking a frame early rather than waiting for `ended` is what makes it seamless:
 * `ended` pauses the element first, and that pause is a visible black frame on most
 * phones. One frame at 60fps.
 */
export const LOOP_LEAD = 1 / 60;

export const MIN_RATING_FLOOR = 1;
export const MIN_RATING_CEILING = 199;
