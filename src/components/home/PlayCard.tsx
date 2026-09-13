import type { PlayCardContent } from '@/features/home/types';
import styles from './PlayCard.module.css';

export interface PlayCardProps {
  content: PlayCardContent;
}

export default function PlayCard({ content }: PlayCardProps) {
  return (
    <button type="button" className={styles.card}>
      <img className={styles.background} src={content.background} alt="" />
      <span className={styles.scrim} />
      <span className={styles.label}>{content.label}</span>
    </button>
  );
}
