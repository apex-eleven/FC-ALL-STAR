import { Check, Lock, Shirt } from 'lucide-react';
import type { DisplayCard } from '@/features/club/types';
import type { SellBlock } from '@/features/transfers/transfer';
import SquadCard from '@/components/club/SquadCard';
import PriceTag from './PriceTag';
import styles from './OwnedCell.module.css';

export interface OwnedCellProps {
  card: DisplayCard;
  price: number;
  block: SellBlock;
  selected: boolean;
  onToggleSelect(): void;
  onToggleLock(): void;
}

/**
 * One owned card on the sell tab.
 *
 * A card in the lineup is drawn the way the reference draws it — faded, with the
 * shirt-and-tick mark and "อยู่ในไลน์อัป" — and cannot be picked. The lock in the
 * corner is the player's own guard against selling a card by accident.
 */
export default function OwnedCell({
  card,
  price,
  block,
  selected,
  onToggleSelect,
  onToggleLock,
}: OwnedCellProps) {
  const inLineup = block === 'lineup';
  const locked = block === 'locked';
  const faded = inLineup || block === 'no-price';

  return (
    <div className={`${styles.cell} ${selected ? styles.selected : ''}`}>
      <button
        type="button"
        className={styles.open}
        onClick={onToggleSelect}
        aria-pressed={selected}
        aria-label={card.name}
      >
        <span className={`${styles.art} ${faded ? styles.faded : ''}`}>
          <SquadCard player={card} scale={1.55} interactive={false} />
        </span>

        {inLineup && (
          <span className={styles.lineup}>
            <span className={styles.shirt}>
              <Shirt size={58} strokeWidth={0} fill="#ffffff" />
              <Check className={styles.tick} size={26} strokeWidth={4} />
            </span>
            <span className={styles.lineupText}>อยู่ในไลน์อัป</span>
          </span>
        )}

        {selected && (
          <span className={styles.mark}>
            <Check size={22} strokeWidth={4} />
          </span>
        )}

        <span className={styles.price}>
          {block === 'no-price' ? (
            <span className={styles.noPrice}>ขายไม่ได้</span>
          ) : (
            <PriceTag amount={price} size={30} dimmed={inLineup} />
          )}
        </span>
      </button>

      {!inLineup && (
        <button
          type="button"
          className={`${styles.lock} ${locked ? styles.lockOn : ''}`}
          aria-pressed={locked}
          aria-label={locked ? 'ปลดล็อก' : 'ล็อก'}
          onClick={onToggleLock}
        >
          {/* The reference draws the same closed padlock on every card; the locked
              state is the bright one. */}
          <Lock size={15} strokeWidth={2.8} />
        </button>
      )}
      {inLineup && (
        <span className={`${styles.lock} ${styles.lockIdle}`} aria-hidden="true">
          <Lock size={15} strokeWidth={2.8} />
        </span>
      )}
    </div>
  );
}
