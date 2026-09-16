import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import type { ManagerPlayResult } from '@/features/manager/ManagerContext';
import type { ManagerTier } from '@/features/manager/types';
import { avatarSrc } from './avatarSrc';
import styles from './ManagerMatchOverlay.module.css';

export interface ManagerMatchOverlayProps {
  result: ManagerPlayResult;
  ranked: boolean;
  tiers: readonly ManagerTier[];
  /** How long the "finding an opponent" step lasts before the result shows. */
  searchMs: number;
  onRevealed(): void;
  onAgain(): void;
  onClose(): void;
}

const OUTCOME_LABEL = { win: 'ชนะ', draw: 'เสมอ', loss: 'แพ้' } as const;

function stars(count: number, filled: number) {
  return Array.from({ length: count }, (_, index) => (
    <Star
      key={index}
      size={30}
      strokeWidth={0}
      className={index < filled ? styles.starOn : styles.starOff}
    />
  ));
}

/**
 * Matchmaking, then the result. The match is already decided and saved when this
 * opens — the search step is presentation only, so closing it early loses nothing.
 */
export default function ManagerMatchOverlay({
  result,
  ranked,
  tiers,
  searchMs,
  onRevealed,
  onAgain,
  onClose,
}: ManagerMatchOverlayProps) {
  const account = useAccount();
  const [revealed, setRevealed] = useState(false);
  const match = result.match;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRevealed(true);
      onRevealed();
    }, searchMs);
    return () => window.clearTimeout(timer);
  }, [searchMs, onRevealed]);

  if (!match) return null;

  const before = tiers[match.tierBefore];
  const after = tiers[match.tierAfter];
  const moved = match.tierAfter - match.tierBefore;

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="ผลการแข่งขัน">
      <div className={styles.scrim} />

      <div className={`${styles.panel} ${revealed ? styles[match.outcome] : ''}`}>
        <span className={styles.mode}>{ranked ? 'แมตช์จัดอันดับ' : 'แมตช์ไม่จัดอันดับ'}</span>

        <div className={styles.teams}>
          <div className={styles.team}>
            <img className={styles.avatar} src={avatarSrc(account.avatarId)} alt="" />
            <span className={styles.name}>{account.username}</span>
            <span className={styles.ovr}>OVR {match.rating}</span>
          </div>

          <div className={styles.middle}>
            {revealed ? (
              <>
                <span className={styles.score}>
                  {match.score[0]} <i>-</i> {match.score[1]}
                </span>
                <span className={styles.outcome}>{OUTCOME_LABEL[match.outcome]}</span>
              </>
            ) : (
              <>
                <span className={styles.spinner} />
                <span className={styles.searching}>กำลังค้นหาคู่แข่ง...</span>
              </>
            )}
          </div>

          <div className={`${styles.team} ${revealed ? '' : styles.hidden}`}>
            <img className={styles.avatar} src={avatarSrc(match.opponent.avatarId)} alt="" />
            <span className={styles.name}>{match.opponent.name}</span>
            <span className={styles.ovr}>
              OVR {match.opponent.rating}
              {match.opponent.bot && <em className={styles.bot}>บอท</em>}
            </span>
          </div>
        </div>

        {revealed && ranked && before && after && (
          <div className={styles.ladder}>
            <span className={styles.rung}>
              <b>{before.name}</b>
              <span className={styles.starRow}>{stars(before.stars, match.starsBefore)}</span>
            </span>
            <span className={styles.arrow}>→</span>
            <span className={styles.rung}>
              <b>{after.name}</b>
              <span className={styles.starRow}>{stars(after.stars, match.starsAfter)}</span>
            </span>
            {moved > 0 && (
              <span className={`${styles.change} ${styles.up}`}>
                <ArrowUp size={22} strokeWidth={3} /> เลื่อนแรงค์
              </span>
            )}
            {moved < 0 && (
              <span className={`${styles.change} ${styles.down}`}>
                <ArrowDown size={22} strokeWidth={3} /> ตกแรงค์
              </span>
            )}
          </div>
        )}

        {revealed && result.paid.length > 0 && (
          <div className={styles.paid}>
            <span className={styles.paidTitle}>รางวัลชนะสะสม</span>
            <div className={styles.paidList}>
              {result.paid.flatMap((milestone) =>
                milestone.rewards.map((line, index) => (
                  <span key={`${milestone.id}-${index}`} className={styles.reward}>
                    <img src={currencies[line.kind].icon} alt="" />x{formatCurrency(line.amount)}
                  </span>
                )),
              )}
            </div>
          </div>
        )}

        {revealed && !ranked && <p className={styles.note}>แมตช์นี้ไม่นับแรงค์และไม่นับชนะสะสม</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.close} data-sound="back" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className={styles.again} disabled={!revealed} onClick={onAgain}>
            เล่นอีกครั้ง
          </button>
        </div>
      </div>
    </div>
  );
}
