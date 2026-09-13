import { useMemo, useState } from 'react';
import { Clock, Info, Search } from 'lucide-react';
import {
  SHOWCASE_BANNER_H,
  SHOWCASE_BANNER_X,
  SHOWCASE_VIEWPORT_W,
} from '@/features/draft/constants';
import { resolveShowcase } from '@/features/draft/showcase';
import { usePlayers } from '@/features/players/PlayerContext';
import type { DraftEvent } from '@/features/draft/types';
import DraftPlayerCard from './DraftPlayerCard';
import DraftPoolBrowser from './DraftPoolBrowser';
import styles from './DraftShowcase.module.css';

export interface DraftShowcaseProps {
  event: DraftEvent;
}

export default function DraftShowcase({ event }: DraftShowcaseProps) {
  const { byId } = usePlayers();
  const [bannerWidth, setBannerWidth] = useState(SHOWCASE_VIEWPORT_W - SHOWCASE_BANNER_X);
  const [browsing, setBrowsing] = useState(false);

  // Cards an admin pinned to a slot, with the pack's best cards filling the rest.
  const featured = useMemo(
    () => resolveShowcase(event.showcase, event.pool, byId),
    [event.showcase, event.pool, byId],
  );

  // How far the canvas can scroll: whichever reaches further, the banner art or the
  // cards sitting on it.
  const canvasWidth = Math.max(
    SHOWCASE_VIEWPORT_W,
    SHOWCASE_BANNER_X + bannerWidth,
    ...event.showcase.map((slot) => slot.left + slot.width + 40),
  );

  return (
    <>
      <div className={styles.heading}>
        <h2 className={styles.title}>{event.title}</h2>
        <button type="button" className={styles.info} aria-label="รายละเอียด">
          <Info size={24} strokeWidth={2.6} />
        </button>
      </div>

      <div className={styles.countdown}>
        <Clock size={30} strokeWidth={2.4} />
        <span>
          สิ้นสุดใน: <span className={styles.days}>{event.endsInDays} วัน</span>
        </span>
      </div>

      {/*
        Banner and cards share one scrolling canvas.
        Wide campaign art used to be cut off at the viewport's right edge with no way
        to see the rest. Scrolling the banner alone would have slid the art out from
        under the cards, so both live on the same surface and move together.
      */}
      <div className={styles.viewport}>
        <div className={styles.canvas} style={{ width: canvasWidth }}>
          <img
            className={styles.bannerArt}
            src={event.banner}
            alt=""
            draggable={false}
            onLoad={(loadEvent) => {
              const image = loadEvent.currentTarget;
              if (!image.naturalHeight) return;
              // Art is laid out at a fixed height, so its on-screen width follows
              // from its own aspect — that is what decides how far the canvas runs.
              setBannerWidth(
                Math.round((image.naturalWidth / image.naturalHeight) * SHOWCASE_BANNER_H),
              );
            }}
          />

          {featured.map((player, index) => {
            const slot = event.showcase[index];
            if (!slot || !player) return null;
            return (
              <DraftPlayerCard
                key={`${index}-${player.id}`}
                player={player}
                left={slot.left}
                top={slot.top}
                width={slot.width}
              />
            );
          })}
        </div>
      </div>

      <button type="button" className={styles.more} onClick={() => setBrowsing(true)}>
        <Search size={22} strokeWidth={2.6} />
        เพิ่มเติม
      </button>

      {browsing && <DraftPoolBrowser event={event} onClose={() => setBrowsing(false)} />}
    </>
  );
}
