import { Mail, Settings, Users } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { HOME_CURRENCIES } from '@/features/currencies/constants';
import type { CurrencyKind, Wallet } from '@/features/currencies/types';
import type { BadgeInfo } from '@/types/common';
import IconButton from '@/components/ui/IconButton';
import NotificationBadge from '@/components/navigation/NotificationBadge';
import CurrencyItem from './CurrencyItem';
import styles from './CurrencyBar.module.css';

export interface CurrencyBarProps {
  balances: Wallet;
  /** Which currencies to show. Differs per screen — see constants. */
  kinds?: readonly CurrencyKind[];
  mailBadge?: BadgeInfo;
  onAdd?: (kind: CurrencyKind) => void;
  onSettings?: () => void;
}

export default function CurrencyBar({
  balances,
  kinds = HOME_CURRENCIES,
  mailBadge,
  onAdd,
  onSettings,
}: CurrencyBarProps) {
  return (
    <div className={styles.bar}>
      {kinds.map((kind) => (
        <CurrencyItem
          key={kind}
          currency={currencies[kind]}
          balance={balances[kind]}
          onAdd={onAdd}
        />
      ))}

      <div className={styles.social}>
        <IconButton label="Friends" size={46}>
          <Users size={40} strokeWidth={2} />
        </IconButton>

        <span className={styles.action}>
          <IconButton label="Messages" size={46}>
            <Mail size={40} strokeWidth={2} />
          </IconButton>
          {mailBadge && <NotificationBadge badge={mailBadge} />}
        </span>

        <IconButton label="ตั้งค่า" size={46} onClick={onSettings}>
          <Settings size={40} strokeWidth={2} />
        </IconButton>
      </div>
    </div>
  );
}
