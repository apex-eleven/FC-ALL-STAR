import { useCallback, useEffect, useState } from 'react';

/**
 * Fullscreen, with the orientation lock that makes it worth having on a phone.
 *
 * The stage is 2048x942 — wider than 2:1. Held upright, a phone can only show it
 * about a third the size it needs to be, so "fullscreen" on mobile really means
 * "fullscreen and landscape". The lock is attempted right after the request because
 * it is only permitted while an element is actually fullscreen.
 *
 * iOS Safari implements neither on the document, so the hook reports unsupported
 * there and the UI asks the player to rotate instead of offering a button that would
 * do nothing.
 */

/**
 * `lock` is typed as required in lib.dom but is genuinely missing on iOS and on some
 * desktop builds, so it is re-declared optional rather than trusted.
 */
type OrientationLock = Omit<ScreenOrientation, 'lock'> & {
  lock?(orientation: 'landscape' | 'portrait' | 'any'): Promise<void>;
};

function fullscreenElement(): Element | null {
  const owner = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? owner.webkitFullscreenElement ?? null;
}

export interface FullscreenApi {
  isFullscreen: boolean;
  /** False on browsers that do not implement it — iOS Safari, most notably. */
  supported: boolean;
  enter(): Promise<void>;
  exit(): Promise<void>;
  toggle(): Promise<void>;
}

export function useFullscreen(): FullscreenApi {
  const [isFullscreen, setIsFullscreen] = useState(() => fullscreenElement() !== null);

  // Covers the ways out that never pass through this hook: the Escape key, the
  // Android back gesture, the browser's own chrome.
  useEffect(() => {
    const sync = () => setIsFullscreen(fullscreenElement() !== null);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const supported =
    typeof document !== 'undefined' &&
    Boolean(
      document.documentElement.requestFullscreen ??
        (document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> })
          .webkitRequestFullscreen,
    );

  const enter = useCallback(async () => {
    const element = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };

    try {
      if (element.requestFullscreen) await element.requestFullscreen({ navigationUI: 'hide' });
      else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
    } catch {
      // Refused (not a user gesture, or disallowed by the embedder). Nothing to
      // recover from — the game is perfectly playable in a normal tab.
      return;
    }

    const orientation = screen.orientation as unknown as OrientationLock | undefined;
    try {
      await orientation?.lock?.('landscape');
    } catch {
      // Desktop browsers reject this outright, and that is fine: a window that is
      // already wide has nothing to rotate.
    }
  }, []);

  const exit = useCallback(async () => {
    const owner = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    try {
      screen.orientation?.unlock?.();
    } catch {
      // Not supported everywhere; leaving fullscreen releases it anyway.
    }

    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (owner.webkitExitFullscreen) await owner.webkitExitFullscreen();
    } catch {
      // Already out.
    }
  }, []);

  const toggle = useCallback(async () => {
    if (fullscreenElement()) await exit();
    else await enter();
  }, [enter, exit]);

  return { isFullscreen, supported, enter, exit, toggle };
}

/** True while the window is taller than it is wide — a phone held upright. */
export function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(
    () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth,
  );

  useEffect(() => {
    const sync = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return portrait;
}

/**
 * A touch device, judged by input rather than by screen size.
 *
 * A narrow desktop window is not a phone, and asking someone to rotate their monitor
 * is the kind of thing that makes people close a tab.
 */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const sync = (event: MediaQueryListEvent) => setTouch(event.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return touch;
}
