import { useState } from 'react';
import type { HeroContent } from '@/features/home/types';
import HeroArtwork from './HeroArtwork';
import HeroCTA from './HeroCTA';
import styles from './HeroSection.module.css';

export interface HeroSectionProps {
  content: HeroContent;
  onCta?(): void;
}

export default function HeroSection({ content, onCta }: HeroSectionProps) {
  const [activeSlide, setActiveSlide] = useState(content.activeSlide);

  return (
    <section className={styles.section} aria-label={content.title}>
      <HeroArtwork />

      <div className={styles.band} />
      <h1 className={styles.title}>{content.title}</h1>

      <span className={styles.watermark} aria-hidden="true">
        ▶▶▶ FOOTBALL
      </span>

      <HeroCTA label={content.ctaLabel} onClick={onCta} />

      <div className={styles.dots} role="tablist" aria-label="Featured promos">
        {Array.from({ length: content.slideCount }, (_, index) => (
          <button
            type="button"
            key={index}
            role="tab"
            aria-selected={index === activeSlide}
            aria-label={`Promo ${index + 1}`}
            className={`${styles.dot} ${index === activeSlide ? styles.dotActive : ''}`}
            onClick={() => setActiveSlide(index)}
          />
        ))}
      </div>
    </section>
  );
}
