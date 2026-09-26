import { Check, Gift, Medal, Ticket, Trophy, X } from 'lucide-react';
import useRewardView from '@/components/shop/useRewardView';
import { formatCurrency } from '@/features/currencies/constants';
import { titleRewards } from '@/features/cup/cup';
import type { CupCompetition, CupRun } from '@/features/cup/types';
import styles from './CupChampionPanel.module.css';

export interface CupChampionPanelProps {
  run: CupRun;
  competition: CupCompetition;
  /** NEW CUP is allowed right now (window open, an entry left, nothing unclaimed). */
  canStartNew: boolean;
  /** Why NEW CUP is not allowed, shown under the button. */
  newCupHint: string;
  onClaim(): void;
  onNewCup(): void;
  /** Hides the panel to look at the bracket. Only offered once the reward is claimed. */
  onClose(): void;
}

/**
 * 🏆 CHAMPION — shown over the bracket once the final is won.
 *
 * It reads the run's status and nothing else: `champion` offers CLAIM REWARD,
 * `completed` shows the reward as taken. Neither resets anything by itself; the new
 * tournament only starts when NEW CUP is pressed.
 */
export default function CupChampionPanel({
  run,
  competition,
  canStartNew,
  newCupHint,
  onClaim,
  onNewCup,
  onClose,
}: CupChampionPanelProps) {
  const rewardView = useRewardView();
  const claimed = run.status === 'completed';
  const bands = titleRewards(run, competition);
  const lines = bands.flatMap((band) => band.rewards);
  const tokens = bands.reduce((sum, band) => sum + band.tokens, 0);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="แชมป์">
      <div className={styles.card}>
        {claimed && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="ดูสายการแข่ง">
            <X size={20} />
          </button>
        )}

        <div className={styles.crown}>
          {competition.trophy ? (
            <img className={styles.trophyArt} src={competition.trophy} alt="" />
          ) : (
            <Trophy size={78} strokeWidth={1.6} />
          )}
        </div>

        <h2 className={styles.title}>CHAMPION</h2>
        <p className={styles.subtitle}>YOU WON THE CUP!</p>
        <p className={styles.cupName}>{competition.name}</p>

        {(lines.length > 0 || tokens > 0) && (
          <ul className={`${styles.rewards} ${claimed ? styles.rewardsTaken : ''}`}>
            {lines.map((line, index) => {
              const detail = rewardView(line);
              return (
                <li key={index} className={styles.reward}>
                  <img className={styles.rewardArt} src={detail.icon} alt="" />
                  <span>{detail.count}</span>
                </li>
              );
            })}
            {tokens > 0 && (
              <li className={styles.reward}>
                <Medal size={30} className={styles.tokenIcon} />
                <span>Cup Token {formatCurrency(tokens)}</span>
              </li>
            )}
          </ul>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.claim} onClick={onClaim} disabled={claimed}>
            {claimed ? <Check size={22} /> : <Gift size={22} />}
            {claimed ? 'รับรางวัลแล้ว' : 'CLAIM REWARD'}
          </button>
          <button type="button" className={styles.next} onClick={onNewCup} disabled={!canStartNew}>
            <Ticket size={20} />
            NEW CUP
          </button>
        </div>
        {!canStartNew && newCupHint && <p className={styles.hint}>{newCupHint}</p>}
      </div>
    </div>
  );
}
