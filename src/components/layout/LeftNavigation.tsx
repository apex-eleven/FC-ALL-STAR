import { ArrowDown, X } from 'lucide-react';
import { railItems } from '@/data/mock/navigation';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useGacha } from '@/features/gacha/GachaContext';
import { useRedeem } from '@/features/redeem/RedeemContext';
import { useStarPass } from '@/features/starpass/StarPassContext';
import NavItem from '@/components/navigation/NavItem';
import styles from './LeftNavigation.module.css';

export default function LeftNavigation() {
  const { navigate } = useNavigation();
  const { config: starpass } = useStarPass();
  const { config: gacha } = useGacha();
  const { config: redeem } = useRedeem();

  /** Tiles with a screen behind them. The rest stay inert. */
  const select = (id: string) => {
    if (id === 'rail-starpass' && starpass.enabled) navigate('starpass');
    if (id === 'rail-bag') navigate('bag');
    if (id === 'rail-activities' && gacha.enabled) navigate('gacha');
    if (id === 'rail-redeem' && redeem.enabled) navigate('redeem');
  };

  return (
    <nav className={styles.rail} aria-label="Featured sections">
      <div className={styles.hint} aria-hidden="true">
        <X size={20} strokeWidth={2.4} />
        <span className={styles.hintLine} />
        <ArrowDown size={20} strokeWidth={2.4} />
      </div>

      {railItems.map((item) => (
        <div className={styles.slot} key={item.id}>
          <NavItem item={item} onSelect={select} />
        </div>
      ))}
    </nav>
  );
}
