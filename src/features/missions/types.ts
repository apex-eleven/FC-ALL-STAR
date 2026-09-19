import type { RouteId } from '@/features/navigation/routes';
import type { ShopReward } from '@/features/shop/types';

/**
 * Daily and weekly missions (ภารกิจ).
 *
 * The game counts what a player does — matches, pulls, rank-ups — per period; a
 * mission is an admin-set target on one of those counts. Claiming a finished mission
 * pays its rewards and adds its points; the points open the period's chests.
 */

export type MissionPeriod = 'daily' | 'weekly';
export const MISSION_PERIODS: readonly MissionPeriod[] = ['daily', 'weekly'];

/** Everything the game counts for missions. */
export type MissionMetric =
  | 'login'
  | 'manager-play'
  | 'manager-win'
  | 'manager-goal'
  | 'draft-pull'
  | 'rankup-try'
  | 'rankup-success'
  | 'cup-play'
  | 'cup-win'
  | 'cup-goal'
  | 'transfer-buy'
  | 'transfer-sell'
  | 'shop-buy';

export interface MissionMetricInfo {
  metric: MissionMetric;
  /** Admin dropdown label. */
  label: string;
  /** Player-facing title; `{n}` is replaced with the target. */
  template: string;
  /** Where the "ไปเลย" button leads. null = nothing to go to. */
  route: RouteId | null;
}

/** Rewards use the shop's shape: any currency, or catalogue cards at +0..+8. */
export type MissionReward = ShopReward;

export interface MissionDef {
  id: string;
  enabled: boolean;
  period: MissionPeriod;
  metric: MissionMetric;
  target: number;
  /** Added to the period's point track when claimed. */
  points: number;
  rewards: MissionReward[];
  /** Overrides the generated title. '' = "เล่นเมเนเจอร์โหมด 3 นัด" from the metric. */
  title: string;
}

/** A chest on the point track, opened once the period's points reach `points`. */
export interface MissionChest {
  id: string;
  points: number;
  rewards: MissionReward[];
}

export interface MissionConfig {
  enabled: boolean;
  /** Hour of the day (device time) the daily missions reset. Weeks start on Monday. */
  resetHour: number;
  missions: MissionDef[];
  dailyChests: MissionChest[];
  weeklyChests: MissionChest[];
}

export type MissionCounts = Partial<Record<MissionMetric, number>>;

/** One period's progress. Replaced wholesale when the period rolls over. */
export interface MissionPeriodState {
  /** Day ("2026-09-17") or week-start date this state belongs to. */
  key: string;
  counts: MissionCounts;
  /** Mission ids already claimed this period. */
  claimed: string[];
  /** Points earned from claims this period. */
  points: number;
  /** Chest ids already opened this period. */
  chests: string[];
}

/** Stored on the account. Absent until the first counted action. */
export interface MissionProgress {
  daily: MissionPeriodState;
  weekly: MissionPeriodState;
}

export type MissionStatus = 'progress' | 'ready' | 'claimed';

export type MissionClaimError =
  | 'closed'
  | 'unknown'
  | 'not-ready'
  | 'claimed'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';
