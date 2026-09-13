import type { DraftEvent } from '@/features/draft/types';
import styles from './DraftEventRail.module.css';

export interface DraftEventRailProps {
  events: DraftEvent[];
  selectedId: string;
  onSelect(id: string): void;
}

export default function DraftEventRail({ events, selectedId, onSelect }: DraftEventRailProps) {
  return (
    <nav className={styles.rail} aria-label="ดราฟต์ทั้งหมด">
      {events.map((event) => (
        <div className={styles.slot} key={event.id}>
          <button
            type="button"
            aria-current={event.id === selectedId ? 'true' : undefined}
            className={`${styles.card} ${event.id === selectedId ? styles.selected : ''}`}
            onClick={() => onSelect(event.id)}
          >
            <span className={styles.name}>{event.railName}</span>
            <img className={styles.thumb} src={event.thumbnail} alt="" />
            {event.hot && <span className={styles.hot}>ฮอต</span>}
          </button>
        </div>
      ))}
    </nav>
  );
}
