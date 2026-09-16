import { ChevronLeft, Home, ShoppingCart, Volleyball } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { TRANSFER_CURRENCY } from '@/features/transfers/constants';
import CurrencyItem from '@/components/currency/CurrencyItem';
import IconButton from '@/components/ui/IconButton';
import styles from './TransferHeader.module.css';

export interface TransferHeaderProps {
  title: string;
}

/**
 * The signing screen's own bar: back, title, the one currency the market runs on,
 * and the event / shop / home shortcuts. Same geometry as the draft bar — the
 * reference puts the back button and title in exactly the same place — but only
 * exchange points on the right, because nothing else is spent here.
 */
export default function TransferHeader({ title }: TransferHeaderProps) {
  const account = useAccount();
  const { back, navigate } = useNavigation();

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
          <ChevronLeft size={38} strokeWidth={3} />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.right}>
        <CurrencyItem
          currency={currencies[TRANSFER_CURRENCY]}
          balance={account.wallet[TRANSFER_CURRENCY]}
        />

        <div className={styles.icons}>
          <span className={styles.action}>
            <IconButton label="กิจกรรม" size={46}>
              <Volleyball size={40} strokeWidth={2} />
            </IconButton>
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
