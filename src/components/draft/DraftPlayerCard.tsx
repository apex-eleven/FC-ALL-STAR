import type { DraftPlayer } from '@/features/draft/types';
import styles from './DraftPlayerCard.module.css';

export interface DraftPlayerCardProps {
  player: DraftPlayer;
  /** Position inside the showcase canvas, in design pixels. */
  left: number;
  top: number;
  width: number;
}

/**
 * Card art, and nothing else.
 *
 * The artwork already is a finished card — frame, rating, name, crest, all baked in.
 * The old chrome drawn on top (border, rating chip, name plate) doubled every one of
 * those and fought the art it was covering, so the component now places the image and
 * gets out of the way.
 *
 * Height is left to the image: cards are not all the same aspect, and forcing one
 * would either squash the tall ones or letterbox the square ones.
 */
export default function DraftPlayerCard({ player, left, top, width }: DraftPlayerCardProps) {
  return (
    <img
      className={styles.card}
      style={{ left, top, width }}
      src={player.portrait}
      alt={`${player.name} ${player.rating}`}
      draggable={false}
    />
  );
}
