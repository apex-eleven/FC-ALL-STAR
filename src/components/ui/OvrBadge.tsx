import { useState, type CSSProperties } from 'react';
import styles from './OvrBadge.module.css';

export interface OvrBadgeProps {
  rating: number;
  /** Box size in design pixels. The artwork is square and scales to fit. */
  size: number;
  labelSize: number;
  valueSize: number;
  className?: string;
}

/** Drop-in file name under `public/brand/`, same convention as the currency icons. */
const BADGE_FILE = '/brand/ovrbanner_OVRBADGE_MASTER.png';

/**
 * The OVR shield, shared by the home tile and the squad panel.
 *
 * Both used to draw their own shield in CSS — a gradient, a gold border, and a
 * `clip-path` chevron — which meant two shields that had to be kept looking alike by
 * hand. Now both render one component, and the shield itself is artwork dropped into
 * `public/brand/`.
 *
 * The drawn version survives as the fallback: if the file is not there, the badge
 * still looks like a badge rather than like bare numbers on the background.
 */
export default function OvrBadge({
  rating,
  size,
  labelSize,
  valueSize,
  className = '',
}: OvrBadgeProps) {
  const [missing, setMissing] = useState(false);

  const style = {
    width: size,
    height: size,
    '--ovr-label-size': `${labelSize}px`,
    '--ovr-value-size': `${valueSize}px`,
  } as CSSProperties;

  return (
    <span className={`${styles.badge} ${missing ? styles.drawn : ''} ${className}`} style={style}>
      {!missing && (
        <img className={styles.art} src={BADGE_FILE} alt="" onError={() => setMissing(true)} />
      )}
      <span className={styles.label}>OVR</span>
      <span className={styles.value}>{rating}</span>
    </span>
  );
}
