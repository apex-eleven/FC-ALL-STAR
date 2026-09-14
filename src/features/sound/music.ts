import { MUSIC_DUCK_LEVEL, MUSIC_DUCK_MS, MUSIC_FADE_MS } from './constants';
import { resolveTrack } from './tracks';

/**
 * The looping background track.
 *
 * An `<audio>` element rather than a decoded Web Audio buffer, unlike `sfx.ts`.
 * `decodeAudioData` wants the whole file in memory before a note plays, which for a
 * three-minute song is several megabytes of wait before the menu has any sound at
 * all; an element streams and starts on the first chunk. The cost is no gain node,
 * so the fades below ramp `element.volume` by hand — the same trick the walkout uses
 * on its clips, for the same reason.
 *
 * Pure module state, no React. The context pushes settings in; nothing here reads
 * them back out.
 */

let element: HTMLAudioElement | null = null;

let enabled = false;
let volume = 0.3;
let trackId = '';

/** 1 normally, MUSIC_DUCK_LEVEL while something louder is on screen. */
let duckFactor = 1;

let fadeHandle: number | null = null;
let fadeIsFrame = true;

let blocked = false;
let unlockArmed = false;
let pausedByHide = false;

const listeners = new Set<() => void>();

/**
 * Whether the browser has refused to start the music.
 *
 * Surfaced so the settings menu can say why it is silent. It resolves itself on the
 * first tap anywhere, so nothing else needs to react to it.
 */
export function isMusicBlocked(): boolean {
  return blocked;
}

