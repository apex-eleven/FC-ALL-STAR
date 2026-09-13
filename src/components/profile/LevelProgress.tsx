import { XP_BAR_WIDTH } from '@/features/profile/constants';
import type { LevelProgress as LevelProgressData } from '@/features/profile/types';
import styles from './LevelProgress.module.css';

export interface LevelProgressProps {
  progress: LevelProgressData;
}

export default function LevelProgress({ progress }: LevelProgressProps) {
  const { level, currentXP, requiredXP } = progress;
  const ratio = requiredXP > 0 ? Math.min(currentXP / requiredXP, 1) : 0;

  return (
    <div className={styles.wrap}>
      <span className={styles.badge}>{level}</span>
      <span
        className={styles.meter}
        style={{ minWidth: XP_BAR_WIDTH }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={requiredXP}
        aria-valuenow={currentXP}
        aria-label={`Level ${level} progress`}
      >
        <span className={styles.value}>
          {currentXP}/{requiredXP}XP
        </span>
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
        </span>
      </span>
    </div>
  );
}
