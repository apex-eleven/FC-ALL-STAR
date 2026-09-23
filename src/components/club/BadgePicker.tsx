import { Check, Shield, X } from 'lucide-react';
import { availableBadges, fielded, isFielded, slotOf, statusOf } from '@/features/badges/badges';
import { useBadges } from '@/features/badges/BadgeContext';
import { cardToPlayer } from '@/features/draft/pool';
import { usePlayers } from '@/features/players/PlayerContext';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import styles from './BadgePicker.module.css';

export interface BadgePickerProps {
  /** Which of the three slots is being filled. */
  slot: number;
  squad: Squad;
  owned: OwnedIndex;
  onPick(badgeId: string | null): void;
  onClose(): void;
}

/**
 * ตราทีม — the list a crest slot opens.
 *
 * Every enabled crest, with its set drawn as portraits: lit when that player is on
 * the pitch, dimmed when not, so the player can see what a crest still needs before
 * pinning it. Pinning is always allowed — a crest that is not yet earning is a goal
 * to build toward, not a mistake.
 */
export default function BadgePicker({ slot, squad, owned, onPick, onClose }: BadgePickerProps) {
  const { config, nameOf } = useBadges();
  const { byId } = usePlayers();

  // Same matching as the crest rules: the exact card or the same player by name.
  const onPitch = fielded(squad, owned);

  const badges = availableBadges(config);
  const currentId = squad.badges[slot] ?? null;

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="เลือกตราทีม">
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.icon}>
            <Shield size={30} strokeWidth={2.4} />
          </span>
          <h2 className={styles.title}>ตราทีม · ช่องที่ {slot + 1}</h2>
          {currentId && (
            <button type="button" className={styles.clear} onClick={() => onPick(null)}>
              ถอดออก
            </button>
          )}
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={24} strokeWidth={2.6} />
          </button>
        </div>

        <p className={styles.hint}>
          ตราทีมจะทำงานเมื่อนักเตะในชุดลงสนามครบตามที่กำหนด · ใส่ไว้ก่อนได้ แล้วค่อยหานักเตะมาเติม
        </p>

        <div className={styles.list}>
          {badges.length === 0 && <p className={styles.empty}>ยังไม่มีตราทีมให้เลือก</p>}

          {badges.map((badge) => {
            const status = statusOf(badge, squad, owned, nameOf);
            const pinnedAt = slotOf(squad, badge.id);
            const here = pinnedAt === slot;
            return (
              <article
                key={badge.id}
                className={`${styles.row} ${status.active ? styles.rowActive : ''} ${here ? styles.rowHere : ''}`}
              >
                <span className={styles.art}>
                  {badge.image ? (
                    <img src={badge.image} alt="" draggable={false} />
                  ) : (
                    <Shield size={44} strokeWidth={2} />
                  )}
                </span>

                <div className={styles.info}>
                  <h3 className={styles.name}>{badge.name || 'ตราทีม'}</h3>
                  {badge.description && <p className={styles.desc}>{badge.description}</p>}
                  <div className={styles.set}>
                    {badge.cardIds.map((cardId) => {
                      const card = byId(cardId);
                      const has = isFielded(cardId, onPitch, nameOf);
                      return (
                        <span
                          key={cardId}
                          className={`${styles.player} ${has ? styles.playerHas : ''}`}
                          title={card ? `${card.name} · OVR ${card.rating}` : 'การ์ดที่ถูกลบแล้ว'}
                        >
                          {card ? (
                            <img src={cardToPlayer(card).portrait} alt="" draggable={false} />
                          ) : (
                            <Shield size={20} strokeWidth={2} />
                          )}
                          {has && (
                            <span className={styles.playerMark}>
                              <Check size={14} strokeWidth={3.5} />
                            </span>
                          )}
                        </span>
                      );
                    })}
                    <span className={styles.count}>
                      {status.have}/{status.need}
                    </span>
                  </div>
                </div>

                <span className={`${styles.bonus} ${status.active ? styles.bonusOn : ''}`}>
                  +{badge.bonus}
                  <small>OVR</small>
                </span>

                {here ? (
                  <button type="button" className={styles.ghost} onClick={() => onPick(null)}>
                    ถอด
                  </button>
                ) : (
                  <button type="button" className={styles.pick} onClick={() => onPick(badge.id)}>
                    {pinnedAt >= 0 ? `ย้ายจากช่อง ${pinnedAt + 1}` : 'ใส่'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
