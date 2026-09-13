import { Plus } from 'lucide-react';
import type { CurrencyDefinition, CurrencyKind } from '@/features/currencies/types';
import { formatCurrency } from '@/features/currencies/constants';
import styles from './CurrencyItem.module.css';

export interface CurrencyItemProps {
  currency: CurrencyDefinition;
  balance: number;
  onAdd?: (kind: CurrencyKind) => void;
}

export default function CurrencyItem({ currency, balance, onAdd }: CurrencyItemProps) {
  return (
    <div className={styles.item}>
      {/* Fixed-width slot so different icon sizes still leave the amounts aligned. */}
      <span className={styles.iconSlot}>
        <img
          className={styles.icon}
          src={currency.icon}
          alt=""
          style={{ width: currency.iconSize, height: currency.iconSize }}
        />
      </span>
      <span className={styles.amount}>{formatCurrency(balance)}</span>
      {currency.purchasable && (
        <button
          type="button"
          className={styles.add}
          aria-label={`เพิ่ม${currency.label}`}
          onClick={() => onAdd?.(currency.kind)}
        >
          <Plus size={20} strokeWidth={3.4} />
        </button>
      )}
    </div>
  );
}
