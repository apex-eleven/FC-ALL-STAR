import { useMemo, useState } from 'react';
import { goldNameProps, goldPlusProps } from '@/features/rankup/constants';
import { X } from 'lucide-react';
import type { OwnedPlayer } from '@/features/club/types';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { clampPlus, ratingWithPlus } from '@/features/rankup/plus';
import SquadCard from '@/components/club/SquadCard';
import styles from './CardPicker.module.css';

export interface CardPickerProps {
  title: string;
  /** Sentence under the title — usually what this level will accept. */
  note?: string;
  players: readonly OwnedPlayer[];
  /** Cards already spoken for, drawn dimmed and unselectable. */
  usedIds?: ReadonlySet<string>;
  /**
   * Cards in the starting eleven. Drives the XI filter and the badge — pass it and
   * the filter appears, leave it out and the picker behaves as before.
   */
  starterIds?: ReadonlySet<string>;
  onPick(cardId: string): void;
  onClose(): void;
}

/**
 * One list, used for both the target card and every material slot.
 *
 * Deliberately not the club's `SlotPicker`: that one filters by pitch position and
 * refuses duplicates, neither of which means anything here. Rank-up cares about
 * rating, tier, and whether a card is already on the table.
 */
export default function CardPicker({
  title,
  note,
  players,
  usedIds,
  starterIds,
  onPick,
  onClose,
}: CardPickerProps) {
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState<PlayerSet | 'all'>('all');
  const [onlyStarters, setOnlyStarters] = useState(false);

  const starterCount = useMemo(
    () => players.filter((card) => starterIds?.has(card.id)).length,
    [players, starterIds],
  );

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...players]
      .filter((card) => (onlyStarters ? (starterIds?.has(card.id) ?? false) : true))
      .filter((card) => (tier === 'all' ? true : card.set === tier))
      .filter((card) => !needle || card.name.toLowerCase().includes(needle))
      .sort((a, b) => ratingWithPlus(b) - ratingWithPlus(a));
  }, [players, query, tier, onlyStarters, starterIds]);

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <div className={styles.panel}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {note && <p className={styles.note}>{note}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={22} strokeWidth={2.6} />
          </button>
        </div>

        <div className={styles.filters}>
          <input
            className={styles.search}
            value={query}
            placeholder="ค้นหาชื่อนักเตะ"
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          <div className={styles.tiers}>
            {/* Only offered when the caller knows the squad, and only when at least
                one of these cards is actually in it — a filter that can only ever
                return nothing is worse than no filter. */}
            {starterCount > 0 && (
              <button
                type="button"
                className={`${styles.tier} ${styles.starterTier} ${
                  onlyStarters ? styles.tierOn : ''
                }`}
                onClick={() => setOnlyStarters((current) => !current)}
                aria-pressed={onlyStarters}
              >
                ตัวจริง {starterCount}
              </button>
            )}
            <button
              type="button"
              className={`${styles.tier} ${tier === 'all' ? styles.tierOn : ''}`}
              onClick={() => setTier('all')}
            >
              ทั้งหมด
            </button>
            {PLAYER_SETS.map((set) => (
              <button
                type="button"
                key={set}
                className={`${styles.tier} ${tier === set ? styles.tierOn : ''}`}
                onClick={() => setTier(set)}
              >
                {set}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.grid}>
          {list.length === 0 && (
            <p className={styles.empty}>
              {onlyStarters ? 'ไม่มีการ์ดตัวจริงที่ตรงกับตัวกรอง' : 'ไม่มีการ์ดที่ใช้ได้'}
            </p>
          )}

          {list.map((card) => {
            const used = usedIds?.has(card.id) ?? false;
            const starter = starterIds?.has(card.id) ?? false;
            const plus = clampPlus(card.plus);

            return (
              <button
                type="button"
                key={card.id}
                className={`${styles.cell} ${used ? styles.cellUsed : ''}`}
                disabled={used}
                onClick={() => onPick(card.id)}
              >
                <SquadCard player={card} scale={0.92} interactive={false} />
                {/* Shown in every mode, not just the XI filter — it is the warning
                    that matters most when picking a card to burn as material. */}
                {starter && <span className={styles.xi}>XI</span>}
                <span className={styles.cellName} {...goldNameProps(card.plus)}>
                  {card.name}
                </span>
                <span className={styles.cellMeta}>
                  {ratingWithPlus(card)} · {card.position}
                  {plus > 0 && (
                    <span className={styles.cellPlus} {...goldPlusProps(plus)}>
                      +{plus}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
