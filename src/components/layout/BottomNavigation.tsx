import {
  ChevronsUp,
  Crosshair,
  ShieldHalf,
  ShoppingCart,
  UserPlus,
  Video,
} from 'lucide-react';
import { bottomNavItems } from '@/data/mock/navigation';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { useRankUp } from '@/features/rankup/RankUpContext';
import { useTransfer } from '@/features/transfers/TransferContext';
import type { BottomNavIcon } from '@/features/navigation/types';
import styles from './BottomNavigation.module.css';

/** Placeholder glyphs. Swap for real icon assets in this map only. */
const ICONS: Record<BottomNavIcon, typeof Crosshair> = {
  missions: Crosshair,
  league: ShieldHalf,
  contracts: UserPlus,
  rankup: ChevronsUp,
  store: ShoppingCart,
};

export default function BottomNavigation() {
  const { navigate } = useNavigation();
  const { config: rankup } = useRankUp();
  const { config: transfer } = useTransfer();

  /**
   * Which tabs actually go somewhere.
   *
   * Rank-up drops out of the map when an admin switches the system off, so the
   * button goes inert rather than opening a screen that only says it is closed.
   */
  const targets: Partial<Record<BottomNavIcon, () => void>> = {
    league: () => navigate('league'),
    ...(rankup.enabled ? { rankup: () => navigate('rankup') } : {}),
    ...(transfer.enabled ? { contracts: () => navigate('transfer') } : {}),
  };

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
              // Tabs with no screen stay inert rather than navigating to a route
              // that renders nothing.
              onClick={targets[item.icon]}
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
