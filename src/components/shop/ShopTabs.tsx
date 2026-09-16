import type { ShopSection } from '@/features/shop/types';
import styles from './ShopTabs.module.css';

export interface ShopTabsProps {
  sections: readonly ShopSection[];
  activeId: string;
  onSelect(id: string): void;
}

/** The section tabs across the top — แนะนำ, แต้ม FC และอัญมณี, แลกเปลี่ยน, เงิน. */
export default function ShopTabs({ sections, activeId, onSelect }: ShopTabsProps) {
  return (
    <nav className={styles.bar} aria-label="หมวดร้านค้า">
      {sections.map((section) => {
        const active = section.id === activeId;
        return (
          <button
            type="button"
            key={section.id}
            className={`${styles.tab} ${active ? styles.tabOn : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(section.id)}
          >
            <span className={styles.label}>
              {section.name}
              {active && <span className={styles.underline} />}
            </span>
            {section.badge > 0 && <span className={styles.badge}>{section.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
