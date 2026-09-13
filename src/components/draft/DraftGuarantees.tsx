import { remaining } from '@/features/draft/pull';
import type { DraftCounters, PityRule } from '@/features/draft/types';
import styles from './DraftGuarantees.module.css';

export interface DraftGuaranteesProps {
  pity: PityRule[];
  counters: DraftCounters;
}

/**
 * Counters come from the account, not the catalogue: two players on the same browser
 * are different distances from the same guarantee.
 */
export default function DraftGuarantees({ pity, counters }: DraftGuaranteesProps) {
  return (
    <div className={styles.rows}>
      {pity.map((rule) => {
        const left = remaining(rule, counters);

        return (
          <div className={styles.row} key={rule.id}>
            <span
              className={`${styles.pill} ${
                rule.tone === 'primary' ? styles.primary : styles.secondary
              }`}
            >
              {rule.label}
            </span>
            <span className={styles.description}>{rule.description}</span>
            <span className={`${styles.count} ${left === 1 ? styles.imminent : ''}`}>
              {left} ดราฟต์
            </span>
          </div>
        );
      })}
    </div>
  );
}
