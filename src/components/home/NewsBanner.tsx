import { useEffect, useState } from 'react';
import { useNews } from '@/features/news/NewsContext';
import styles from './NewsBanner.module.css';

export interface NewsBannerProps {
  /** Milliseconds between automatic slides. 0 disables auto-advance. */
  interval?: number;
  onOpen?(draftId: string | undefined): void;
}

export default function NewsBanner({ interval = 6000, onOpen }: NewsBannerProps) {
  const { slides: all } = useNews();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // A slide an admin created but has not given artwork to yet is configuration in
  // progress, not a banner. Showing it would be a blank frame in the carousel.
  const slides = all.filter((slide) => slide.artwork);

  // Guards against an admin deleting slides while a later one is showing.
  const index = Math.min(active, Math.max(slides.length - 1, 0));
  const slide = slides[index];

  useEffect(() => {
    if (paused || interval <= 0 || slides.length < 2) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      interval,
    );
    return () => window.clearInterval(timer);
  }, [paused, interval, slides.length]);

  if (!slide) return null;

  return (
    <article
      className={styles.banner}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* The whole banner is the target, but the dots sit above it and stop the
          click, so picking a slide does not also open it. */}
      <button
        type="button"
        className={styles.surface}
        aria-label={slide.heading}
        onClick={() => onOpen?.(slide.draftId)}
      />

      <img
        className={styles.artwork}
        src={slide.artwork}
        alt=""
        style={{ objectPosition: slide.focus ?? '50% 50%' }}
      />

      <header className={styles.strip}>
        <h2 className={styles.heading}>{slide.heading}</h2>
      </header>

      <div className={styles.dots} role="tablist" aria-label="ข่าวและกิจกรรม">
        {slides.map((item, position) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={position === index}
            aria-label={item.heading}
            className={`${styles.dot} ${position === index ? styles.dotActive : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              setActive(position);
            }}
          />
        ))}
      </div>
    </article>
  );
}
