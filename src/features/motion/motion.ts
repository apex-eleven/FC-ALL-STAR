/**
 * How much the game is allowed to animate on this device.
 *
 * The browser's "reduce motion" accessibility setting — on by default under Android
 * battery saver, Windows "animation effects off", and iOS Reduce Motion — turns every
 * transition in the app into 1ms. For a menu that is a kindness; for the gachapon reel
 * it means the strip teleports to the winning card and the screen sits still until the
 * prize appears, which reads as a broken page rather than a preference being honoured.
 *
 * So the player decides here instead:
 *
 * | mode     | what happens                                    |
 * | -------- | ----------------------------------------------- |
 * | `full`   | everything animates, whatever the device says    |
 * | `system` | follows the device's reduce-motion setting       |
 * | `off`    | nothing animates, whatever the device says       |
 *
 * `full` is the default: the reel, the walkout and the card reveals are the game, not
 * decoration around it. Anyone who needs the opposite has both other modes one tap
 * away in the settings menu.
 *
 * Per device, never shared: it is stored under its own key, which `features/backup`
 * keeps out of the settings an admin pushes to everyone.
 */

export type MotionMode = 'full' | 'system' | 'off';

export const MOTION_KEY = 'football-home-ui:motion:v1';
export const MOTION_MODES: readonly MotionMode[] = ['full', 'system', 'off'];
export const DEFAULT_MOTION: MotionMode = 'full';

export const MOTION_LABEL: Record<MotionMode, string> = {
  full: 'เต็มที่',
  system: 'ตามเครื่อง',
  off: 'ปิด',
};

/** Read back from storage, repaired: a hand-edited value is not trusted. */
export function normalizeMode(value: unknown): MotionMode {
  return MOTION_MODES.includes(value as MotionMode) ? (value as MotionMode) : DEFAULT_MOTION;
}

export function loadMotion(): MotionMode {
  try {
    return normalizeMode(window.localStorage.getItem(MOTION_KEY));
  } catch {
    // Blocked storage means the default, not a crash.
    return DEFAULT_MOTION;
  }
}

export function saveMotion(mode: MotionMode): void {
  try {
    window.localStorage.setItem(MOTION_KEY, mode);
  } catch {
    // The choice still applies to this session; it just will not be remembered.
  }
}

/** True when the device itself asks for less motion. */
function deviceAsksForLess(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

let current: MotionMode = DEFAULT_MOTION;

/**
 * Puts the mode on `<html data-motion>`, which is what `globals.css` reads, and keeps
 * it where `animates()` can be asked without touching storage again.
 */
export function applyMotion(mode: MotionMode): void {
  current = mode;
  document.documentElement.dataset.motion = mode;
}

export function motionMode(): MotionMode {
  return current;
}

/**
 * Whether a long animation should actually be played.
 *
 * Code that waits for an animation to finish has to ask: a five-second reel with the
 * transition switched off is five seconds of nothing.
 */
export function animates(): boolean {
  if (current === 'full') return true;
  if (current === 'off') return false;
  return !deviceAsksForLess();
}