export function subscribeMusicBlocked(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce() {
  listeners.forEach((listener) => listener());
}

function setBlocked(next: boolean) {
  if (blocked === next) return;
  blocked = next;
  announce();
}

// ---------------------------------------------------------------- volume ramps

/** Where the element's volume should end up, given everything currently in play. */
function targetVolume(): number {
  if (!enabled) return 0;
  const gain = resolveTrack(trackId)?.gain ?? 1;
  return Math.max(0, Math.min(1, volume * gain * duckFactor));
}

function cancelRamp() {
  if (fadeHandle === null || typeof window === 'undefined') return;
  if (fadeIsFrame) window.cancelAnimationFrame(fadeHandle);
  else window.clearTimeout(fadeHandle);
  fadeHandle = null;
}

/**
 * Slides the element to a level over `ms`.
 *
 * `requestAnimationFrame` stops firing in a background tab, which would strand a
 * fade at whatever level it had reached and leave the track playing inaudibly
 * forever. The timer fallback is throttled there rather than frozen, so the ramp
 * still finishes — slowly, which nobody is listening to anyway.
 */
function ramp(to: number, ms: number, done?: () => void) {
  cancelRamp();
  if (!element) return;

  if (ms <= 0 || typeof window === 'undefined') {
    element.volume = to;
    done?.();
    return;
  }

  const from = element.volume;
  const startedAt = Date.now();
  fadeIsFrame = typeof window.requestAnimationFrame === 'function';

  const step = () => {
    if (!element) return;
    const progress = Math.min(1, (Date.now() - startedAt) / ms);
    element.volume = Math.max(0, Math.min(1, from + (to - from) * progress));

    if (progress < 1) {
      fadeHandle = fadeIsFrame
        ? window.requestAnimationFrame(step)
        : window.setTimeout(step, 40);
      return;
    }

    fadeHandle = null;
    done?.();
  };

  fadeHandle = fadeIsFrame
    ? window.requestAnimationFrame(step)
    : window.setTimeout(step, 40);
}

// --------------------------------------------------------------- the element

function ensureElement(): HTMLAudioElement | null {
  if (element) return element;
  if (typeof window === 'undefined') return null;

  const audio = new Audio();
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  // A missing or unplayable file must not take the menu down with it. Silence is
  // the failure mode; an unhandled rejection on every settings change is not.
  audio.addEventListener('error', () => setBlocked(false));

  element = audio;
  document.addEventListener('visibilitychange', onVisibilityChange);
  return audio;
}

/**
 * Starts playing, fading up from silence.
 *
 * Autoplay is refused until the player has interacted with the page, and the game
 * loads straight into a sign-in screen, so the first attempt of a session is
 * *expected* to fail. It arms a one-shot listener instead of giving up: the tap that
 * signs the player in is the gesture that starts the music.
 */
async function start() {
  const audio = ensureElement();
  if (!audio || !enabled) return;

  // Nothing to play into a hidden tab, and a paused-then-resumed element is a
  // cheaper way back than a refused play() that arms an unlock listener.
  if (typeof document !== 'undefined' && document.hidden) {
    pausedByHide = true;
    return;
  }

  audio.volume = 0;

  try {
    await audio.play();
    setBlocked(false);
    disarmUnlock();
    ramp(targetVolume(), MUSIC_FADE_MS);
  } catch {
    setBlocked(true);
    armUnlock();
  }
}

function stop() {
  ramp(0, MUSIC_FADE_MS, () => element?.pause());
}

// ------------------------------------------------------------------- unlocking

function onFirstGesture() {
  disarmUnlock();
  void start();
}

function armUnlock() {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  // Capture phase, so a handler that stops propagation cannot swallow the gesture
  // that was going to turn the music on.
  window.addEventListener('pointerdown', onFirstGesture, true);
  window.addEventListener('keydown', onFirstGesture, true);
}

function disarmUnlock() {
  if (typeof window === 'undefined') return;
  unlockArmed = false;
  window.removeEventListener('pointerdown', onFirstGesture, true);
  window.removeEventListener('keydown', onFirstGesture, true);
}

function onVisibilityChange() {
  if (!element) return;

  if (document.hidden) {
    if (!element.paused) {
      pausedByHide = true;
      element.pause();
    }
    return;
  }

  if (pausedByHide && enabled) {
    pausedByHide = false;
    void start();
  }
}

// ---------------------------------------------------------------------- public

export function setMusicEnabled(next: boolean) {
  if (enabled === next) return;
  enabled = next;

  if (next) void start();
  else stop();
}

export function setMusicVolume(next: number) {
  volume = Math.max(0, Math.min(1, next));
  // Straight to the level, not a fade: this is called on every step of a slider
  // drag, and a 700ms ramp restarted 60 times a second never arrives anywhere.
  cancelRamp();
  if (element) element.volume = targetVolume();
}

/**
 * Swaps the track, fading out first.
 *
 * Cutting one song to another mid-bar is the harshest thing this system could do,
 * and it would happen every time a player browsed the picker.
 */
export function setMusicTrack(nextId: string) {
  if (trackId === nextId) return;

  const apply = () => {
    const track = resolveTrack(nextId);
    trackId = nextId;
    if (!element || !track) return;

    element.src = track.src;
    element.currentTime = 0;
    if (enabled) void start();
  };

  if (element && !element.paused) ramp(0, 240, apply);
  else apply();
}

/** Drops the music under something louder. Pairs with `unduckMusic`. */
export function duckMusic() {
  duckFactor = MUSIC_DUCK_LEVEL;
  ramp(targetVolume(), MUSIC_DUCK_MS);
}

export function unduckMusic() {
  duckFactor = 1;
  ramp(targetVolume(), MUSIC_FADE_MS);
}

/**
 * First push of the stored settings, at startup.
 *
 * Separate from the setters because those each compare against the previous value
 * and do nothing when it matches — which, on the very first call, it always does.
 */
export function initMusic(config: { enabled: boolean; volume: number; trackId: string }) {
  const audio = ensureElement();
  if (!audio) return;

  enabled = config.enabled;
  volume = config.volume;
  trackId = config.trackId;

  const track = resolveTrack(trackId);
  if (!track) return;

  audio.src = track.src;
  if (enabled) void start();
}
