import { useEffect } from 'react';
import { Trophy, X } from 'lucide-react';
import { isCloudEnabled } from '@/features/cloud/firebase';
import type { LadderView } from '@/features/manager/ladder';
import ManagerTrophy from './ManagerTrophy';
import TierStars from './TierStars';
import { avatarSrc } from './avatarSrc';
import styles from './ManagerLadderScreen.module.css';

export interface ManagerLadderScreenProps {
  /** The signed-in account's uid, so its row is marked "คุณ". */
  selfUid: string;
  /** Rows from the manager context; null while the first fetch is out. */
  ladder: LadderView[] | null;
  /** Re-reads the ladder when the screen opens. */
  onRefresh(): void;
  onClose(): void;
}

/**
 * Manager-mode leaderboard: real players ranked by tier, then stars, each row
 * wearing its tier trophy and star count. Separate from the OVR table the club
 * screen opens.
 */
export default function ManagerLadderScreen({ selfUid, ladder, onRefresh, onClose }: ManagerLadderScreenProps) {
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const cloud = isCloudEnabled();

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Leaderboard แรงค์">
      <div className={styles.backdrop} onClick={onClose} />

      <div className={styles.panel}>
        <header className={styles.head}>
          <span className={styles.iconButton}>
            <Trophy size={22} strokeWidth={2.4} />
          </span>
          <h2 className={styles.title}>
            Leaderboard
            <span className={styles.subtitle}>อันดับแรงค์เมเนเจอร์ฤดูกาลนี้</span>
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={20} strokeWidth={2.6} />
          </button>
        </header>

        {!cloud && (
          <p className={styles.empty}>
            เกมนี้ยังไม่ได้เปิดโหมดบัญชีบนคลาวด์ จึงยังไม่มีตารางผู้เล่นจริงให้แสดง
          </p>
        )}

        {cloud && ladder === null && <p className={styles.empty}>กำลังโหลดตาราง…</p>}

        {cloud && ladder !== null && ladder.length === 0 && (
          <p className={styles.empty}>ยังไม่มีใครเล่นเมเนเจอร์โหมดในตอนนี้</p>
        )}

        {cloud && ladder !== null && ladder.length > 0 && (
          <div className={styles.list}>
            {ladder.map((row, index) => {
              const isSelf = row.uid === selfUid;
              const tierName = row.tier?.name ?? '-';
              return (
                <div key={row.uid} className={`${styles.row} ${isSelf ? styles.rowSelf : ''}`}>
                  <span className={`${styles.rank} ${index < 3 ? styles.rankTop : ''}`}>{index + 1}</span>
                  <img className={styles.avatar} src={avatarSrc(row.avatarId)} alt="" />
                  <span className={styles.name}>
                    {row.username}
                    {isSelf && <span className={styles.selfTag}>คุณ</span>}
                  </span>
                  <span className={styles.badge}>
                    <ManagerTrophy image={row.tier?.image ?? ''} name={tierName} className={styles.trophy} />
                  </span>
                  <span className={styles.tier}>
                    <span className={styles.tierName}>{tierName}</span>
                    {row.tier && <TierStars total={row.tier.stars} filled={row.stars} size={22} />}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
