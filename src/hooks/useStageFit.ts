import { useEffect, useState, type RefObject } from 'react';

export const STAGE_WIDTH = 2048;
export const STAGE_HEIGHT = 942;

export interface StageFit {
  /** Offset of the stage's top-left corner inside the container, in CSS pixels. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface UseStageFitOptions {
  /**
   * How far the container's aspect ratio may differ from the stage's before we give
   * up on filling it. Inside this tolerance the stage stretches very slightly so the
   * window is filled edge to edge; outside it, the stage scales uniformly and
   * letterboxes.
   *
   * 1.06 is roughly the point where a human starts to notice a circle is an ellipse.
   * Stretching is preferred over cropping because cropping would eat into the top bar
   * and bottom navigation, which sit flush against the stage edges.
   */
  maxStretch?: number;
}

function measure(width: number, height: number, maxStretch: number): StageFit {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };

  const sx = width / STAGE_WIDTH;
  const sy = height / STAGE_HEIGHT;
  const mismatch = Math.max(sx, sy) / Math.min(sx, sy);

  const fills = mismatch <= maxStretch;
  const uniform = Math.min(sx, sy);
  const scaleX = fills ? sx : uniform;
  const scaleY = fills ? sy : uniform;

  return {
    x: (width - STAGE_WIDTH * scaleX) / 2,
    y: (height - STAGE_HEIGHT * scaleY) / 2,
    scaleX,
    scaleY,
  };
}

/**
 * Fits the fixed 2048x942 stage into its container.
 *
 * Measures the container element rather than the window: the window includes
 * browser chrome and any scrollbar, and using it is what produced an off-centre
 * stage. Positioning is explicit too — a transformed element still occupies its
 * untransformed 2048px in layout, so a 2048px box inside a narrower scroll
 * container gets pinned to the start edge instead of centring, and scaling about
 * the centre then pushes it sideways. We place the corner ourselves and scale from
 * `transform-origin: 0 0`, which has no such failure mode.
 */
export function useStageFit(
  ref: RefObject<HTMLElement | null>,
  { maxStretch = 1.06 }: UseStageFitOptions = {},
): StageFit {
  const [fit, setFit] = useState<StageFit>(() =>
    typeof window === 'undefined'
      ? { x: 0, y: 0, scaleX: 1, scaleY: 1 }
      : measure(window.innerWidth, window.innerHeight, maxStretch),
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setFit(measure(rect.width, rect.height, maxStretch));
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    // Catches zoom changes and full-screen toggles, which do not always resize the
    // element on their own.
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [ref, maxStretch]);

  return fit;
}
