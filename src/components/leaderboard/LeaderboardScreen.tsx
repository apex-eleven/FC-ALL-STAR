import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Trophy, X } from 'lucide-react';
import { ASSETS } from '@/assets/assetMap';
import { avatarSource } from '@/features/avatars/extraAvatars';
import { fetchLeaderboard } from '@/features/cloud/cloudLeaderboard';
import { isCloudEnabled } from '@/features/cloud/firebase';
import { FORMATIONS } from '@/features/squad/constants';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import PitchSlot from '@/components/club/PitchSlot';
import OvrBadge from '@/components/ui/OvrBadge';
import styles from './LeaderboardScreen.module.css';

export interface LeaderboardScreenProps {
  /** The signed-in account's own uid, so its row reads "คุณ" instead of its own name. */
  selfUid: string;
  onClose(): void;
}

/** Same idea as a cup bracket: clubs have no crests, so every row wears an avatar. */
function avatarSrc(avatarId: string): string {
  return avatarSource(avatarId);
}

/**
 * The button that used to be "การแก้ไขทีม" (disabled — there was nothing behind it
 * yet) opens this instead: real accounts, ranked by OVR, with their actual starting
 * eleven on view.
 *
 * A separate table from the cups (`features/cup`) on purpose — this one
 * never resets and only ever reflects the strongest eleven an account has fielded
 * lately, whether or not they have entered a cup today.
 */
export default function LeaderboardScreen({ selfUid, onClose }: LeaderboardScreenProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard().then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const formation = useMemo(() => {
    if (!selected) return null;
    return FORMATIONS[selected.formation] ?? FORMATIONS['4-3-3-attack'];
  }, [selected]);

  const cardsBySlot = useMemo(() => {
    if (!selected) return new Map();
    return new Map(selected.cards.map((card) => [card.slotId, card]));
  }, [selected]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Leaderboard">
      <div className={styles.backdrop} onClick={onClose} />

      <div className={styles.panel}>
        <header className={styles.head}>
          {selected ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setSelected(null)}
              aria-label="กลับไปที่ตาราง"
            >
              <ChevronLeft size={22} strokeWidth={2.8} />
            </button>
          ) : (
            <span className={styles.iconButton}>
              <Trophy size={22} strokeWidth={2.4} />
            </span>
          )}

          <h2 className={styles.title}>
            {selected ? selected.username : 'Leaderboard'}
          </h2>

          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={20} strokeWidth={2.6} />
          </button>
        </header>

        {selected ? (
          <div className={styles.detail}>
            <div className={styles.detailMeta}>
              <img className={styles.detailAvatar} src={avatarSrc(selected.avatarId)} alt="" />
              <div className={styles.detailText}>
                <span className={styles.detailFormation}>{formation?.name ?? selected.formation}</span>
                <span className={styles.detailUpdated}>
                  อัปเดตล่าสุด{' '}
                  {new Date(selected.updatedAt).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <OvrBadge rating={selected.rating} size={84} labelSize={11} valueSize={30} />
            </div>

            <div className={styles.pitchFrame}>
              <div className={styles.pitchStage}>
                <img className={styles.pitchArt} src={ASSETS.backgrounds.pitchStadium} alt="" />
                {formation?.slots.map((slot) => (
                  <PitchSlot
                    key={slot.id}
                    slot={slot}
                    player={cardsBySlot.get(slot.id) ?? null}
                    dragging={false}
                    over={false}
                    blocked={false}
                    onPointerDown={() => {}}
                    onOpen={() => {}}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {!isCloudEnabled() && (
              <p className={styles.empty}>
                เกมนี้ยังไม่ได้เปิดโหมดบัญชีบนคลาวด์ จึงยังไม่มีตารางผู้เล่นจริงให้แสดง
              </p>
            )}

            {isCloudEnabled() && entries === null && (
              <p className={styles.empty}>กำลังโหลดตาราง…</p>
            )}

            {isCloudEnabled() && entries !== null && entries.length === 0 && (
              <p className={styles.empty}>ยังไม่มีใครเผยแพร่ทีมของตัวเองในตอนนี้</p>
            )}

            {isCloudEnabled() && entries !== null && entries.length > 0 && (
              <div className={styles.list}>
                {entries.map((entry, index) => {
                  const isSelf = entry.uid === selfUid;
                  return (
                    <button
                      type="button"
                      key={entry.uid}
                      className={`${styles.row} ${isSelf ? styles.rowSelf : ''}`}
                      onClick={() => setSelected(entry)}
                    >
                      <span className={styles.rank}>{index + 1}</span>
                      <img className={styles.rowAvatar} src={avatarSrc(entry.avatarId)} alt="" />
                      <span className={styles.rowName}>
                        {entry.username}
                        {isSelf && <span className={styles.rowSelfTag}>คุณ</span>}
                      </span>
                      <span className={styles.rowRating}>OVR {entry.rating}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
