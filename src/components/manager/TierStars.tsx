import { Star } from 'lucide-react';
import styles from './TierStars.module.css';

export interface TierStarsProps {
  /** Stars the tier holds. */
  total: number;
  /** Stars earned. */
  filled: number;
  /** Icon size in design pixels. */
  size: number;
  /** Show how many the tier holds, not progress — for the ladder list. */
  countOnly?: boolean;
  className?: string;
}

/** Past this many a row of icons would run off the screen, so a count is shown. */
const ICON_LIMIT = 5;

/**
 * A tier's stars. Up to five are drawn one by one, as in the reference; a tier with
 * more shows one star and "earned/total", since the count has no upper limit.
 */
export default function TierStars({
  total,
  filled,
  size,
  countOnly = false,
  className = '',
}: TierStarsProps) {
  if (total > ICON_LIMIT) {
    return (
      <span
        className={`${styles.row} ${className}`}
        aria-label={countOnly ? `${total} ดาว` : `${filled} จาก ${total} ดาว`}
      >
        <Star size={size} strokeWidth={0} className={countOnly || filled > 0 ? styles.on : styles.off} />
        <span className={styles.count} style={{ fontSize: size * 0.72 }}>
          {countOnly ? total : `${filled}/${total}`}
        </span>
      </span>
    );
  }

  return (
    <span className={`${styles.row} ${className}`} aria-label={`${filled} จาก ${total} ดาว`}>
      {Array.from({ length: total }, (_, index) => (
        <Star key={index} size={size} strokeWidth={0} className={index < filled ? styles.on : styles.off} />
      ))}
    </span>
  );
}
