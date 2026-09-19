import { Trophy, X } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { formatCurrency } from '@/features/currencies/constants';
import { roundName } from '@/features/cup/constants';
import { roundsWon } from '@/features/cup/cup';
import type { CupCompetition, CupResult, CupRun, CupTie } from '@/features/cup/types';
import type { ShopReward } from '@/features/shop/types';
import styles from './CupResultOverlay.module.css';

export interface CupResultView {
  tie: CupTie;
  run: CupRun | null;
  through: boolean;
  paid: ShopReward[];
  result: CupResult | null;
}

export interface CupResultOverlayProps {
  view: CupResultView;
  competition: CupCompetition;
  onClose(): void;
}

function rewardLabel(line: ShopReward): string {
  if (line.kind === 'card') return `การ์ด x${line.amount}${line.plus > 0 ? ` +${line.plus}` : ''}`;
  if (line.kind === 'item') return `ไอเท็ม x${line.amount}`;
  return `${currencies[line.kind].label} ${formatCurrency(line.amount)}`;
}

/**
 * What the round produced: the score, whether they went through, and anything it
 * paid.
 *
 * The rewards shown here have already been credited — this is a receipt, not an
 * offer. Closing it cannot lose them.
 */
export default function CupResultOverlay({ view, competition, onClose }: CupResultOverlayProps) {
  const { tie, run, through, paid, result } = view;
  const seat = run?.teams.findIndex((team) => team.you) ?? -1;
  const atHome = tie.a === seat;
  const mine = atHome ? tie.score[0] : tie.score[1];
  const theirs = atHome ? tie.score[1] : tie.score[0];
  const pens = tie.shootout ? (atHome ? tie.shootout : [tie.shootout[1], tie.shootout[0]]) : null;

  const opponent = run?.teams[atHome ? tie.b : tie.a];
  const champion = result?.champion ?? false;
  const over = result !== null;
  const won = run ? roundsWon(run) : 0;

  const heading = champion
    ? 'แชมป์!'
    : through
      ? `ผ่านเข้า${roundName(competition.size, won)}`
      : 'ตกรอบ';

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={`${styles.card} ${champion ? styles.cardGold : through ? '' : styles.cardOut}`}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
          <X size={20} />
        </button>

        {champion && (
          <div className={styles.crown}>
            <Trophy size={56} />
          </div>
        )}

        <h2 className={styles.heading}>{heading}</h2>

        <div className={styles.score}>
          <span className={styles.scoreTeam}>คุณ</span>
          <strong>
            {mine} - {theirs}
          </strong>
          <span className={styles.scoreTeam}>{opponent?.name ?? '—'}</span>
        </div>

        {pens && (
          <p className={styles.pens}>
            ดวลจุดโทษ {pens[0]} - {pens[1]}
          </p>
        )}

        {paid.length > 0 && (
          <div className={styles.rewards}>
            <h3>ได้รับ</h3>
            <ul>
              {paid.map((line, index) => (
                <li key={index}>{rewardLabel(line)}</li>
              ))}
            </ul>
          </div>
        )}

        {over && !champion && (
          <p className={styles.footnote}>
            ชนะทั้งหมด {won} นัด
            {(() => {
              const final = run?.rounds[run.rounds.length - 1]?.[0];
              const winner = final && final.winner >= 0 ? run?.teams[final.winner] : undefined;
              return winner && !winner.you ? ` · แชมป์รายการนี้คือ ${winner.name}` : '';
            })()}
          </p>
        )}

        <button type="button" className={styles.ok} onClick={onClose}>
          {over ? 'ปิด' : 'ไปรอบต่อไป'}
        </button>
      </div>
    </div>
  );
}
