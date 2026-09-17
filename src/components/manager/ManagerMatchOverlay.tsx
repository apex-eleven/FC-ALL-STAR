import { ArrowDown, ArrowUp, ShieldCheck } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { displayNameOf } from '@/features/auth/constants';
import { formatCurrency } from '@/features/currencies/constants';
import type { ManagerPlayResult } from '@/features/manager/ManagerContext';
import type { ManagerTier } from '@/features/manager/types';
import { avatarSrc } from './avatarSrc';
import TierStars from './TierStars';
import styles from './ManagerMatchOverlay.module.css';

export interface ManagerMatchOverlayProps {
  result: ManagerPlayResult;
  ranked: boolean;
  tiers: readonly ManagerTier[];
  /** Goal scorers from the live match, in order. */
  scorers: readonly { side: 'home' | 'away'; name: string; minute: number }[];
  onAgain(): void;
  onClose(): void;
}

const OUTCOME_LABEL = { win: 'ชนะ', draw: 'เสมอ', loss: 'แพ้' } as const;


/** Full time: the score, the ladder change, and any milestone the win completed. */
export default function ManagerMatchOverlay({
  result,
  ranked,
  tiers,
  scorers,
  onAgain,
  onClose,
}: ManagerMatchOverlayProps) {
  const account = useAccount();
  const match = result.match;

  if (!match) return null;

  const before = tiers[match.tierBefore];
  const after = tiers[match.tierAfter];
  const moved = match.tierAfter - match.tierBefore;

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="ผลการแข่งขัน">
      <div className={styles.scrim} />

      <div className={`${styles.panel} ${styles[match.outcome]}`}>
        <span className={styles.mode}>{ranked ? 'แมตช์จัดอันดับ' : 'แมตช์ไม่จัดอันดับ'}</span>

        <div className={styles.teams}>
          <div className={styles.team}>
            <img className={styles.avatar} src={avatarSrc(account.avatarId)} alt="" />
            <span className={styles.name}>{displayNameOf(account)}</span>
            <span className={styles.ovr}>OVR {match.rating}</span>
          </div>

          <div className={styles.middle}>
            <span className={styles.score}>
              {match.score[0]} <i>-</i> {match.score[1]}
            </span>
            <span className={styles.outcome}>
              {match.forfeit ? 'แพ้ (ออกกลางคัน)' : OUTCOME_LABEL[match.outcome]}
            </span>
          </div>

          <div className={styles.team}>
            <img className={styles.avatar} src={avatarSrc(match.opponent.avatarId)} alt="" />
            <span className={styles.name}>{match.opponent.name}</span>
            <span className={styles.ovr}>
              OVR {match.opponent.rating}
              {match.opponent.bot && <em className={styles.bot}>บอท</em>}
            </span>
          </div>
        </div>

        {scorers.length > 0 && (
          <div className={styles.scorers}>
            <span>
              {scorers
                .filter((goal) => goal.side === 'home')
                .map((goal) => `${goal.name} ${goal.minute}'`)
                .join(', ')}
            </span>
            <span>
              {scorers
                .filter((goal) => goal.side === 'away')
                .map((goal) => `${goal.name} ${goal.minute}'`)
                .join(', ')}
            </span>
          </div>
        )}

        {ranked && before && after && (
          <div className={styles.ladder}>
            <span className={styles.rung}>
              <b>{before.name}</b>
              <TierStars total={before.stars} filled={match.starsBefore} size={30} />
            </span>
            <span className={styles.arrow}>→</span>
            <span className={styles.rung}>
              <b>{after.name}</b>
              <TierStars total={after.stars} filled={match.starsAfter} size={30} />
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
            {match.shielded && (
              <span className={`${styles.change} ${styles.shielded}`}>
                <ShieldCheck size={22} strokeWidth={2.6} /> โล่กันดาวทำงาน ดาวไม่ลด
              </span>
            )}
          </div>
        )}

        {result.paid.length > 0 && (
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

        {!ranked && <p className={styles.note}>แมตช์นี้ไม่นับแรงค์และไม่นับชนะสะสม</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.close} data-sound="back" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className={styles.again} onClick={onAgain}>
            เล่นอีกครั้ง
          </button>
        </div>
      </div>
    </div>
  );
}
