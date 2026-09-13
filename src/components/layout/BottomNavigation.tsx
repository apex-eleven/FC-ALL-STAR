import {
  ArrowLeftRight,
  Crosshair,
  ShieldHalf,
  ShoppingCart,
  UserPlus,
  Video,
} from 'lucide-react';
import { bottomNavItems } from '@/data/mock/navigation';
import { useNavigation } from '@/features/navigation/NavigationContext';
import type { BottomNavIcon } from '@/features/navigation/types';
import styles from './BottomNavigation.module.css';

/** Placeholder glyphs. Swap for real icon assets in this map only. */
const ICONS: Record<BottomNavIcon, typeof Crosshair> = {
  missions: Crosshair,
  league: ShieldHalf,
  contracts: UserPlus,
  exchange: ArrowLeftRight,
  store: ShoppingCart,
};

export default function BottomNavigation() {
  const { navigate } = useNavigation();

  return (
    <>
      <button type="button" className={styles.stream} aria-label="Live stream">
        <Video size={26} strokeWidth={2.2} />
      </button>

      <nav className={styles.bar} aria-label="Main">
        {bottomNavItems.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <button
              type="button"
              key={item.id}
              aria-current={item.active ? 'page' : undefined}
              className={`${styles.item} ${item.active ? styles.active : ''}`}
              // Only the league has a screen so far; the rest stay inert rather than
              // navigating to a route that renders nothing.
              onClick={item.icon === 'league' ? () => navigate('league') : undefined}
            >
              <span className={styles.iconWrap}>
                <Icon size={34} strokeWidth={2.2} />
              </span>
              <span className={styles.label}>{item.label}</span>
              {item.badge && <span className={styles.itemBadge} />}
            </button>
          );
        })}
      </nav>
    </>
  );
}
