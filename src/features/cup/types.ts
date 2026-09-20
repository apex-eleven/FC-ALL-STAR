import type { ShopReward } from '@/features/shop/types';

/**
 * ฟุตบอลถ้วย — knockout cups, in place of the daily league.
 *
 * A league is a table that never ends: it resolves itself in the background, the
 * player's own matches are indistinguishable from the rest, and the day it finishes
 * looks like the day before it. A cup has an entry, a bracket, and a final. You are
 * either still in it or you are out, and the run ends in a trophy or nothing.
 */

/** Two competitions run side by side. */
export type CupKind = 'daily' | 'weekend';
export const CUP_KINDS: readonly CupKind[] = ['daily', 'weekend'];

/** One side in a bracket — a real player's published eleven, or a generated one. */
export interface CupTeam {
  /** Leaderboard uid, `bot:…`, or `you` for the signed-in account. */
  id: string;
  name: string;
  rating: number;
  avatarId: string;
  bot: boolean;
  /** The signed-in account's own seat. Exactly one team in a run carries it. */
  you: boolean;
}

/**
 * One tie in the bracket.
 *
 * `a` and `b` index into `CupRun.teams`. They are -1 until the round before has
 * produced a winner, which is what lets the whole bracket be built at entry and
 * filled in as it plays rather than being grown a round at a time.
 */
export interface CupTie {
  a: number;
  b: number;
  played: boolean;
  score: [number, number];
  /** Penalties, when the tie finished level. */
  shootout: [number, number] | null;
  /** Index into `teams`, or -1 while unplayed. */
  winner: number;
  /** The player watched this one rather than letting it simulate. */
  live: boolean;
}

export type CupRunStatus = 'running' | 'out' | 'champion';

/**
 * One trip through a bracket.
 *
 * Kept whole on the account rather than re-derived: a bracket is a thing a player
 * looks at between rounds, and one that rebuilt itself from a seed on every read
 * would be a different bracket the moment the admin retuned anything.
 */
export interface CupRun {
  id: string;
  kind: CupKind;
  /** The window this run belongs to — see `periodKeyOf`. */
  periodKey: string;
  /** 4, 8 or 16. `teams.length` and the round count follow from it. */
  size: number;
  teams: CupTeam[];
  /** One list per round, first round first. */
  rounds: CupTie[][];
  /** Which round is next to play. Equals `rounds.length` once the run is over. */
  round: number;
  /**
   * When each round kicks off, ISO, one per round.
   *
   * Fixed at the draw rather than derived on read: a run that recomputed its times
   * from the competition's gap would move every remaining round the moment an admin
   * retuned it, including rounds a player had already been told the time of.
   */
  kickoffs: string[];
  status: CupRunStatus;
  /** Round indexes whose reward has been paid. Never paid twice. */
  claimed: number[];
  startedAt: string;
}

/** A finished run, kept for the trophy cabinet. */
export interface CupResult {
  id: string;
  kind: CupKind;
  /** How far they got: the index of the last round they won, +1. 0 = out in round 1. */
  roundsWon: number;
  size: number;
  champion: boolean;
  at: string;
}

/** Per-account cup state. Lives on `Account`, like the squad and the wallet. */
export interface CupState {
  /** The window each competition's counts belong to. */
  periodKey: Record<CupKind, string>;
  /** Entries used in the current window. */
  used: Record<CupKind, number>;
  /** The run in progress (or the finished one, until the window rolls over). */
  runs: Record<CupKind, CupRun | null>;
  /** Cups won, all time. */
  trophies: Record<CupKind, number>;
  /** Newest first, capped. */
  history: CupResult[];
}

/**
 * What reaching a round pays.
 *
 * `round` is an index into the run's rounds: 0 is the first round, and reaching it
 * means nothing more than entering, so the table normally starts at 1. Reaching the
 * round *after* the last one is winning the thing — see `CHAMPION_ROUND`.
 */
export interface CupRoundReward {
  /** Rounds won to earn this. 1 = through the first tie. */
  wins: number;
  rewards: ShopReward[];
}

/** One competition's settings. */
export interface CupCompetition {
  enabled: boolean;
  /** "ถ้วยรายวัน". */
  name: string;
  /** Teams in the bracket: 4, 8 or 16. */
  size: number;
  /** What one entry costs, and in what. 0 is free. */
  entryCost: number;
  entryCurrency: 'ticket' | 'gem' | 'fcpoint' | 'exchange';
  /** Entries allowed per window. */
  entries: number;
  /**
   * Days of the week the window is open, 0 = Sunday. Empty means every day — which
   * is what the daily cup wants, and what the weekend cup must never have.
   */
  days: number[];
  /** Rating spread the padding bots are drawn around the player's own OVR. */
  botSpread: number;
  /**
   * Minutes between one round kicking off and the next.
   *
   * Per competition, not global: the daily cup has to fit its rounds inside a day
   * and the weekend one has a whole weekend, so one number could only ever suit one
   * of them.
   */
  roundGapMinutes: number;
  rewards: CupRoundReward[];
  /** Uploaded art (data URL) or '' for the `/brand/` fallback. */
  background: string;
  trophy: string;
}

export interface CupConfig {
  enabled: boolean;
  /** Hour of day (local) the daily window turns over, and the weekend one opens. */
  resetHour: number;
  /**
   * Real seconds a watched tie's 90 minutes takes at x1.
   *
   * The cup keeps its own rather than borrowing manager mode's: a cup run is up to
   * four matches in a sitting, so it wants to be quicker than a single ranked game,
   * and tying the two together would mean tuning one could only be done by
   * mis-tuning the other.
   */
  matchSeconds: number;
  daily: CupCompetition;
  weekend: CupCompetition;
}

export type CupEnterError =
  | 'closed'
  | 'no-squad'
  | 'not-open'
  | 'no-entries'
  | 'in-progress'
  | 'cannot-afford';

export type CupPlayError =
  | 'closed'
  | 'no-run'
  | 'finished'
  /** The round's kickoff time has not come round yet. */
  | 'too-early'
  | 'club-full'
  | 'card-missing'
  | 'at-cap';
