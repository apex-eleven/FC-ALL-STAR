import { currencies } from '@/data/mock/currencies';
import { formatCurrency } from '@/features/currencies/constants';
import { TRANSFER_CURRENCY } from '@/features/transfers/constants';
import styles from './PriceTag.module.css';

export interface PriceTagProps {
  amount: number;
  /** Icon box and type size, in design pixels. */
  size?: number;
  dimmed?: boolean;
}

/** Exchange-point icon and an amount — the line under every card on both tabs. */
export default function PriceTag({ amount, size = 32, dimmed = false }: PriceTagProps) {
  return (
    <span className={`${styles.tag} ${dimmed ? styles.dimmed : ''}`} style={{ fontSize: size }}>
      <img
        className={styles.icon}
        src={currencies[TRANSFER_CURRENCY].icon}
        alt=""
        style={{ width: size * 0.95, height: size * 0.95 }}
      />
      <span className={styles.amount}>{formatCurrency(amount)}</span>
    </span>
  );
}
