import { Trophy } from 'lucide-react';
import { avatarSource } from '@/features/avatars/extraAvatars';
import { roundName } from '@/features/cup/constants';
import { yourSeat } from '@/features/cup/cup';
import type { CupRun, CupTie } from '@/features/cup/types';
import styles from './CupBracket.module.css';

export interface CupBracketProps {
  run: CupRun;
}

/**
 * The bracket, one column per round.
 *
 * Every tie is drawn from the moment the draw is made, including the ones waiting on
 * a seat nobody has won yet — a bracket that grew a column at a time would not show
 * the player what they are playing towards, which is the only reason to draw one.
 */
export default function CupBracket({ run }: CupBracketProps) {
  const seat = yourSeat(run);

  /** The path the account took, so their own line can be picked out of the board. */
  const yourTies = new Set<string>();
  run.rounds.forEach((ties, round) => {
    ties.forEach((tie, index) => {
      if (tie.a === seat || tie.b === seat) yourTies.add(`${round}:${index}`);
    });
  });

  const champion = (() => {
    const final = run.rounds[run.rounds.length - 1]?.[0];
    return final && final.winner >= 0 ? run.teams[final.winner] : undefined;
  })();

  return (
    <div className={styles.board}>
      {run.rounds.map((ties, round) => (
        <div key={round} className={styles.column}>
          <h3 className={styles.roundName}>{roundName(run.size, round)}</h3>
          <div className={styles.ties}>
            {ties.map((tie, index) => (
              <Tie
                key={index}
                tie={tie}
                run={run}
                seat={seat}
                mine={yourTies.has(`${round}:${index}`)}
                next={round === run.round && run.status === 'running'}
              />
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
  mine: boolean;
  next: boolean;
}

function Tie({ tie, run, seat, mine, next }: TieProps) {
  const classes = [styles.tie, mine ? styles.tieMine : '', next && mine ? styles.tieNext : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
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
