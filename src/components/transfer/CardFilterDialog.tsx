import { useState } from 'react';
import { X } from 'lucide-react';
import { EMPTY_FILTER, GROUP_LABELS, type CardFilter } from '@/features/transfers/filter';
import styles from './CardFilterDialog.module.css';

export interface CardFilterDialogProps {
  title: string;
  initial: CardFilter;
  onApply(filter: CardFilter): void;
  onClose(): void;
}

function toNumber(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? null : Math.min(199, Number.parseInt(digits, 10));
}

/**
 * Search on the market tab, filter on the sell tab — the same three questions
 * either way: a name, a line on the pitch, and an OVR range.
 */
export default function CardFilterDialog({ title, initial, onApply, onClose }: CardFilterDialogProps) {
  const [draft, setDraft] = useState<CardFilter>(initial);

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <form
        className={styles.panel}
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={24} strokeWidth={2.6} />
          </button>
        </header>

        <label className={styles.field}>
          <span className={styles.label}>ชื่อนักเตะ</span>
          <input
            className={styles.input}
            value={draft.query}
            placeholder="พิมพ์ชื่อ"
            autoFocus
            onChange={(event) => setDraft({ ...draft, query: event.target.value })}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>ตำแหน่ง</span>
          <div className={styles.chips}>
            {GROUP_LABELS.map((group) => (
              <button
                type="button"
                key={group.id}
                className={`${styles.chip} ${draft.group === group.id ? styles.chipOn : ''}`}
                onClick={() => setDraft({ ...draft, group: group.id })}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>OVR</span>
          <div className={styles.range}>
            <input
              className={styles.input}
              inputMode="numeric"
              placeholder="ต่ำสุด"
              value={draft.minOvr ?? ''}
              onChange={(event) => setDraft({ ...draft, minOvr: toNumber(event.target.value) })}
            />
            <span className={styles.dash}>–</span>
            <input
              className={styles.input}
              inputMode="numeric"
              placeholder="สูงสุด"
              value={draft.maxOvr ?? ''}
              onChange={(event) => setDraft({ ...draft, maxOvr: toNumber(event.target.value) })}
            />
          </div>
        </div>

        <footer className={styles.actions}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setDraft({ ...EMPTY_FILTER })}
          >
            ล้างค่า
          </button>
          <button type="submit" className={styles.primary}>
            ตกลง
          </button>
        </footer>
      </form>
    </div>
  );
}
