import type { CurrencyKind } from '@/features/currencies/types';
import type { FormationId } from '@/features/squad/types';

/**
 * ไอดีบอท — accounts the admin creates that play the game on their own.
 *
 * A bot is an ordinary account (`accounts/{uid}`, `usernames/{name}`,
 * `leaderboard/{uid}`) written in exactly the shape a real signup writes, so every
 * screen another player can see — leaderboard, manager ladder, cup draws, live chat,
 * 1 OF 1 — has nothing to tell it apart by. What makes it a bot lives only in
 * `bots/{uid}`, which the Firestore rules let nobody but an admin read.
 */

/** How a bot plays: how often, how long, how much it spends and how far it pushes. */
export type BotPersona = 'casual' | 'regular' | 'grinder' | 'whale';

export const BOT_PERSONAS: readonly BotPersona[] = ['casual', 'regular', 'grinder', 'whale'];

/** Everything a bot can decide to do in one step. */
export type BotAction =
  | 'login'
  | 'claim'
  | 'squad'
  | 'pack'
  | 'rankup'
  | 'ranked'
  | 'cup'
  | 'chat'
  | 'idle';

/** What a persona pays in each day, standing in for top-ups and the modes bots skip. */
export type BotIncome = Partial<Record<CurrencyKind, number>>;

/** How many of each thing a bot has done on its current day. Caps keep it human. */
export interface BotDayCounters {
  /** Day key (YYYY-MM-DD, local) these counts belong to. */
  day: string;
  packs: number;
  matches: number;
  rankups: number;
  cups: number;
  chats: number;
  /** Today's income has been paid. */
  paid: boolean;
}

export interface BotLogEntry {
  at: string;
  text: string;
}

/** Lifetime totals, shown in the admin list. */
export interface BotStats {
  packs: number;
  cards: number;
  matches: number;
  wins: number;
  rankups: number;
  rankupWins: number;
  cups: number;
  trophies: number;
  chats: number;
}

/**
 * The admin-only side of a bot, at `bots/{uid}`.
 *
 * Scheduling lives here rather than on the account so nothing about when or how a
 * bot plays is ever written where the game (or a curious player) could read it.
 */
export interface BotProfile {
  uid: string;
  /** Login ID, the same string as `accounts/{uid}.username`. */
  username: string;
  persona: BotPersona;
  /** Paused bots are skipped by the runner and keep whatever they have. */
  enabled: boolean;
  createdAt: string;
  createdBy: string;
  /**
   * Local hours the bot is "online", e.g. [18, 25] = 18:00 to 01:00. The end may run
   * past 24 so a window can cross midnight. Randomised per bot at creation, so no two
   * bots log on at the same minute.
   */
  activeFrom: number;
  activeTo: number;
  /** The shape this bot likes. Casual players stick to one; others search for the best. */
  formation: FormationId;
  /** When the runner should next act for this bot (ISO). */
  nextActionAt: string;
  /** Actions left in the session under way; 0 means the next step starts a new one. */
  sessionLeft: number;
  lastActiveAt: string;
  today: BotDayCounters;
  stats: BotStats;
  /** Newest first, capped at BOT_LOG_LIMIT. */
  log: BotLogEntry[];
  /** Signature of the last leaderboard row published, so an unchanged team is not rewritten. */
  boardSig: string;
  /** Team OVR and manager rank after the last step — for the admin list only. */
  ovr: number;
  rank: string;
}

/** Global bot settings, at `botConfig/settings`. Admin only, never in the public config. */
export interface BotSettings {
  /** Master switch. Off, no browser runs any bot. */
  enabled: boolean;
  /** Bots post in the home live chat. */
  chat: boolean;
  /** Minutes between two bot chat lines, across all bots, so the chat never floods. */
  chatGapMinutes: number;
  /** Idle chatter, one line per entry. `{ovr}` `{name}` `{tier}` are filled in. */
  chatLines: string[];
  /** Lines for a big pull. `{card}` is the card name. */
  pullLines: string[];
  /** Lines for a rank-up that landed. `{card}` `{plus}`. */
  rankupLines: string[];
  /** Lines for a cup title. `{cup}`. */
  winLines: string[];
  /** Lines for a ranked promotion. `{tier}`. */
  promoteLines: string[];
  /** Bots may take the server's first +9/+10 (1 OF 1) plate. Off keeps them for real players. */
  oneOfOne: boolean;
  /** Daily income per persona. */
  income: Record<BotPersona, BotIncome>;
}

/** A runner lease, at `botConfig/lease`: which browser is driving the bots. */
export interface BotLease {
  holder: string;
  /** Holder label for the admin panel ("ddx · Chrome"). */
  label: string;
  /** Epoch ms the lease expires unless renewed. */
  until: number;
}
