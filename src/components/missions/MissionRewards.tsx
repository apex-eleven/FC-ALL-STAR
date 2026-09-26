import type { MissionReward } from '@/features/missions/types';
import { goldPlusProps } from '@/features/rankup/constants';
import useRewardView from '@/components/shop/useRewardView';
import styles from './MissionRewards.module.css';

export interface MissionRewardsProps {
  rewards: readonly MissionReward[];
  /** Smaller chips, for under a chest. */
  compact?: boolean;
  className?: string;
}

/** Reward chips: currency coin or card portrait, with the amount under it. */
export default function MissionRewards({ rewards, compact = false, className = '' }: MissionRewardsProps) {
  const view = useRewardView();
  return (
    <div className={`${styles.row} ${compact ? styles.compact : ''} ${className}`}>
      {rewards.map((reward, index) => {
        const shown = view(reward);
        return (
          <span key={`${reward.kind}-${index}`} className={styles.chip} title={shown.text}>
            <img
              className={`${styles.icon} ${shown.isCard ? styles.card : ''}`}
              src={shown.icon}
              alt=""
              draggable={false}
            />
            {reward.kind === 'card' && reward.plus > 0 && (
              <span className={styles.plus} {...goldPlusProps(reward.plus)}>
                +{reward.plus}
              </span>
            )}
            <span className={styles.amount}>
              {reward.kind === 'card' ? `x${reward.amount}` : shown.count}
            </span>
          </span>
        );
      })}
    </div>
  );
}
