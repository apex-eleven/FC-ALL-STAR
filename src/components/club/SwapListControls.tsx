import { useState } from 'react';
import { Filter } from 'lucide-react';
import { PLAYER_SETS } from '@/features/draft/types';
import {
  activeFilters,
  EMPTY_SWAP_FILTER,
  SWAP_SORTS,
  type SwapFilter,
  type SwapSort,
} from '@/features/squad/swapList';
import styles from './SwapListControls.module.css';

export interface SwapListControlsProps {
  sort: SwapSort;
  onSort(sort: SwapSort): void;
  filter: SwapFilter;
  onFilter(filter: SwapFilter): void;
  /** Choices for the club and nation dropdowns, from the cards that could be listed. */
  clubs: readonly string[];
  nations: readonly string[];
}

function bound(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? null : Number.parseInt(digits, 10);
}

/** The sort pill and the filter button along the bottom of the card list. */
export default function SwapListControls({
  sort,
  onSort,
  filter,
  onFilter,
  clubs,
  nations,
}: SwapListControlsProps) {
  const [open, setOpen] = useState<'sort' | 'filter' | null>(null);
  const count = activeFilters(filter);
  const toggle = (which: 'sort' | 'filter') => setOpen((now) => (now === which ? null : which));

  return (
    <div className={styles.controls}>
      <div className={styles.anchor}>
        <button type="button" className={styles.sort} onClick={() => toggle('sort')}>
          <span>{SWAP_SORTS.find((entry) => entry.id === sort)?.label}</span>
          <span className={`${styles.caret} ${open === 'sort' ? styles.caretOpen : ''}`} />
        </button>
        {open === 'sort' && (
          <div className={`${styles.pop} ${styles.sortMenu}`} role="menu">
            {SWAP_SORTS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="menuitemradio"
                aria-checked={entry.id === sort}
                className={`${styles.option} ${entry.id === sort ? styles.optionOn : ''}`}
                onClick={() => {
                  onSort(entry.id);
                  setOpen(null);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.anchor}>
        <button
          type="button"
          className={`${styles.filter} ${count > 0 ? styles.filterOn : ''}`}
          onClick={() => toggle('filter')}
        >
          <Filter size={30} strokeWidth={2.4} />
          <span>ตัวกรอง</span>
          {count > 0 && <span className={styles.count}>{count}</span>}
        </button>
        {open === 'filter' && (
          <div className={`${styles.pop} ${styles.filterMenu}`}>
            <span className={styles.heading}>ระดับการ์ด</span>
            <div className={styles.chips}>
              {PLAYER_SETS.map((set) => {
                const on = filter.sets.includes(set);
                return (
                  <button
                    key={set}
                    type="button"
                    className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                    onClick={() =>
                      onFilter({
                        ...filter,
                        sets: on ? filter.sets.filter((s) => s !== set) : [...filter.sets, set],
                      })
                    }
                  >
                    {set}
                  </button>
                );
              })}
            </div>

            <label className={styles.field}>
              <span className={styles.heading}>สโมสร</span>
              <select
                className={styles.input}
                value={filter.club}
                onChange={(event) => onFilter({ ...filter, club: event.target.value })}
              >
                <option value="">ทั้งหมด</option>
                {clubs.map((club) => (
                  <option key={club} value={club}>
                    {club}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.heading}>ประเทศ</span>
              <select
                className={styles.input}
                value={filter.nation}
                onChange={(event) => onFilter({ ...filter, nation: event.target.value })}
              >
                <option value="">ทั้งหมด</option>
                {nations.map((nation) => (
                  <option key={nation} value={nation}>
                    {nation}
                  </option>
                ))}
              </select>
            </label>

            <span className={styles.heading}>ช่วง OVR</span>
            <div className={styles.range}>
              <input
                className={styles.input}
                inputMode="numeric"
                placeholder="ต่ำสุด"
                value={filter.minOvr ?? ''}
                onChange={(event) => onFilter({ ...filter, minOvr: bound(event.target.value) })}
              />
              <span>–</span>
              <input
                className={styles.input}
                inputMode="numeric"
                placeholder="สูงสุด"
                value={filter.maxOvr ?? ''}
                onChange={(event) => onFilter({ ...filter, maxOvr: bound(event.target.value) })}
              />
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.reset}
                disabled={count === 0}
                onClick={() => onFilter(EMPTY_SWAP_FILTER)}
              >
                ล้างตัวกรอง
              </button>
              <button type="button" className={styles.done} onClick={() => setOpen(null)}>
                ตกลง
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
