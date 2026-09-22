import type { HeroContent } from '@/features/home/types';
import HeroArtwork from './HeroArtwork';
import styles from './HeroSection.module.css';

export interface HeroSectionProps {
  content: HeroContent;
}

/** Artwork only — the NUMERO wordmark, CTA and dots were removed to make room for LIVE CHAT. */
export default function HeroSection({ content }: HeroSectionProps) {
  return (
    <section className={styles.section} aria-label={content.title}>
      <HeroArtwork />
    </section>
  );
}
