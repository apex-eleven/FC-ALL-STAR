import type { WalkoutConfig } from './types';

export const WALKOUT_CONFIG_KEY = 'football-home-ui:walkout:v1';

/**
 * Timings measured against the shipped clips, frame by frame.
 *
 * Flight: 7.042s at 24fps. It brightens from about 6.5s and reaches full white at
 * frame 164 (6.833s), holding it to the end — a saturated window of 0.208s. That
 * window is the only place a cut is invisible, which is why `crossfade` defaults
 * just inside it rather than to something more generous.
 *
 * Stage: 3.000s at 30fps, loops, opens on a dark lantern-lit arena.
 *
 * The three reveals sit in the first two thirds so the last stretch is pure build-up
 * into the flash.
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
  crossfade: 0.2,
  flashOut: 0.65,
  autoCloseSeconds: 0,
};

export const FLIGHT_DURATION = 7.042;
export const STAGE_DURATION = 3;

/** When the flight's white flash reaches full saturation, in seconds. */
export const FLASH_START = 6.833;

export const MIN_RATING_FLOOR = 1;
export const MIN_RATING_CEILING = 199;
