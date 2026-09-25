import { useMemo, useState } from 'react';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { playerArtUrl } from '@/features/players/artManifest';
import { usePlayers } from '@/features/players/PlayerContext';
import styles from './AdminCardPicker.module.css';

export interface AdminCardPickerProps {
  /** Catalogue ids currently chosen, in order. */
  selected: readonly string[];
  /** Most that may be chosen. 1 makes it a single pick: a new choice replaces the old. */
  max: number;
  onChange(ids: string[]): void;
}

/**
 * Pick catalogue cards: search by name, filter by tier, tap to add or remove. Shows the
 * 120 best matches, strongest first — the same list the rank-up material picker shows.
 */
export default function AdminCardPicker({ selected, max, onChange }: AdminCardPickerProps) {
  const { players: catalogue } = usePlayers();
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<PlayerSet | 'all'>('all');
  const chosen = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue
      .filter((card) => (tier === 'all' ? true : card.set === tier))
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 120);
  }, [catalogue, query, tier]);

  function toggle(id: string) {
    if (chosen.has(id)) onChange(selected.filter((entry) => entry !== id));
    else if (max === 1) onChange([id]);
    else if (selected.length < max) onChange([...selected, id]);
  }

  const full = max > 1 && selected.length >= max;

  return (
    <div>
      <div className={styles.filters}>
        <input
          className={styles.search}
          value={query}
          placeholder="ค้นหาชื่อการ์ด"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.tiers}>
          <button
            type="button"
            className={`${styles.tierChip} ${tier === 'all' ? styles.tierOn : ''}`}
            onClick={() => setTier('all')}
          >
            ทั้งหมด
          </button>
          {PLAYER_SETS.map((set) => (
            <button
              type="button"
              key={set}
              className={`${styles.tierChip} ${tier === set ? styles.tierOn : ''}`}
              onClick={() => setTier(set)}
            >
              {set}
            </button>
          ))}
        </div>
        <button type="button" className={styles.clear} disabled={selected.length === 0} onClick={() => onChange([])}>
          ล้าง
        </button>
      </div>

      <div className={styles.cards}>
        {visible.length === 0 && <p className={styles.hint}>ไม่พบการ์ด</p>}
        {visible.map((card) => {
          const art = playerArtUrl(card.artId);
          const on = chosen.has(card.id);
          return (
            <button
              type="button"
              key={card.id}
              className={`${styles.card} ${on ? styles.cardOn : ''}`}
              disabled={!on && full}
              onClick={() => toggle(card.id)}
              aria-pressed={on}
            >
              {art ? <img src={art} alt="" /> : <span className={styles.noArt}>{card.set}</span>}
              <span className={styles.cardName}>{card.name}</span>
              <span className={styles.cardMeta}>
                {card.rating} · {card.position} · {card.set}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
