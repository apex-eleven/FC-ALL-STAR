import type { PlayCardContent } from '@/features/home/types';
import styles from './PlayCard.module.css';

export interface PlayCardProps {
  content: PlayCardContent;
  onClick?(): void;
}

export default function PlayCard({ content, onClick }: PlayCardProps) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <img className={styles.background} src={content.background} alt="" />
      <span className={styles.scrim} />
      <span className={styles.label}>{content.label}</span>
    </button>
  );
}
