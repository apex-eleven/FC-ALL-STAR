import type { CSSProperties } from 'react';
import { Clock, ThumbsUp } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { formatCurrency } from '@/features/currencies/constants';
import { plusTone } from '@/features/rankup/constants';
import { countdown, formatBaht, payOptions } from '@/features/shop/shop';
import type { CardSize, ShopItem } from '@/features/shop/types';
import ShopRewardLine from './ShopRewardLine';
import useRewardView from './useRewardView';
import styles from './ShopItemCard.module.css';

export interface ShopItemCardProps {
  item: ShopItem;
  size: CardSize;
  now: Date;
  /** null when the item has no limit. */
  remaining: number | null;
  bonusPending: boolean;
  onOpen(): void;
}

/** 16-point starburst for the VALUE badge, generated once. */
const STARBURST = 'polygon(50.0% 0.0%, 58.0% 9.8%, 69.1% 3.8%, 72.8% 15.9%, 85.4% 14.6%, 84.1% 27.2%, 96.2% 30.9%, 90.2% 42.0%, 100.0% 50.0%, 90.2% 58.0%, 96.2% 69.1%, 84.1% 72.8%, 85.4% 85.4%, 72.8% 84.1%, 69.1% 96.2%, 58.0% 90.2%, 50.0% 100.0%, 42.0% 90.2%, 30.9% 96.2%, 27.2% 84.1%, 14.6% 85.4%, 15.9% 72.8%, 3.8% 69.1%, 9.8% 58.0%, 0.0% 50.0%, 9.8% 42.0%, 3.8% 30.9%, 15.9% 27.2%, 14.6% 14.6%, 27.2% 15.9%, 30.9% 3.8%, 42.0% 9.8%)';

/**
 * One card in the shop row.
 *
 * Everything on it is optional and admin-set: title and subtitle over the art, the
 * purchase limit, the thumbs-up quantity strip, the VALUE starburst, the reward line
 * with its first-purchase BONUS, the price (a dark band or a lime button), and the
 * countdown strip. With no art uploaded the card draws itself from its first reward.
 */
export default function ShopItemCard({
  item,
  size,
  now,
  remaining,
  bonusPending,
  onOpen,
}: ShopItemCardProps) {
  const view = useRewardView();
  const first = item.rewards[0];
  const lead = first?.kind ?? 'fcpoint';
  const leadIcon = first ? view(first).icon : currencies.fcpoint.icon;
  const leadPlus = first?.kind === 'card' ? first.plus : 0;
  const soldOut = remaining !== null && remaining <= 0;
  const options = payOptions(item);
  const hasCountdown = item.showCountdown && item.endAt !== '';

  const price =
    options.length > 0 ? (
      <span className={styles.priceParts}>
        {options.map((option, index) => (
          <span key={option.kind} className={styles.pricePart}>
            {index > 0 && <span className={styles.slash}>/</span>}
            <img className={styles.priceIcon} src={currencies[option.kind].icon} alt="" />
            {formatCurrency(option.amount)}
          </span>
        ))}
      </span>
    ) : item.priceBaht !== null ? (
      formatBaht(item.priceBaht)
    ) : (
      'ฟรี'
    );

  return (
    <button
      type="button"
      className={`${styles.card} ${size === 'tall' ? styles.tall : styles.regular} ${
        soldOut ? styles.soldOut : ''
      }`}
      data-lead={lead}
      onClick={onOpen}
    >
      {item.image ? (
        <img className={styles.art} src={item.image} alt="" draggable={false} />
      ) : (
        <span className={styles.fallback}>
          {/* Above the portrait, never on it — the art carries its own rating. */}
          {leadPlus > 0 && (
            <span
              className={styles.plus}
              style={{ '--plus-tone': plusTone(leadPlus) } as CSSProperties}
            >
              +{leadPlus}
            </span>
          )}
          <img
            className={`${styles.fallbackIcon} ${lead === 'card' ? styles.fallbackCard : ''}`}
            src={leadIcon}
            alt=""
          />
        </span>
      )}

      {(item.title || item.subtitle || (item.showLimit && item.limit > 0)) && (
        <span className={styles.head}>
          {item.title && <span className={styles.title}>{item.title}</span>}
          {item.subtitle && <span className={styles.subtitle}>{item.subtitle}</span>}
          {item.showLimit && item.limit > 0 && (
            <span className={styles.limit}>
              {item.limitPeriod === 'daily' ? 'จำกัดการซื้อต่อวัน' : 'จำกัดการซื้อ'}: {item.limit}
            </span>
          )}
        </span>
      )}

      {item.quantity > 0 && (
        <span className={styles.quantity}>
          <ThumbsUp className={styles.thumb} size={46} strokeWidth={0} fill="#ffffff" />
          <span className={styles.quantityNumber}>{formatCurrency(item.quantity)}</span>
        </span>
      )}

      {item.valuePercent > 0 && (
        <span className={styles.value} style={{ clipPath: STARBURST }}>
          <span className={styles.valueNumber}>
            {item.valuePercent}
            <small>%</small>
          </span>
          <span className={styles.valueWord}>VALUE</span>
        </span>
      )}

      <span
        className={`${styles.bottom} ${item.priceStyle === 'button' ? styles.bottomButton : ''} ${
          hasCountdown ? styles.bottomTimed : ''
        }`}
      >
        {item.showRewards && item.rewards.length > 0 && (
          <span className={styles.rewards}>
            <ShopRewardLine rewards={item.rewards} bonus={bonusPending ? item.firstBonus : []} />
          </span>
        )}

        {item.priceStyle === 'button' ? (
          <span className={styles.priceButton}>{soldOut ? 'ซื้อครบแล้ว' : price}</span>
        ) : (
          <span className={styles.priceBand}>{soldOut ? 'ซื้อครบแล้ว' : price}</span>
        )}
      </span>

      {hasCountdown && (
        <span className={styles.countdown}>
          <Clock size={22} strokeWidth={3} />
          หมดอายุใน: <span className={styles.countdownTime}>{countdown(item.endAt, now)}</span>
        </span>
      )}
    </button>
  );
}
