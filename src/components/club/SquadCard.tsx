import { useState, type CSSProperties, type PointerEvent } from 'react';
import type { DisplayCard } from '@/features/club/types';
import { fxLevel } from '@/features/fx/fx';
import { useStill } from '@/features/images/stills';
import { playerThumbSrc } from '@/features/players/artManifest';
import { goldPlusProps, plusTone } from '@/features/rankup/constants';
import { clampPlus, ratingWithPlus } from '@/features/rankup/plus';
import { CARD_HEIGHT, CARD_WIDTH } from '@/features/squad/constants';
import styles from './SquadCard.module.css';

/**
 * Cards drawn narrower than this show a still instead of the animated art — see
 * features/images/stills. The bench (67px) and the collection drawer (102px) are
 * under it. The pitch is not supposed to be, so the animation stays where it can
 * actually be seen — but `4-3-3-attack` scales its front three and midfield three
 * to 102px and 109px, both under this line, so the pitch opts out with `allowStill`
 * instead of relying on width alone. In performance mode the line moves up past the
 * pitch as well.
 */
const STILL_UNDER = 110;
const STILL_UNDER_LITE = 220;

export interface SquadCardProps {
  player: DisplayCard;
  /** 1 renders at CARD_WIDTH x CARD_HEIGHT. */
  scale?: number;
  dragging?: boolean;
  interactive?: boolean;
  /**
   * False lets this card freeze into a still below `STILL_UNDER`, same as any other
   * card. The starting eleven sets this false: the front three and midfield three in
   * `4-3-3-attack` are scaled to 102px and 109px, both under the 110px line, which is
   * a width the collection drawer's cards (102px) also happen to land on — so width
   * alone cannot tell a slot on the pitch from one in the drawer. Only eleven cards
   * are ever on the pitch at once, nothing like the drawer's hundred-plus, so forcing
   * the animation here does not reintroduce the cost the still image exists to avoid.
   */
  allowStill?: boolean;
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
  allowStill = true,
  onPointerDown,
}: SquadCardProps) {
  const [broken, setBroken] = useState(false);
  const plus = clampPlus(player.plus);
  const width = CARD_WIDTH * scale;
  const height = CARD_HEIGHT * scale;
  const small = allowStill && width <= (fxLevel() === 'lite' ? STILL_UNDER_LITE : STILL_UNDER);
  // The prebuilt still, when the deployment has run `npm run players:thumbs`. The
  // canvas one is the fallback for art that has none — an uploaded picture, or a
  // deployment that never ran it.
  const [missing, setMissing] = useState<string | null>(null);
  const thumb = small ? playerThumbSrc(player.portrait) : null;
  const prebuilt = thumb && missing !== thumb ? thumb : null;
  const still = useStill(player.portrait, width, height, small && !prebuilt);
  const source = prebuilt ?? still ?? player.portrait;

  return (
    <div
      className={`${styles.card} ${interactive ? styles.interactive : ''} ${
        dragging ? styles.dragging : ''
      }`}
      style={{ width, height }}
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
          src={source}
          alt=""
          draggable={false}
          onError={() => {
            // A missing thumb only means this deployment has not built them: fall
            // back to the real picture rather than to the drawn card.
            if (prebuilt) setMissing(prebuilt);
            else setBroken(true);
          }}
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
          {...goldPlusProps(plus)}
        >
          +{plus}
        </span>
      )}
    </div>
  );
}
