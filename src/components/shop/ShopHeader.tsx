import { ChevronLeft, Home, Volleyball } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { SHOP_PAY_KINDS } from '@/features/shop/types';
import CurrencyItem from '@/components/currency/CurrencyItem';
import IconButton from '@/components/ui/IconButton';
import styles from './ShopHeader.module.css';

export interface ShopHeaderProps {
  title: string;
}

/**
 * Back, title, and the two currencies the shop takes — gems first, then FC points,
 * the order the reference draws them in. No cart icon: this is the shop.
 */
export default function ShopHeader({ title }: ShopHeaderProps) {
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
        {[...SHOP_PAY_KINDS].reverse().map((kind) => (
          <CurrencyItem key={kind} currency={currencies[kind]} balance={account.wallet[kind]} />
        ))}

        <span className={styles.action}>
          <IconButton label="กิจกรรม" size={46}>
            <Volleyball size={40} strokeWidth={2} />
          </IconButton>
        </span>
        <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
          <Home size={40} strokeWidth={2} />
        </IconButton>
      </div>
    </header>
  );
}
