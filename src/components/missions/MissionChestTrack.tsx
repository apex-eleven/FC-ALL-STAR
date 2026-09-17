import { Check, Gift } from 'lucide-react';
import { chestStatus } from '@/features/missions/missions';
import type { MissionChest, MissionPeriod, MissionProgress } from '@/features/missions/types';
import MissionRewards from './MissionRewards';
import styles from './MissionChestTrack.module.css';

export interface MissionChestTrackProps {
  period: MissionPeriod;
  chests: readonly MissionChest[];
  progress: MissionProgress;
  onOpen(chest: MissionChest): void;
}

/**
 * The period's point bar with a chest at each threshold. A chest whose points are
 * reached glows and opens on click; an opened one shows a check.
 */
export default function MissionChestTrack({ period, chests, progress, onOpen }: MissionChestTrackProps) {
  const points = progress[period].points;
  const max = Math.max(1, ...chests.map((chest) => chest.points));
  const fill = Math.min(100, (points / max) * 100);

  return (
    <section className={styles.track} aria-label="กล่องแต้มสะสม">
      <div className={styles.score}>
        <span className={styles.scoreLabel}>แต้มสะสม</span>
        <span className={styles.scoreValue}>{points.toLocaleString('en-US')}</span>
      </div>

      <div className={styles.lane}>
        <div className={styles.bar}>
          <div className={styles.fill} style={{ width: `${fill}%` }} />
        </div>

        {chests.map((chest) => {
          const status = chestStatus(progress, period, chest);
          return (
            <div
              key={chest.id}
              className={styles.node}
              style={{ left: `${(chest.points / max) * 100}%` }}
            >
              <button
                type="button"
                className={`${styles.chest} ${styles[status]}`}
                disabled={status !== 'ready'}
                onClick={() => onOpen(chest)}
                aria-label={`กล่อง ${chest.points} แต้ม`}
              >
                {status === 'claimed' ? (
                  <Check size={34} strokeWidth={3.2} />
                ) : (
                  <Gift size={36} strokeWidth={2.2} />
                )}
              </button>
              <span className={styles.points}>{chest.points}</span>
              <MissionRewards rewards={chest.rewards} compact className={styles.rewards} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
