import { useEffect, useRef, useState } from 'react';
import type { EnginePlayer, MatchEngine } from '@/features/manager/matchEngine';
import { GoalCardTimeline, type GoalCardAction } from './goalCardTimeline';
import styles from './GoalScorerCard.module.css';

/**
 * The scorer's card after a goal, shown for three seconds, with the restart held until
 * it has been seen. The timing — and the pause and resume around the kick-off — is
 * GoalCardTimeline's; this draws the card and passes the pause on to the live screen.
 */

export interface GoalScorerCardProps {
  engine: MatchEngine;
  paused: boolean;
  onPause(): void;
}

interface Shown {
  player: EnginePlayer;
  side: 'home' | 'away';
  minute: number;
  /** Changes with every goal, so the entrance plays again for a second goal. */
  key: number;
}

export default function GoalScorerCard({ engine, paused, onPause }: GoalScorerCardProps) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [broken, setBroken] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  useEffect(() => {
    const timeline = new GoalCardTimeline();
    const actions: GoalCardAction[] = [];
    let cursor = engine.core.emittedCount;
    let frame = 0;

    const apply = (now: number) => {
      for (const action of actions) {
        switch (action.kind) {
          case 'show': {
            const player = engine.players.find((seat) => seat.id === action.playerId);
            if (!player) break;
            setShown({ player, side: action.side ?? player.side, minute: action.minute, key: now });
            setLeaving(false);
            setBroken(false);
            break;
          }
          case 'leave':
            setLeaving(true);
            break;
          case 'hide':
            setShown(null);
            break;
          case 'pause':
          case 'resume':
            onPauseRef.current();
            break;
        }
      }
      actions.length = 0;
    };

    const tick = (now: number) => {
      const core = engine.core;
      if (core.emittedCount !== cursor) {
        for (const event of core.eventsSince(cursor)) timeline.event(event, now, pausedRef.current, actions);
        cursor = core.emittedCount;
      }
      timeline.tick(now, pausedRef.current, actions);
      if (actions.length > 0) apply(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      timeline.release(pausedRef.current, actions);
      apply(performance.now());
    };
  }, [engine]);

  if (!shown) return null;
  const { player, side, minute, key } = shown;

  return (
    <div key={key} className={`${styles.card} ${side === 'home' ? styles.home : styles.away} ${leaving ? styles.leaving : ''}`}>
      <span className={styles.glow} />
      {player.portrait && !broken ? (
        <img className={styles.art} src={player.portrait} alt="" draggable={false} onError={() => setBroken(true)} />
      ) : (
        // No art for this card (or it failed to load): the card drawn from its own data.
        <span className={styles.fallback}>
          <b className={styles.rating}>{Math.round(player.rating)}</b>
          <span className={styles.position}>{player.position}</span>
          <span className={styles.fallbackName}>{player.name}</span>
        </span>
      )}
      <span className={styles.plate}>
        <b>{player.name}</b>
        <span>ประตู · {minute}'</span>
      </span>
    </div>
  );
}
