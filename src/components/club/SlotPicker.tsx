import { useMemo, useState } from 'react';
import { ChevronLeft, GitCompareArrows, Home, RefreshCw, ShoppingCart, User, Volleyball } from 'lucide-react';
import type { OwnedPlayer } from '@/features/club/types';
import { canPlace } from '@/features/squad/squad';
import { positionPenalty } from '@/features/squad/rating';
import { cardStats } from '@/features/squad/stats';
import {
  EMPTY_SWAP_FILTER,
  matchesFilter,
  sortSwapList,
  type SwapFilter,
  type SwapSort,
} from '@/features/squad/swapList';
import IconButton from '@/components/ui/IconButton';
import NotificationBadge from '@/components/navigation/NotificationBadge';
import PlayerStatTable from './PlayerStatTable';
import SquadCard from './SquadCard';
import StatRadar from './StatRadar';
import SwapListControls from './SwapListControls';
import styles from './SlotPicker.module.css';

export interface SlotPickerProps {
  /** Names the slot for screen readers. A bench seat passes its number. */
  label: string;
  /**
   * The slot's position, or null for a bench seat — a substitute has no position to
   * be out of, so nothing is filtered and nothing is penalised.
   */
  position: string | null;
  players: readonly OwnedPlayer[];
  /** Already fielded or benched — still listed, but marked so they are not a surprise. */
  inSquad: (cardId: string) => boolean;
  /** Name already in the squad on another card. Those cannot be picked at all. */
  isDuplicate: (cardId: string) => boolean;
  currentId: string | null;
  onPick(cardId: string): void;
  onClear(): void;
  onClose(): void;
  onHome(): void;
  onShop(): void;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value !== ''))].sort((a, b) => a.localeCompare(b));
}

/**
 * สลับนักเตะ — the swap screen a slot opens.
 *
 * Left: the card in the slot, its six-stat radar, and the detail rows. Right: every
 * card that could take the slot. Tapping one puts it in the compare frame and over
 * the radar and rows; the swap only happens on the confirm button.
 *
 * Keepers are left out of outfield slots entirely (and vice versa): that placement is
 * refused, so listing it would only invite a tap that does nothing.
 */
