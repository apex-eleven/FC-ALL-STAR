import { Trophy, X } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { formatCurrency } from '@/features/currencies/constants';
import { roundName } from '@/features/cup/constants';
import { championOf, roundsWon } from '@/features/cup/cup';
import type { CupCompetition, CupResult, CupRun, CupTie } from '@/features/cup/types';
import type { ShopReward } from '@/features/shop/types';
import styles from './CupResultOverlay.module.css';

export interface CupResultView {
  tie: CupTie;
  run: CupRun | null;
  through: boolean;
  paid: ShopReward[];
  /** Cup Tokens the round paid. */
  tokens: number;
  result: CupResult | null;
  /** Set when the tie was settled as a forfeit rather than played out. */
  forfeit?: boolean;
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
 * offer. Closing it cannot lose them. The title reward is the one exception: it is
 * claimed on the champion panel, so a champion's receipt points there.
 */
export default function CupResultOverlay({ view, competition, onClose }: CupResultOverlayProps) {
  const { tie, run, through, paid, tokens, result, forfeit } = view;
  const seat = run?.teams.findIndex((team) => team.you) ?? -1;
  const atHome = tie.a === seat;
  const mine = atHome ? tie.score[0] : tie.score[1];
  const theirs = atHome ? tie.score[1] : tie.score[0];
  const pens = tie.shootout ? (atHome ? tie.shootout : [tie.shootout[1], tie.shootout[0]]) : null;

  const opponent = run?.teams[atHome ? tie.b : tie.a];
  const champion = result?.champion ?? false;
  const over = result !== null;
  const won = run ? roundsWon(run) : 0;

  // Named from the run's own size — the admin may have resized the competition since.
  const size = run?.size ?? competition.size;
  const heading = champion
    ? 'CHAMPION!'
    : through
      ? `ผ่านเข้า${roundName(size, won)}`
      : forfeit
        ? 'ออกจากแมตช์ · ตกรอบ'
        : 'ตกรอบ';
  const winner = run ? championOf(run) : undefined;

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

        {forfeit && (
          <p className={styles.footnote}>แมตช์สดถูกปิดกลางคัน จึงนับเป็นแพ้ 0-3</p>
        )}

        {(paid.length > 0 || tokens > 0) && (
          <div className={styles.rewards}>
            <h3>ได้รับ</h3>
            <ul>
              {paid.map((line, index) => (
                <li key={index}>{rewardLabel(line)}</li>
              ))}
              {tokens > 0 && <li>Cup Token {formatCurrency(tokens)}</li>}
            </ul>
          </div>
        )}

        {champion && (
          <p className={styles.footnote}>รางวัลแชมป์รอให้กด CLAIM REWARD ที่หน้าถ้วย</p>
        )}

        {over && !champion && (
          <p className={styles.footnote}>
            ชนะทั้งหมด {won} นัด
            {winner && !winner.you ? ` · แชมป์รายการนี้คือ ${winner.name}` : ''}
          </p>
        )}

        <button type="button" className={styles.ok} onClick={onClose}>
          {champion ? 'ไปรับรางวัล' : over ? 'ปิด' : 'ไปรอบต่อไป'}
        </button>
      </div>
    </div>
  );
}
