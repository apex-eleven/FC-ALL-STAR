import type { ClubSummary } from '@/features/home/types';
import OvrBadge from '@/components/ui/OvrBadge';
import styles from './ClubCard.module.css';

export interface ClubCardProps {
  club: ClubSummary;
  /** Cards the account owns. Shown as a count under the crest. */
  playerCount?: number;
  onClick?(): void;
}

export default function ClubCard({ club, playerCount, onClick }: ClubCardProps) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <img className={styles.background} src={club.background} alt="" />
      <span className={styles.scrim} />

      <span className={styles.column}>
        <span className={styles.title}>{club.name}</span>
        <OvrBadge
          className={styles.ovr}
          rating={club.overallRating}
          size={112}
          labelSize={13}
          valueSize={40}
        />
      </span>

      {/* The hand-drawn crest is gone: it was a placeholder shape standing in for a
          club badge this game does not have, and next to real card art it read as a
          leftover rather than as branding. */}
      {playerCount !== undefined && (
        <span className={styles.count}>{playerCount} ใบ</span>
      )}
    </button>
  );
}
