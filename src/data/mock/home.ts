import { ASSETS } from '@/assets/assetMap';
import type {
  ClubSummary,
  HeroBackdrop,
  HeroContent,
  PlayCardContent,
} from '@/features/home/types';

/**
 * Placement of the current key art on the stage. Tuned against the reference
 * screenshot so the three figures land where the game puts them: heads between
 * x459 and x1067, the foreground player bleeding past the bottom edge.
 *
 * Swapping the art: replace hero-key-art.webp, then adjust only the numbers here.
 *   - artWidth / artHeight  = natural size x the scale you want (this one: 2048x1536 x 0.64)
 *   - artOffsetX / Y        = which part of the art shows through the window
 *   - left / top / width    = the window itself, in stage pixels
 * The window stops at x1162 so its right edge tucks under the news banner (x1150)
 * instead of ending in open space.
 */
export const heroBackdrop: HeroBackdrop = {
  source: ASSETS.home.heroKeyArt,
  focus: {
    left: 382,
    top: -18,
    width: 780,
    height: 983,
    artWidth: 1311,
    artHeight: 983,
    artOffsetX: -531,
    artOffsetY: 0,
    fadeLeft: '18%',
    fadeRight: '90%',
  },
  wash: {
    objectPosition: '64% 36%',
    blur: 40,
    // Kept bright on purpose. A dark wash makes the sharp window read as a lit
    // panel with visible edges; matching its luminance hides the crop instead.
    brightness: 0.9,
    saturate: 1.12,
    opacity: 0.96,
  },
};

export const hero: HeroContent = {
  title: 'NUMERO',
  ctaLabel: 'ไปเลย',
  slideCount: 6,
  activeSlide: 0,
};

export const club: ClubSummary = {
  name: 'CLUB',
  overallRating: 125,
  background: ASSETS.home.clubBackground,
};

export const playCard: PlayCardContent = {
  label: 'เล่น',
  background: ASSETS.home.playBackground,
};

/** Label under the small news button in the top bar. */
export const newsButtonLabel = 'ข่าว';
