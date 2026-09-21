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
  /** Seconds into the clip at which each fact appears, during the intro. */
  nationAt: number;
  positionAt: number;
  clubAt: number;
  /**
   * Where the loop starts, in seconds into the clip.
   *
   * One file does what two used to: everything before this plays once as the intro,
   * and from here to the end repeats until the player leaves. The card appears the
   * first time playback crosses this point.
   *
   * A point on a keyframe loops without a hitch; anywhere else the browser has to
   * decode forward from the keyframe before it, which can stutter on a phone.
   */
  loopStart: number;
  /** 0 means the loop runs until the player closes it. */
  autoCloseSeconds: number;
}

/** `intro` plays once up to `loopStart`; `loop` repeats from there to the end. */
export type WalkoutPhase = 'loading' | 'intro' | 'loop';
