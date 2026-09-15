import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { OwnedPlayer } from '@/features/club/types';
import { canPlace } from '@/features/squad/squad';
import { ratingWithPlus } from '@/features/rankup/plus';
import { effectiveRating, positionPenalty } from '@/features/squad/rating';
import styles from './SlotPicker.module.css';

export interface SlotPickerProps {
  /** Shown on the chip. A bench seat passes its number. */
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
}

/**
 * Everyone who could take this slot, best fit first.
 *
 * Dragging is fine when you know which card you want; it is miserable when you do
 * not, because the card you need might be the fortieth in a drawer. Tapping the slot
 * answers the actual question — who can play here, and what does it cost me.
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
}: SlotPickerProps) {
  const eligible = useMemo(
    () =>
      players
        .filter((player) => (position ? canPlace(position, player).ok : true))
        .map((player) => ({
          player,
          // Both sides of the "before → after" are upgraded ratings. Showing the
          // printed number on the left and the upgraded one on the right would make
          // the penalty look smaller than it is.
          rating: position ? effectiveRating(player, position) : ratingWithPlus(player),
          base: ratingWithPlus(player),
          penalty: position ? positionPenalty(position, player.position) : 0,
        }))
        // Best in this slot first, which is not the same as highest rated.
        .sort((a, b) => b.rating - a.rating || a.player.name.localeCompare(b.player.name)),
    [players, position],
  );

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={`เลือกนักเตะ ${label}`}>
      <div className={styles.backdrop} onClick={onClose} />

      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.slotTag}>{label}</span>
          <h2 className={styles.title}>
            {position ? 'เลือกนักเตะลงตำแหน่งนี้' : 'เลือกนักเตะลงตัวสำรอง'}
          </h2>
          <span className={styles.count}>{eligible.length} ใบ</span>
          <button type="button" className={styles.close} data-sound="back" onClick={onClose}>
            <X size={22} strokeWidth={2.8} />
          </button>
        </div>

        <div className={styles.grid}>
          {eligible.map(({ player, rating, base, penalty }) => {
            // Another card with this name is already in the eleven or on the bench.
            const blocked = isDuplicate(player.id) && player.id !== currentId;

            return (
            <button
              key={player.id}
              type="button"
              disabled={blocked}
              className={`${styles.cell} ${player.id === currentId ? styles.cellOn : ''} ${
                blocked ? styles.cellBlocked : ''
              }`}
              onClick={() => onPick(player.id)}
            >
              <img className={styles.art} src={player.portrait} alt="" loading="lazy" />

              <span className={styles.name}>{player.name}</span>

              <span className={styles.line}>
                <span className={styles.position}>{player.position}</span>
                {penalty === 0 ? (
                  <span className={styles.exact}>{base} · ตรงตำแหน่ง</span>
                ) : (
                  <span className={styles.off}>
                    {base} <span className={styles.arrow}>→</span> {rating}
                    <span className={styles.penalty}>-{penalty}</span>
                  </span>
                )}
              </span>

              {blocked && <span className={styles.used}>ชื่อนี้อยู่ในทีมแล้ว</span>}
              {!blocked && inSquad(player.id) && player.id !== currentId && (
                <span className={styles.used}>อยู่ในทีมแล้ว</span>
              )}
            </button>
            );
          })}

          {eligible.length === 0 && (
            <p className={styles.empty}>
              {position === 'GK'
                ? 'ยังไม่มีผู้รักษาประตูในสโมสร'
                : 'ยังไม่มีนักเตะที่ลงตำแหน่งนี้ได้'}
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <p className={styles.legend}>
            {position ? (
              <>
                ลงผิดตำแหน่งได้ แต่ OVR จะลดตามระยะห่างของตำแหน่ง — แนวเดียวกัน -3 ·
                ห่างหนึ่งแนว -8 · กองหลังไปยืนกองหน้า -15 ·
                ผู้รักษาประตูสลับกับตำแหน่งอื่นไม่ได้เลย
              </>
            ) : (
              <>ตัวสำรองไม่มีตำแหน่งประจำ จึงไม่มีการหัก OVR</>
            )}
            <br />
            นักเตะชื่อเดียวกันลงได้คนเดียวทั้งตัวจริงและตัวสำรอง
          </p>
          {currentId && (
            <button type="button" className={styles.clear} data-sound="back" onClick={onClear}>
              เอาออกจากตำแหน่งนี้
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
