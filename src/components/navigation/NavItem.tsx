import type { RailItem } from '@/features/navigation/types';
import ArtImage from '@/components/ui/ArtImage';
import NotificationBadge from './NotificationBadge';
import styles from './NavItem.module.css';

export interface NavItemProps {
  item: RailItem;
  onSelect?: (id: string) => void;
}

/** Thai labels use the UI face; Latin labels use the condensed display face. */
const isLatin = (value: string) => /^[\x20-\x7F]+$/.test(value);

export default function NavItem({ item, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      className={styles.item}
      onClick={() => onSelect?.(item.id)}
    >
      <span className={styles.tile}>
        {item.artworkFile ? (
          <ArtImage className={styles.artwork} file={item.artworkFile} fallback={item.artwork} />
        ) : (
          <img className={styles.artwork} src={item.artwork} alt="" />
        )}
        {item.badge && <NotificationBadge badge={item.badge} />}
      </span>
      <span className={`${styles.label} ${isLatin(item.label) ? styles.labelDisplay : ''}`}>
        {item.label}
      </span>
    </button>
  );
}
