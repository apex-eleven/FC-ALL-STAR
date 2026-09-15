import { useMemo, useState, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import type { OwnedPlayer } from '@/features/club/types';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { ratingWithPlus } from '@/features/rankup/plus';
import { groupOf, type PositionGroup } from '@/features/squad/rating';
import { isInSquad } from '@/features/squad/squad';
import type { Squad } from '@/features/squad/types';
import SquadCard from './SquadCard';
import styles from './CollectionDrawer.module.css';

export interface CollectionDrawerProps {
  players: OwnedPlayer[];
  squad: Squad;
  draggingId: string | null;
  onClose(): void;
  onPointerDown(cardId: string, event: PointerEvent): void;
}

type Sort = 'rating' | 'position' | 'name' | 'newest';

const LINES: { id: PositionGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'ทุกแนว' },
  { id: 'GK', label: 'GK' },
  { id: 'DEF', label: 'กองหลัง' },
  { id: 'MID', label: 'กองกลาง' },
  { id: 'ATT', label: 'กองหน้า' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'rating', label: 'OVR' },
  { id: 'position', label: 'ตำแหน่ง' },
  { id: 'name', label: 'ชื่อ' },
  { id: 'newest', label: 'ได้มาล่าสุด' },
];

/**
 * How many cards are drawn before the "show more" button appears.
 *
 * The club holds up to a thousand, and the artwork is animated: putting all of them
 * in the DOM at once is a frozen tab, not a collection. A page is enough to scroll
 * through, and the filters are there so the card you want is usually on it.
 */
const PAGE = 120;

export default function CollectionDrawer({
  players,
  squad,
  draggingId,
  onClose,
  onPointerDown,
}: CollectionDrawerProps) {
  const [tier, setTier] = useState<PlayerSet | 'all'>('all');
  const [line, setLine] = useState<PositionGroup | 'all'>('all');
  const [sort, setSort] = useState<Sort>('rating');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const tierCounts = useMemo(() => {
    const counts: Record<PlayerSet, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const player of players) counts[player.set] += 1;
    return counts;
  }, [players]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const list = players.filter((player) => {
      if (tier !== 'all' && player.set !== tier) return false;
      if (line !== 'all' && groupOf(player.position) !== line) return false;
      if (needle && !player.name.toLowerCase().includes(needle)) return false;
      return true;
    });

    return list.sort((a, b) => {
      switch (sort) {
        case 'position':
          return a.position.localeCompare(b.position) || ratingWithPlus(b) - ratingWithPlus(a);
        case 'name':
          return a.name.localeCompare(b.name) || ratingWithPlus(b) - ratingWithPlus(a);
        case 'newest':
          return b.acquiredAt.localeCompare(a.acquiredAt);
        default:
          // Sorted on the upgraded rating, or a +8 card would sit below the raw
          // number it was upgraded past and the OVR sort would look broken.
          return ratingWithPlus(b) - ratingWithPlus(a) || a.position.localeCompare(b.position);
      }
    });
  }, [players, tier, line, sort, query]);

  // Any filter change starts the page count over; keeping 600 cards drawn after
  // narrowing to a handful would defeat the point.
  function narrow(apply: () => void) {
    apply();
    setShown(PAGE);
  }

  const page = filtered.slice(0, shown);

  return (
    <div className={styles.drawer} role="dialog" aria-label="การ์ดทั้งหมด">
      <div className={styles.head}>
        <h2 className={styles.title}>การ์ดทั้งหมด ({players.length})</h2>
        <span className={styles.count}>
          {filtered.length === players.length ? '' : `ตรงเงื่อนไข ${filtered.length} ใบ`}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
          <X size={20} strokeWidth={2.6} />
        </button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="ค้นหาชื่อนักเตะ"
          value={query}
          onChange={(event) => narrow(() => setQuery(event.target.value))}
        />

        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${tier === 'all' ? styles.chipOn : ''}`}
            onClick={() => narrow(() => setTier('all'))}
          >
            ทุกชุด
          </button>
          {PLAYER_SETS.map((set) => (
            <button
              key={set}
              type="button"
              className={`${styles.chip} ${styles[`set${set}`] ?? ''} ${
                tier === set ? styles.chipOn : ''
              }`}
              onClick={() => narrow(() => setTier(set))}
            >
              {set} · {tierCounts[set]}
            </button>
          ))}
        </div>

        <div className={styles.chips}>
          {LINES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`${styles.chip} ${line === entry.id ? styles.chipOn : ''}`}
              onClick={() => narrow(() => setLine(entry.id))}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className={styles.chips}>
          <span className={styles.sortLabel}>เรียงตาม</span>
          {SORTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`${styles.chip} ${sort === entry.id ? styles.chipOn : ''}`}
              onClick={() => narrow(() => setSort(entry.id))}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.note}>ลากการ์ดออกไปวางในสนามหรือช่องตัวสำรองได้เลย</p>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {players.length === 0
            ? 'ยังไม่มีการ์ด ลองไปสุ่มที่หน้าดราฟต์ก่อน'
            : 'ไม่มีการ์ดที่ตรงกับที่กรองไว้'}
        </p>
      ) : (
        <div className={styles.grid}>
          {page.map((player) => {
            const used = isInSquad(squad, player.id);

            return (
              <div className={`${styles.cell} ${used ? styles.used : ''}`} key={player.id}>
                {used && <span className={styles.usedTag}>ในทีม</span>}
                <SquadCard
                  player={player}
                  scale={0.88}
                  dragging={draggingId === player.id}
                  onPointerDown={(event) => onPointerDown(player.id, event)}
                />
                <span className={styles.cellMeta}>
                  <span className={`${styles.cellTier} ${styles[`set${player.set}`] ?? ''}`}>
                    {player.set}
                  </span>
                  {player.position} · {ratingWithPlus(player)}
                </span>
              </div>
            );
          })}

          {filtered.length > shown && (
            <button
              type="button"
              className={styles.more}
              onClick={() => setShown((current) => current + PAGE)}
            >
              แสดงเพิ่มอีก {Math.min(PAGE, filtered.length - shown)} ใบ
              <span className={styles.moreMeta}>
                ({shown} / {filtered.length})
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
