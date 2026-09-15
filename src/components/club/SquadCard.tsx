import { useState, type CSSProperties, type PointerEvent } from 'react';
import type { DisplayCard } from '@/features/club/types';
import { plusTone } from '@/features/rankup/constants';
import { clampPlus, ratingWithPlus } from '@/features/rankup/plus';
import { CARD_HEIGHT, CARD_WIDTH } from '@/features/squad/constants';
import styles from './SquadCard.module.css';

export interface SquadCardProps {
  player: DisplayCard;
  /** 1 renders at CARD_WIDTH x CARD_HEIGHT. */
  scale?: number;
  dragging?: boolean;
  interactive?: boolean;
  onPointerDown?(event: PointerEvent): void;
}

/**
 * One player card on the pitch, the bench, or in the drawer.
 *
 * Card art, and nothing else. The old version drew a frame, a rating chip, a name
 * plate, and a nation tag on top of artwork that already contains all four — at 88px
 * wide that meant two ratings and two names fighting over the same corner.
 *
 * The box keeps a fixed size because it is also the drop target; the art is
 * contained inside it, so a card of any aspect lands centred rather than stretched.
 */
export default function SquadCard({
  player,
  scale = 1,
  dragging = false,
  interactive = true,
  onPointerDown,
}: SquadCardProps) {
  const [broken, setBroken] = useState(false);
  const plus = clampPlus(player.plus);

  return (
    <div
      className={`${styles.card} ${interactive ? styles.interactive : ''} ${
        dragging ? styles.dragging : ''
      }`}
      style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale }}
      onPointerDown={onPointerDown}
      role={interactive ? 'button' : undefined}
      aria-label={`${player.name} ${ratingWithPlus(player)} ${player.position}${
        plus > 0 ? ` +${plus}` : ''
      }`}
    >
      {/*
        A card whose art is missing used to render as an invisible <img> — the slot
        looked empty while still being occupied, which is exactly the kind of bug
        nobody can report because there is nothing on screen to point at. The fallback
        draws the card from its own data instead.
      */}
      {player.portrait && !broken ? (
        <img
          className={styles.art}
          src={player.portrait}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={styles.fallback}>
          <span className={styles.fallbackRating}>{ratingWithPlus(player)}</span>
          <span className={styles.fallbackPosition}>{player.position}</span>
          <span className={styles.fallbackName}>{player.name}</span>
        </span>
      )}

      {/* The art already carries a rating, so the upgrade is shown as its own chip
          rather than by redrawing the number — one badge in a corner the card art
          leaves empty. */}
      {plus > 0 && (
        <span
          className={styles.plus}
          style={{ '--plus-tone': plusTone(plus) } as CSSProperties}
        >
          +{plus}
        </span>
      )}
    </div>
  );
}
