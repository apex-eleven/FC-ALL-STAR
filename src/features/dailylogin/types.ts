import type { ShopReward } from '@/features/shop/types';

/**
 * The daily login calendar (เข้าเกมรายวัน).
 *
 * One reward per day for showing up. Two shapes of calendar:
 *
 * - `week`  — seven tiles. Each claim moves to the next tile; after the seventh the
 *             calendar starts over. A missed day does not reset the count.
 * - `month` — one tile per day of the calendar month. Claims fill the tiles in order,
 *             so a missed day means the last tiles stay out of reach until next month.
 *
 * Either way a day is claimed at most once, and the day boundary is the admin's
 * reset hour, not midnight — the same convention missions use.
 */

export type LoginCycle = 'week' | 'month';
export const LOGIN_CYCLES: readonly LoginCycle[] = ['week', 'month'];

export interface LoginDay {
  /** 1-based tile number. */
  day: number;
  rewards: ShopReward[];
  /** Drawn larger and brighter — the day worth coming back for. */
  big: boolean;
}

export interface DailyLoginConfig {
  enabled: boolean;
  /** Heading on the calendar. */
  title: string;
  cycle: LoginCycle;
  /** Hour of the day (device time) a new login day starts. */
  resetHour: number;
  /** Opens by itself on the home screen while today is unclaimed. */
  autoOpen: boolean;
  /** Exactly 7 for `week`, 31 for `month` — normalized to that length. */
  days: LoginDay[];
}

/** Stored on the account. Absent until the first claim. */
export interface DailyLoginProgress {
  /**
   * Which run of the calendar the claims belong to: `w:<start day>` for a week
   * cycle, `m:<YYYY-MM>` for a month. A key that does not match the live cycle
   * means the progress is from another run and starts over.
   */
  cycleKey: string;
  /** Day keys (YYYY-MM-DD) claimed in this run, oldest first. */
  claimedDays: string[];
  /** Consecutive days claimed, counting today if claimed. Informational. */
  streak: number;
  /** Day key of the latest claim, for the streak. */
  lastClaimDay: string;
}

export type LoginClaimError =
  | 'closed'
  | 'claimed'
  | 'complete'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';

export type LoginTileStatus = 'claimed' | 'today' | 'upcoming';
