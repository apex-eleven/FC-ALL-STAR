import type { CurrencyKind } from '@/features/currencies/types';
import type { MatchOutcome } from '@/features/sim/types';

/**
 * Manager mode (เมเนเจอร์โหมด): ranked one-off matches against other real players'
 * published elevens, a star ladder that resets each season, and a weekly win track.
 */

/** One rung of the ladder, lowest first in `ManagerConfig.tiers`. */
export interface ManagerTier {
  id: string;
  /** "ตำนาน IV". */
  name: string;
  /** Stars to fill before a win promotes. 1..5. */
  stars: number;
  /** A loss here never drops a tier. */
  floor: boolean;
  /** Uploaded trophy art (data URL) or '' for the drawn trophy. */
  image: string;
}

export interface ManagerRewardLine {
  kind: CurrencyKind;
  amount: number;
}

/** Reached by winning `wins` ranked matches in one week. */
export interface ManagerMilestone {
  id: string;
  wins: number;
  rewards: ManagerRewardLine[];
}

/** One slide of the "รางวัลประจำสัปดาห์" carousel. */
export interface ManagerBanner {
  id: string;
  title: string;
  /** Small orange tag in the corner, e.g. "ใหม่". '' hides it. */
  tag: string;
  image: string;
}

export interface ManagerConfig {
  enabled: boolean;
  /** Screen title under the countdown, e.g. "เมเนเจอร์โหมด". */
  title: string;
  /** The big italic word beside the logo, e.g. "NUMERO". */
  modeName: string;
  /** Season length in days, and the date the first season began (YYYY-MM-DD). */
  seasonDays: number;
  seasonAnchor: string;
  /** Tiers a player drops at a season change. */
  seasonDrop: number;
  /** Hour of day (local) seasons and weeks turn over. */
  resetHour: number;
  tiers: ManagerTier[];
  milestones: ManagerMilestone[];
  banners: ManagerBanner[];
  /** Full-screen art and the centre figure. '' falls back to /brand files. */
  background: string;
  figure: string;
  /** The balance shown top right. */
  headerCurrency: CurrencyKind;
  /** Squad OVR the fallback bots are drawn around, ± this much. */
  botSpread: number;
  /** Real seconds a full 90 minutes takes at normal speed. */
  matchSeconds: number;
}

export interface ManagerOpponent {
  /** Leaderboard uid, or `bot:…` for a generated side. */
  id: string;
  name: string;
  rating: number;
  avatarId: string;
  bot: boolean;
}

export interface ManagerMatch {
  id: string;
  at: string;
  ranked: boolean;
  opponent: ManagerOpponent;
  rating: number;
  outcome: MatchOutcome;
  score: [number, number];
  /** Ladder position before and after, for the result screen and history. */
  tierBefore: number;
  starsBefore: number;
  tierAfter: number;
  starsAfter: number;
  /** Left before the final whistle — recorded as a 0-3 loss. */
  forfeit?: boolean;
  /** Lost with a star shield on: the stars were kept and one shield was spent. */
  shielded?: boolean;
}

/**
 * A ranked match that has kicked off but not been settled. Written before the first
 * whistle; a page that closes mid-match finds it on the next load and settles it as
 * a forfeit, so quitting a losing game never saves the stars.
 */
export interface ManagerPending {
  id: string;
  at: string;
  opponent: ManagerOpponent;
  rating: number;
}

/** Per-account progress. Absent on accounts that never opened the mode. */
export interface ManagerState {
  /** Season index the ladder belongs to; a different current index resets it. */
  season: number;
  tier: number;
  stars: number;
  /** Week key (YYYY-MM-DD of its first day) the win count belongs to. */
  week: string;
  weekWins: number;
  /** Milestones already paid this week, by id. */
  claimed: string[];
  /** Matches ever played — the seed counter, so each match rolls differently. */
  played: number;
  history: ManagerMatch[];
  pending?: ManagerPending | null;
}

export type ManagerPlayError = 'closed' | 'no-squad';
