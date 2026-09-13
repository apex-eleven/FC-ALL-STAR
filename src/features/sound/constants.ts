import type { SoundConfig } from './types';

export const SOUND_CONFIG_KEY = 'football-home-ui:sound:v1';

export const DEFAULT_SOUND: SoundConfig = {
  uiEnabled: true,
  uiVolume: 0.55,
  videoEnabled: true,
  videoVolume: 0.85,
};

/**
 * Two gestures closer together than this share one tick.
 *
 * A pointerdown that also bubbles through a wrapping button, or a double tap on a
 * nav item, would otherwise stack two identical clicks a few milliseconds apart and
 * read as a rattle rather than a click.
 */
export const SOUND_THROTTLE_MS = 45;

/**
 * What counts as an affordance worth a click.
 *
 * The listener is delegated from the document rather than wired into each button, so
 * a new screen gets the sound without touching its components. `[data-sound]` is in
 * the list so a non-button element can opt in, and `[data-sound="off"]` opts out.
 */
export const INTERACTIVE_SELECTOR =
  'button, [role="button"], a[href], input[type="checkbox"], input[type="radio"], select, [data-sound]';
