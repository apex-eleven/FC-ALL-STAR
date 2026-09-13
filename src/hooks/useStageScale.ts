import { useEffect, useState } from 'react';

export const STAGE_WIDTH = 2048;
export const STAGE_HEIGHT = 942;

/**
 * The home screen is a fixed 2048x942 stage, scaled uniformly to fit the viewport.
 * That keeps the reference layout exact at 2048x942 and proportional everywhere else,
 * which is how the original game behaves. See docs/UI_ANALYSIS.md section 1.
 */
export function useStageScale(width = STAGE_WIDTH, height = STAGE_HEIGHT): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const measure = () =>
      setScale(Math.min(window.innerWidth / width, window.innerHeight / height));

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [width, height]);

  return scale;
}
