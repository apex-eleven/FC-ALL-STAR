import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { PLAYER_SETS, type DraftEvent, type PlayerSet } from '@/features/draft/types';
import styles from './DraftPoolBrowser.module.css';

export interface DraftPoolBrowserProps {
  event: DraftEvent;
  onClose(): void;
}

const SET_LABEL: Record<PlayerSet, string> = {
  A: 'ชุด A',
  B: 'ชุด B',
  C: 'ชุด C',
  D: 'ชุด D',
};

/**
 * Everything that can come out of this pack, grouped by tier.
 *
 * The odds shown are shares of the weights that are actually in play: a tier with
 * nobody in it is dropped at pull time, so printing its configured weight here would
 * advertise a chance that does not exist.
 */
export default function DraftPoolBrowser({ event, onClose }: DraftPoolBrowserProps) {
  const [filter, setFilter] = useState<PlayerSet | 'all'>('all');

  const grouped = useMemo(() => {
    const groups: Record<PlayerSet, typeof event.pool> = { A: [], B: [], C: [], D: [] };
    for (const player of event.pool) groups[player.set].push(player);
    for (const set of PLAYER_SETS) groups[set].sort((a, b) => b.rating - a.rating);
    return groups;
  }, [event.pool]);

  const shares = useMemo(() => {
    const live = PLAYER_SETS.filter((set) => grouped[set].length > 0);
    const total = live.reduce((sum, set) => sum + (event.odds[set] ?? 0), 0);
    return Object.fromEntries(
      PLAYER_SETS.map((set) => [
        set,
        total > 0 && grouped[set].length > 0 ? ((event.odds[set] ?? 0) / total) * 100 : 0,
      ]),
    ) as Record<PlayerSet, number>;
  }, [event.odds, grouped]);

  const shown = filter === 'all' ? PLAYER_SETS : [filter];

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="นักเตะทั้งหมดในแพ็ค">
      <div className={styles.backdrop} onClick={onClose} />

      <div className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title}>{event.title}</h2>
          <span className={styles.total}>ทั้งหมด {event.pool.length} ใบ</span>
          <button type="button" className={styles.close} data-sound="back" onClick={onClose}>
            <X size={22} strokeWidth={2.8} />
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${filter === 'all' ? styles.tabOn : ''}`}
            onClick={() => setFilter('all')}
          >
            ทั้งหมด
          </button>
          {PLAYER_SETS.map((set) => (
            <button
              key={set}
              type="button"
              className={`${styles.tab} ${styles[`set${set}`] ?? ''} ${
                filter === set ? styles.tabOn : ''
              }`}
              disabled={grouped[set].length === 0}
              onClick={() => setFilter(set)}
            >
              {SET_LABEL[set]} · {grouped[set].length}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {shown.map((set) =>
            grouped[set].length === 0 ? null : (
              <section key={set} className={styles.group}>
                <h3 className={`${styles.groupHead} ${styles[`set${set}`] ?? ''}`}>
                  <span className={styles.groupName}>{SET_LABEL[set]}</span>
                  <span className={styles.groupMeta}>
                    {grouped[set].length} ใบ · โอกาส {shares[set].toFixed(1)}%
                  </span>
                </h3>

                <div className={styles.grid}>
                  {grouped[set].map((player) => (
                    <div key={player.id} className={styles.cell}>
                      <img className={styles.art} src={player.portrait} alt="" loading="lazy" />
                      <span className={styles.name}>{player.name}</span>
                      <span className={styles.meta}>
                        {player.rating} · {player.position}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ),
          )}

          {event.pool.length === 0 && <p className={styles.empty}>แพ็คนี้ยังไม่มีการ์ด</p>}
        </div>
      </div>
    </div>
  );
}
