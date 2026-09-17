import type { ShopReward } from '@/features/shop/types';

/**
 * Star Pass — a season-long reward track.
 *
 * Seasons are manager-mode seasons: the pass restarts whenever the manager ladder
 * does. XP comes from claimed missions and finished manager matches; every
 * `xpPerLevel` XP reaches the next level. Each level has a free reward and a
 * premium one, and the premium track opens for the season once bought (or granted
 * by an admin).
 */

export type StarPassTrack = 'free' | 'premium';
export const STARPASS_TRACKS: readonly StarPassTrack[] = ['free', 'premium'];

export type StarPassReward = ShopReward;

export interface StarPassLevel {
  id: string;
  free: StarPassReward[];
  premium: StarPassReward[];
  /** A big-reward level: pinned at the right edge of the track until scrolled to. */
  featured: boolean;
}

export interface StarPassConfig {
  enabled: boolean;
  title: string;
  xpPerLevel: number;
  /** Star Pass XP per 100 mission points claimed (100 = one for one). */
  missionRate: number;
  /** XP for a finished manager match. Forfeits give nothing. */
  matchWin: number;
  matchDraw: number;
  matchLoss: number;
  /** In-game prices for the premium track. null = not sold for that currency. */
  priceGem: number | null;
  priceFcpoint: number | null;
  /** FC points per XP still missing, to buy the next level outright. 0 = not sold. */
  skipPrice: number;
  /** The card shown beside the track: a catalogue card id, or an uploaded image. */
  showcaseCardId: string;
  showcaseImage: string;
  levels: StarPassLevel[];
}

/** Stored on the account. Replaced wholesale when the season changes. */
export interface StarPassProgress {
  season: number;
  xp: number;
  premium: boolean;
  /** Level ids already claimed, per track. */
  claimedFree: string[];
  claimedPremium: string[];
}

export type StarPassCellStatus = 'locked' | 'ready' | 'claimed';

export type StarPassError =
  | 'closed'
  | 'unknown'
  | 'locked'
  | 'no-premium'
  | 'claimed'
  | 'nothing'
  | 'owned'
  | 'not-sold'
  | 'maxed'
  | 'insufficient-funds'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';