export default function SlotPicker({
  label,
  position,
  players,
  inSquad,
  isDuplicate,
  currentId,
  onPick,
  onClear,
  onClose,
  onHome,
  onShop,
}: SlotPickerProps) {
  const [compareId, setCompareId] = useState<string | null>(null);
  const [sort, setSort] = useState<SwapSort>('position');
  const [filter, setFilter] = useState<SwapFilter>(EMPTY_SWAP_FILTER);

  const current = currentId ? (players.find((player) => player.id === currentId) ?? null) : null;

  const eligible = useMemo(
    () =>
      players.filter(
        (player) => player.id !== currentId && (position ? canPlace(position, player).ok : true),
      ),
    [players, position, currentId],
  );

  const listed = useMemo(
    () => sortSwapList(eligible.filter((player) => matchesFilter(player, filter)), sort, position),
    [eligible, filter, sort, position],
  );

  const clubs = useMemo(() => unique(eligible.map((player) => player.club)), [eligible]);
  const nations = useMemo(() => unique(eligible.map((player) => player.nation)), [eligible]);

  // Cleared if the compared card is filtered away, so the confirm button never swaps
  // in a card the player can no longer see.
  const compared = listed.find((player) => player.id === compareId) ?? null;
  const currentStats = useMemo(() => (current ? cardStats(current) : null), [current]);
  const comparedStats = useMemo(() => (compared ? cardStats(compared) : null), [compared]);

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={`สลับนักเตะ ${label}`}>
      <div className={styles.backdrop} />

      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          data-sound="back"
          onClick={onClose}
          aria-label="ย้อนกลับ"
        >
          <ChevronLeft size={40} strokeWidth={3} />
        </button>
        <h1 className={styles.title}>สลับนักเตะ</h1>
        <div className={styles.icons}>
          <span className={styles.action}>
            <IconButton label="กิจกรรม" size={46}>
              <Volleyball size={40} strokeWidth={2} />
            </IconButton>
            <NotificationBadge badge={{ variant: 'dot' }} />
          </span>
          <IconButton label="ร้านค้า" size={46} onClick={onShop}>
            <ShoppingCart size={40} strokeWidth={2} />
          </IconButton>
          <IconButton label="หน้าหลัก" size={46} onClick={onHome}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </div>
      </header>

      {/* ---- left: the card in the slot ---- */}
      <span className={styles.modeLabel}>
        <RefreshCw size={24} strokeWidth={2.4} />
        {position ? 'เปลี่ยนแทนตัวจริง' : 'เปลี่ยนแทนตัวสำรอง'}
      </span>
      <span className={styles.compareLabel}>
        <GitCompareArrows size={24} strokeWidth={2.4} />
        เปรียบเทียบนักเตะ
      </span>

      <div className={styles.radar}>
        <StatRadar values={currentStats?.face ?? null} compare={comparedStats?.face ?? null} />
      </div>

      {/* After the radar: the card covers the edge of its left labels, as in the
          reference. */}
      <div className={styles.mainCard}>
        {current ? (
          <SquadCard player={current} scale={1.5} interactive={false} />
        ) : (
          <span className={styles.emptyCard}>ว่าง</span>
        )}
      </div>

      <div className={styles.compareSlot}>
        <svg className={styles.shield} viewBox="0 0 148 205" aria-hidden="true">
          <path d="M8 1 H140 L147 8 V150 L74 204 L1 150 V8 Z" />
        </svg>
        {compared ? (
          <button
            type="button"
            className={styles.compareCard}
            onClick={() => setCompareId(null)}
            aria-label="ยกเลิกการเปรียบเทียบ"
          >
            <SquadCard player={compared} scale={1.2} interactive={false} />
          </button>
        ) : (
          <span className={styles.compareEmpty}>
            <User className={styles.silhouette} size={96} strokeWidth={0} />
            <span>
              เปรียบเทียบ
              <br />
              นักเตะ
            </span>
          </span>
        )}
      </div>

      <div className={styles.table}>
        <PlayerStatTable stats={currentStats} compare={comparedStats} />
      </div>

      {/* ---- right: the list ---- */}
      <section className={styles.list}>
        <h2 className={styles.listTitle}>รายชื่อนักเตะ</h2>

        <div className={styles.grid}>
          {listed.map((player) => {
            // Another card with this name is already in the eleven or on the bench.
            const blocked = isDuplicate(player.id);
            const penalty = position ? positionPenalty(position, player.position) : 0;
            const chosen = player.id === compareId;

            return (
              <button
                key={player.id}
                type="button"
                disabled={blocked}
                className={`${styles.cell} ${chosen ? styles.cellOn : ''} ${
                  blocked ? styles.cellBlocked : ''
                }`}
                onClick={() => setCompareId(chosen ? null : player.id)}
              >
                <SquadCard player={player} scale={1.55} interactive={false} />
                {penalty > 0 && <span className={styles.penalty}>-{penalty}</span>}
                {blocked ? (
                  <span className={styles.tag}>ชื่อซ้ำในทีม</span>
                ) : (
                  inSquad(player.id) && <span className={styles.tag}>อยู่ในทีม</span>
                )}
              </button>
            );
          })}

          {listed.length === 0 && (
            <p className={styles.empty}>
              {eligible.length > 0
                ? 'ไม่มีการ์ดตรงกับตัวกรอง'
                : position === 'GK'
                  ? 'ยังไม่มีผู้รักษาประตูในสโมสร'
                  : 'ยังไม่มีนักเตะที่ลงตำแหน่งนี้ได้'}
            </p>
          )}
        </div>

        <div className={styles.bar}>
          <SwapListControls
            sort={sort}
            onSort={setSort}
            filter={filter}
            onFilter={setFilter}
            clubs={clubs}
            nations={nations}
          />
          <span className={styles.divider} />
          <div className={styles.buttons}>
            {currentId && (
              <button type="button" className={styles.clear} data-sound="back" onClick={onClear}>
                เอาออก
              </button>
            )}
            <button
              type="button"
              className={styles.confirm}
              disabled={!compared}
              onClick={() => compared && onPick(compared.id)}
            >
              {current ? 'สลับตัว' : 'ลงตำแหน่ง'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
