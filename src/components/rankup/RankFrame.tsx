import type { CSSProperties } from 'react';
import { ASSETS } from '@/assets/assetMap';
import { goldPlusProps, isGoldPlus } from '@/features/rankup/constants';
import styles from './RankFrame.module.css';

export interface RankFrameProps {
  /** The plus level the frame stands for, 1..MAX_PLUS. */
  level: number;
  /** Size and state come from the caller — the ladder and the result card differ. */
  className?: string;
  style?: CSSProperties;
}

/**
 * One rank frame: the supplied art where a level has it (+1..+8), and a frame drawn
 * in code where it does not — the gold tier, +9 and +10. The drawn one fills the same
 * box, so the ladder and the result card lay out the same either way.
 */
export default function RankFrame({ level, className = '', style }: RankFrameProps) {
  const art = ASSETS.rankup.frames[level - 1];
  if (art) {
    return <img className={className} src={art} alt={`+${level}`} style={style} />;
  }

  return (
    <span
      className={`${className} ${styles.drawn} ${isGoldPlus(level) ? styles.gold : ''}`}
      style={style}
      role="img"
      aria-label={`+${level}`}
    >
      <span className={styles.plate} {...goldPlusProps(level)}>
        <span className={styles.number}>+{level}</span>
      </span>
    </span>
  );
}
