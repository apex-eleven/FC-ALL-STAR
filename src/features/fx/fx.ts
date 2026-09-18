/**
 * How much the game spends on looks, per device.
 *
 * Two CSS properties cost far more than everything else on a phone: `backdrop-filter`
 * (every blurred panel is a second pass over what is behind it) and `filter: blur` on
 * a full-screen layer. The club screen has nine blurred panels, a blurred stage wash
 * and a drop-shadow on every card — a desktop GPU shrugs; a mid-range phone drops to
 * a slideshow before a single card has moved.
 *
 * So the player decides:
 *
 * | mode   | what happens                                                    |
 * | ------ | --------------------------------------------------------------- |
 * | `lite` | no blurred panels, no blurred wash, no card drop-shadows         |
 * | `auto` | `lite` on a touch device or a weak one, `rich` otherwise         |
 * | `rich` | everything, whatever the device                                  |
 *
 * `auto` is the default, which is why a phone is smooth without anyone finding this
 * setting and a desktop keeps the artwork it can afford.
 *
 * Per device, never shared: it is stored under its own key, which `features/backup`
 * keeps out of the settings an admin pushes to everyone.
 */

export type FxMode = 'lite' | 'auto' | 'rich';
/** What the page is actually drawing: `auto` resolves to one of these. */
export type FxLevel = 'lite' | 'rich';

export const FX_KEY = 'football-home-ui:fx:v1';
export const FX_MODES: readonly FxMode[] = ['lite', 'auto', 'rich'];
export const DEFAULT_FX: FxMode = 'auto';

export const FX_LABEL: Record<FxMode, string> = {
  lite: 'ลื่นสุด',
  auto: 'อัตโนมัติ',
  rich: 'สวยสุด',
};

/** Read back from storage, repaired: a hand-edited value is not trusted. */
export function normalizeMode(value: unknown): FxMode {
  return FX_MODES.includes(value as FxMode) ? (value as FxMode) : DEFAULT_FX;
}

export function loadFx(): FxMode {
  try {
    return normalizeMode(window.localStorage.getItem(FX_KEY));
  } catch {
    return DEFAULT_FX;
  }
}

export function saveFx(mode: FxMode): void {
  try {
    window.localStorage.setItem(FX_KEY, mode);
  } catch {
    // The choice still applies to this session; it just will not be remembered.
  }
}

/**
 * Whether this device should be spared the expensive effects.
 *
 * A touch screen is the giveaway — phones and tablets are where this hurts. The core
 * and memory counts catch a weak laptop too; both are missing on Safari, where the
 * touch test has already answered.
 */
function weakDevice(): boolean {
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return touch || cores <= 4 || memory <= 4;
}

export function levelOf(mode: FxMode): FxLevel {
  if (mode === 'auto') return weakDevice() ? 'lite' : 'rich';
  return mode;
}

let current: FxMode = DEFAULT_FX;

/** Puts the resolved level on `<html data-fx>`, which is what `globals.css` reads. */
export function applyFx(mode: FxMode): void {
  current = mode;
  document.documentElement.dataset.fx = levelOf(mode);
}

export function fxMode(): FxMode {
  return current;
}
