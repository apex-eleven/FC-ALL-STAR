import { useRef, type CSSProperties, type ReactNode } from 'react';
import { ASSETS } from '@/assets/assetMap';
import { heroBackdrop } from '@/data/mock/home';
import { useStageFit } from '@/hooks/useStageFit';
import styles from './Stage.module.css';

export interface StageProps {
  children?: ReactNode;
  /** Darkens the backdrop so overlay screens read against it. */
  dimmed?: boolean;
}

/**
 * Owns the 2048x942 design stage and its background layers. Every screen renders
 * inside one of these, so the auth overlay scales exactly like the home screen.
 */
export default function Stage({ children, dimmed = false }: StageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fit = useStageFit(viewportRef);
  const { wash } = heroBackdrop;

  const stageStyle = {
    '--stage-x': `${fit.x}px`,
    '--stage-y': `${fit.y}px`,
    '--stage-scale-x': fit.scaleX,
    '--stage-scale-y': fit.scaleY,
    '--halftone-url': `url(${ASSETS.backgrounds.halftone})`,
    '--wash-position': wash.objectPosition,
    '--wash-blur': `${wash.blur}px`,
    '--wash-brightness': wash.brightness,
    '--wash-saturate': wash.saturate,
    '--wash-opacity': wash.opacity,
  } as CSSProperties;

  return (
    <div className={styles.viewport} ref={viewportRef}>
      <div className={`${styles.stage} ${dimmed ? styles.dimmed : ''}`} style={stageStyle}>
        {/* Gradient floor first, then the blurred key art over it. */}
        <img className={styles.background} src={ASSETS.backgrounds.heroBackground} alt="" />
        <img className={styles.wash} src={heroBackdrop.source} alt="" />

        <div className={styles.decoration} aria-hidden="true">
          <span className={styles.halftone} />
          <span className={styles.vignette} />
        </div>

        {children}
      </div>
    </div>
  );
}
