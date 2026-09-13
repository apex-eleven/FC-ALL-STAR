import type { PlayerSet } from '@/features/draft/types';

export interface WalkoutConfig {
  enabled: boolean;
  /**
   * Which tiers earn the animation. An empty list means tier is not a condition —
   * any card can qualify, and only the rating decides.
   */
  sets: PlayerSet[];
  /**
   * Whether the rating condition applies at all.
   *
   * Off means "any card in the chosen tiers", which is the natural setup once tiers
   * exist: a pack whose A tier is all 120s does not need a number as well.
   */
  useMinRating: boolean;
  /** Cards at or above this rating get the walkout, when `useMinRating` is on. */
  minRating: number;
  /** Seconds into the flight clip at which each fact appears. */
  nationAt: number;
  positionAt: number;
  clubAt: number;
  /**
   * How long before the flight clip ends the stage clip starts, in seconds.
   *
   * Must fit inside the flight's closing white flash, which is fully saturated for
   * only 0.208s (6.833s to 7.042s, measured frame by frame). A longer crossfade
   * starts while the image is still resolving and the join becomes visible.
   */
  crossfade: number;
  /**
   * How long the white veil takes to clear once the stage clip is showing. The flash
   * is pure white and the stage opens dark, so cutting straight between them is a
   * jolt; holding the white and dissolving it reads as the flash blowing out.
   */
  flashOut: number;
  /** 0 means the stage loops until the player closes it. */
  autoCloseSeconds: number;
}

export type WalkoutPhase = 'loading' | 'flight' | 'stage';
