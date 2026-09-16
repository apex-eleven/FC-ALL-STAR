import { Star } from 'lucide-react';
import type { DisplayCard } from '@/features/club/types';
import SquadCard from '@/components/club/SquadCard';
import PriceTag from './PriceTag';
import styles from './MarketCell.module.css';

export interface MarketCellProps {
  card: DisplayCard;
  price: number;
  watched: boolean;
  onOpen(): void;
  onToggleWatch(): void;
}

/** One card for sale: the art, a watch star in the corner, and its price. */
export default function MarketCell({ card, price, watched, onOpen, onToggleWatch }: MarketCellProps) {
  return (
    <div className={styles.cell}>
      <button type="button" className={styles.open} onClick={onOpen} aria-label={`แลก ${card.name}`}>
        <span className={styles.art}>
          <SquadCard player={card} scale={1.95} interactive={false} />
        </span>
        <span className={styles.price}>
          <PriceTag amount={price} size={34} />
        </span>
      </button>

      <button
        type="button"
        className={`${styles.star} ${watched ? styles.starOn : ''}`}
        aria-pressed={watched}
        aria-label={watched ? 'เลิกติดตาม' : 'ติดตาม'}
        onClick={onToggleWatch}
      >
        <Star size={20} strokeWidth={2.4} fill="currentColor" />
      </button>
    </div>
  );
}
