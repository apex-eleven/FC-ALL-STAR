import type { CurrencyKind } from '@/features/currencies/types';

/** Win/draw/loss and goals, shown as the league table's columns. */
export interface LeagueRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

export function emptyRecord(): LeagueRecord {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
}

/** One rival in the daily table. Generated per season, never stored in the catalogue. */
export interface LeagueRival {
  id: string;
  name: string;
  /** Squad rating the simulation plays against. */
  rating: number;
  stars: number;
  /**
   * Avatar id from the game's own catalogue — clubs have no crests here, and the
   * table shows the manager's face instead.
   */
  avatarId: string;
  record: LeagueRecord;
}

export type MatchOutcome = 'win' | 'draw' | 'loss';

export interface LeagueMatch {
  /** Which hourly slot this was, counted from the season's 06:00 start. */
  slot: number;
  /** ISO time of the slot, for display. */
  at: string;
  opponentId: string;
  opponent: string;
  opponentRating: number;
  opponentAvatarId: string;
  outcome: MatchOutcome;
  goalsFor: number;
  goalsAgainst: number;
  /** Stars won or lost, already clamped to the floor. */
  delta: number;
}

/** A fixture between two rivals, derived for the schedule board. */
export interface RivalFixture {
  slot: number;
  at: string;
  homeId: string;
  awayId: string;
  /** Present once the slot has been played. */
  result: { homeGoals: number; awayGoals: number } | null;
}

/** A finished season, kept only until the player has seen the result. */
export interface LeagueResult {
  seasonId: string;
  rank: number;
  stars: number;
  played: number;
  rewards: { kind: CurrencyKind; amount: number }[];
}

/**
 * One account's standing in the current day's league.
 *
 * Rivals are stored rather than re-derived so the table a player looked at an hour
 * ago is the same one they come back to. They are seeded from the account and the
 * season, so a lost save regenerates the same league rather than a different one.
 */
export interface LeagueState {
  /** The 06:00 boundary this season began on, as YYYY-MM-DD. */
  seasonId: string;
  stars: number;
  played: number;
  record: LeagueRecord;
  /** Highest slot already resolved. -1 means the season has not started playing. */
  lastSlot: number;
  rivals: LeagueRival[];
  /** Newest first, capped. */
  history: LeagueMatch[];
  /** Waiting to be shown to the player. Cleared once they close the summary. */
  pending: LeagueResult | null;
}

export interface RankReward {
  /** Applies from this rank down, until the next band starts. */
  fromRank: number;
  ticket: number;
  gem: number;
  fcpoint: number;
}

export interface LeagueConfig {
  enabled: boolean;
  /** Teams in the table, the player included. */
  teamCount: number;
  /** Minutes between matches. 60 is one an hour. */
  matchIntervalMinutes: number;
  /** Local hour the table is settled and cleared. 6 is 06:00. */
  resetHour: number;
  winStars: number;
  drawStars: number;
  lossStars: number;
  /** Stars never fall below this. */
  starFloor: number;
  /** Rating range the generated rivals are drawn from. */
  rivalMinRating: number;
  rivalMaxRating: number;
  rewards: RankReward[];
}
