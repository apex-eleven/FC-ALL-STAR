import { Check, Lock, Play, Radio, Trophy, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { avatarSource } from '@/features/avatars/extraAvatars';
import { roundName } from '@/features/cup/constants';
import { championOf, tieStatus, yourSeat } from '@/features/cup/cup';
import type { CupRun, CupTie, CupTieStatus } from '@/features/cup/types';
import styles from './CupBracket.module.css';

export interface CupBracketProps {
  run: CupRun;
}

/** The chip on a tie that is, or will be, the player's. Other ties carry none. */
const STATUS_CHIP: Partial<Record<CupTieStatus, { label: string; icon: ReactNode; className: string }>> = {
  locked: { label: 'LOCKED', icon: <Lock size={12} strokeWidth={3} />, className: styles.chipLocked },
  available: { label: 'PLAY', icon: <Play size={12} strokeWidth={3} />, className: styles.chipAvailable },
  live: { label: 'LIVE', icon: <Radio size={12} strokeWidth={3} />, className: styles.chipLive },
  won: { label: 'WON', icon: <Check size={12} strokeWidth={3} />, className: styles.chipWon },
  lost: { label: 'ELIMINATED', icon: <X size={12} strokeWidth={3} />, className: styles.chipLost },
};

/**
 * The bracket as a tournament tree: one column per round, the trophy at the end.
 *
 * Every tie is drawn from the moment the draw is made, including the ones waiting on
 * a seat nobody has won yet — a bracket that grew a column at a time would not show
 * the player what they are playing towards, which is the only reason to draw one.
 *
 * Nothing here decides anything. Each tie's state comes from `tieStatus`, read off
 * the run, so the board cannot disagree with the tournament.
 */
export default function CupBracket({ run }: CupBracketProps) {
  const seat = yourSeat(run);
  const champion = championOf(run);

  return (
    <div className={styles.board}>
      {run.rounds.map((ties, round) => (
        <div key={round} className={styles.column}>
          <h3 className={`${styles.roundName} ${round === run.round && run.status === 'running' ? styles.roundNow : ''}`}>
            {roundName(run.size, round)}
          </h3>
          <div className={styles.ties}>
            {ties.map((tie, index) => (
              <Tie key={index} tie={tie} run={run} seat={seat} status={tieStatus(run, round, index)} />
            ))}
          </div>
        </div>
      ))}

      <div className={styles.column}>
        <h3 className={styles.roundName}>แชมป์</h3>
        <div className={styles.ties}>
          <div className={`${styles.trophy} ${champion?.you ? styles.trophyYours : ''}`}>
            <Trophy size={34} />
            <span>{champion ? champion.name : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TieProps {
  tie: CupTie;
  run: CupRun;
  seat: number;
  status: CupTieStatus;
}

function Tie({ tie, run, seat, status }: TieProps) {
  const chip = STATUS_CHIP[status];
  const classes = [
    styles.tie,
    chip ? styles.tieMine : '',
    status === 'available' || status === 'live' ? styles.tieNext : '',
    status === 'locked' ? styles.tieLocked : '',
    status === 'lost' ? styles.tieLost : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {chip && (
        <span className={`${styles.chip} ${chip.className}`}>
          {chip.icon}
          {chip.label}
        </span>
      )}
      <Side tie={tie} run={run} seat={seat} side="a" />
      <Side tie={tie} run={run} seat={seat} side="b" />
      {tie.shootout && (
        <span className={styles.pens}>
          ดวลจุดโทษ {tie.shootout[0]}-{tie.shootout[1]}
        </span>
      )}
    </div>
  );
}

function Side({
  tie,
  run,
  seat,
  side,
}: {
  tie: CupTie;
  run: CupRun;
  seat: number;
  side: 'a' | 'b';
}) {
  const index = side === 'a' ? tie.a : tie.b;
  const team = index >= 0 ? run.teams[index] : undefined;
  const goals = side === 'a' ? tie.score[0] : tie.score[1];
  const beaten = tie.played && tie.winner !== index;

  if (!team) {
    return (
      <span className={`${styles.side} ${styles.sideWaiting}`}>
        <span className={styles.name}>รอผู้ชนะ</span>
      </span>
    );
  }

  return (
    <span
      className={[
        styles.side,
        team.you ? styles.sideYou : '',
        beaten ? styles.sideOut : '',
        tie.played && tie.winner === index ? styles.sideThrough : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img className={styles.face} src={avatarSource(team.avatarId)} alt="" width={26} height={26} />
      <span className={styles.name}>
        {seat === index && <em className={styles.youTag}>คุณ</em>}
        {team.name}
      </span>
      <span className={styles.ovr}>{team.rating}</span>
      <span className={styles.goals}>{tie.played ? goals : '–'}</span>
    </span>
  );
}
