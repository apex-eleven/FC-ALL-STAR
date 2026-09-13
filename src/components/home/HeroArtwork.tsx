import type { CSSProperties } from 'react';
import { heroBackdrop } from '@/data/mock/home';
import styles from './HeroArtwork.module.css';

/**
 * Renders the key art's figure region. Placement is data, not CSS — change
 * heroBackdrop in data/mock/home.ts to refit a different image.
 */
export default function HeroArtwork() {
  const { source, focus } = heroBackdrop;

  const windowStyle = {
    left: focus.left,
    top: focus.top,
    width: focus.width,
    height: focus.height,
    '--fade-left': focus.fadeLeft,
    '--fade-right': focus.fadeRight,
  } as CSSProperties;

  return (
    <div className={styles.window} style={windowStyle} aria-hidden="true">
      <img
        className={styles.art}
        src={source}
        alt=""
        style={{
          width: focus.artWidth,
          height: focus.artHeight,
          left: focus.artOffsetX,
          top: focus.artOffsetY,
        }}
      />
    </div>
  );
}
