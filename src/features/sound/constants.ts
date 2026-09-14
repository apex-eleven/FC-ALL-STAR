import { DEFAULT_TRACK_ID } from './tracks';
import type { SoundConfig } from './types';

export const SOUND_CONFIG_KEY = 'football-home-ui:sound:v1';

/**
 * The key stays at v1 across the music addition on purpose.
 *
 * `normalizeConfig` fills a missing field from these defaults, so a config saved
 * before music existed reads back complete. Bumping the key would have thrown away
 * every player's button and video settings to add a third row.
 */
export const DEFAULT_SOUND: SoundConfig = {
  uiEnabled: true,
  uiVolume: 0.55,
  videoEnabled: true,
  videoVolume: 0.85,
  musicEnabled: true,
  // Well under the others: this one is continuous, and a bed at the volume of a
  // click is a bed nobody can talk over.
  musicVolume: 0.3,
  musicTrackId: DEFAULT_TRACK_ID,
};

/**
 * What the music drops to while the walkout is on screen, as a fraction of the
 * player's own level.
 *
 * Not zero. The stage clip loops for as long as the player looks at their card, and
 * cutting the music out entirely under it leaves an obvious hole when the overlay
 * closes and it comes back.
 */
export const MUSIC_DUCK_LEVEL = 0.12;

/** How long the music takes to reach a new level. Long enough to read as a fade. */
export const MUSIC_FADE_MS = 700;
export const MUSIC_DUCK_MS = 260;

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
