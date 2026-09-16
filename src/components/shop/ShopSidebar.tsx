import type { ShopCategory } from '@/features/shop/types';
import styles from './ShopSidebar.module.css';

export interface ShopSidebarProps {
  categories: readonly ShopCategory[];
  activeId: string;
  footerNote: string;
  onSelect(id: string): void;
}

/** The category rail on the left, with the shop's small print underneath. */
export default function ShopSidebar({ categories, activeId, footerNote, onSelect }: ShopSidebarProps) {
  return (
    <aside className={styles.rail}>
      <div className={styles.list}>
        {categories.map((category) => {
          const active = category.id === activeId;
          return (
            <button
              type="button"
              key={category.id}
              className={`${styles.item} ${active ? styles.itemOn : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(category.id)}
            >
              <span className={styles.name}>{category.name}</span>
            </button>
          );
        })}
      </div>

      {footerNote && <p className={styles.footer}>{footerNote}</p>}
    </aside>
  );
}
