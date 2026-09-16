import type { ShopReward } from '@/features/shop/types';
import useRewardView from './useRewardView';
import styles from './ShopRewardLine.module.css';

export interface ShopRewardLineProps {
  rewards: readonly ShopReward[];
  /** Drawn after a "+", in green with BONUS under it. Empty once claimed. */
  bonus: readonly ShopReward[];
}

/** "icon 5,000 + icon 5,000 BONUS" — what the FC-point packs show above the price. */
export default function ShopRewardLine({ rewards, bonus }: ShopRewardLineProps) {
  const view = useRewardView();
  const entries = [
    ...rewards.map((reward) => ({ reward, isBonus: false })),
    ...bonus.map((reward) => ({ reward, isBonus: true })),
  ];

  return (
    <div className={styles.line}>
      {entries.map(({ reward, isBonus }, index) => {
        const shown = view(reward);
        return (
          <span key={`${reward.kind}-${index}`} className={styles.group}>
            {index > 0 && <span className={styles.plus}>+</span>}
            <span className={`${styles.entry} ${isBonus ? styles.bonus : ''}`}>
              <img
                className={`${styles.icon} ${shown.isCard ? styles.cardIcon : ''}`}
                src={shown.icon}
                alt=""
                title={shown.label}
              />
              <span className={styles.amount}>{shown.count}</span>
              {isBonus && <span className={styles.bonusWord}>BONUS</span>}
            </span>
          </span>
        );
      })}
    </div>
  );
}
