import { ChevronLeft, Home, ShoppingCart, Volleyball } from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { DRAFT_CURRENCIES } from '@/features/currencies/constants';
import CurrencyBar from '@/components/currency/CurrencyBar';
import IconButton from '@/components/ui/IconButton';
import NotificationBadge from '@/components/navigation/NotificationBadge';
import styles from './DraftTopBar.module.css';

export interface DraftTopBarProps {
  title: string;
}

/**
 * Separate from the home TopBar rather than a mode of it: the two share only the
 * currency cluster, and the rest — back button, screen title, home shortcut — has
 * no counterpart on the home screen.
 */
export default function DraftTopBar({ title }: DraftTopBarProps) {
  const account = useAccount();
  const { back, navigate } = useNavigation();

  return (
    <header className={styles.bar}>
      <div className={styles.scrim} />

      <div className={styles.left}>
        <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
          <ChevronLeft size={38} strokeWidth={3} />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.right}>
        <CurrencyBar balances={account.wallet} kinds={DRAFT_CURRENCIES} />

        <div className={styles.icons}>
          <span className={styles.action}>
            <IconButton label="กิจกรรม" size={46}>
              <Volleyball size={40} strokeWidth={2} />
            </IconButton>
            <NotificationBadge badge={{ variant: 'dot' }} />
          </span>
          <IconButton label="ร้านค้า" size={46}>
            <ShoppingCart size={40} strokeWidth={2} />
          </IconButton>
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
