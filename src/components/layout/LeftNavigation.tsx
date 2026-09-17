import { ArrowDown, X } from 'lucide-react';
import { railItems } from '@/data/mock/navigation';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useStarPass } from '@/features/starpass/StarPassContext';
import NavItem from '@/components/navigation/NavItem';
import styles from './LeftNavigation.module.css';

export default function LeftNavigation() {
  const { navigate } = useNavigation();
  const { config: starpass } = useStarPass();

  /** Tiles with a screen behind them. The rest stay inert. */
  const select = (id: string) => {
    if (id === 'rail-starpass' && starpass.enabled) navigate('starpass');
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
