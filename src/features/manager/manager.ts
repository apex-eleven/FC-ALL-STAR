import { avatarCatalogue } from '@/data/mock/avatars';
import type { Account } from '@/features/auth/types';
import { appendEntry, credit } from '@/features/currencies/wallet';
import { RIVAL_NAMES } from '@/features/league/constants';
import { playMatch, scoreFor, seeded } from '@/features/league/season';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { HISTORY_LIMIT } from './constants';
import type {
  ManagerConfig,
  ManagerMatch,
  ManagerMilestone,
  ManagerOpponent,
  ManagerPending,
  ManagerPlayError,
  ManagerState,
  ManagerTier,
} from './types';

/**
 * Pure manager-mode rules. Nothing here touches React, storage, or the network —
 * the opponent list is passed in, and every function that changes an account takes
 * one and returns a new one.
 */

const DAY_MS = 86_400_000;

/** Local midnight of a YYYY-MM-DD, moved to the reset hour. */
function anchorAt(config: Pick<ManagerConfig, 'seasonAnchor' | 'resetHour'>): Date {
  const [year, month, day] = config.seasonAnchor.split('-').map(Number);
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, config.resetHour, 0, 0, 0);
}

/** Which season `now` falls in. Seasons run back to back from the anchor date. */
export function seasonIndex(now: Date, config: ManagerConfig): number {
  const elapsed = now.getTime() - anchorAt(config).getTime();
  return Math.max(0, Math.floor(elapsed / (config.seasonDays * DAY_MS)));
}

export function seasonEnd(now: Date, config: ManagerConfig): Date {
  const start = anchorAt(config);
  const index = seasonIndex(now, config);
  // Built from calendar days, not raw milliseconds, so a DST change cannot move the
  // reset off its hour.
  const end = new Date(start);
  end.setDate(start.getDate() + (index + 1) * config.seasonDays);
  return end;
}

/** "8 วัน", "5 ชม.", "12 นาที" — the largest unit left, as the reference shows it. */
export function timeLeft(target: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  if (seconds >= 86_400) return `${Math.floor(seconds / 86_400)} วัน`;
  if (seconds >= 3_600) return `${Math.floor(seconds / 3_600)} ชม.`;
  return `${Math.max(1, Math.floor(seconds / 60))} นาที`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Monday of the week `now` is in, counting a day as starting at the reset hour. */
export function weekKey(now: Date, resetHour: number): string {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - resetHour);
  const back = (shifted.getDay() + 6) % 7;
  shifted.setDate(shifted.getDate() - back);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

export function emptyState(): ManagerState {
  return {
    season: -1,
    tier: 0,
    stars: 0,
    week: '',
    weekWins: 0,
    claimed: [],
    played: 0,
    history: [],
    pending: null,
  };
}

/**
 * The account's ladder as of `now`: a new season drops the tier, a new week clears
 * the win track, and anything the admin has since shortened is clamped back in.
 */
export function currentState(
  saved: ManagerState | undefined,
  config: ManagerConfig,
  now: Date,
): ManagerState {
  const state = saved ?? emptyState();
  const season = seasonIndex(now, config);
  const week = weekKey(now, config.resetHour);
  const top = config.tiers.length - 1;

  let tier = Math.min(state.tier, top);
  let stars = state.stars;

  if (state.season !== season) {
    if (state.season < 0) {
      tier = 0;
    } else {
      // One drop per season missed, so an account away for three seasons does not
      // come back where it left.
      const missed = Math.max(1, season - state.season);
      tier = Math.max(0, tier - config.seasonDrop * missed);
    }
    stars = 0;
  }

  const rung = config.tiers[tier];
  stars = Math.max(0, Math.min(stars, rung?.stars ?? 0));

  const sameWeek = state.week === week;
  return {
    ...state,
    season,
    tier,
    stars,
    week,
    weekWins: sameWeek ? state.weekWins : 0,
    claimed: sameWeek ? state.claimed : [],
  };
}

/**
 * One ranked result applied to the ladder.
 *
 * A win adds a star; filling the tier's last star moves up with none. A loss takes
 * a star, and one taken at zero drops a tier — unless the tier is a floor. A draw
 * changes nothing.
 */
export function climb(
  position: { tier: number; stars: number },
  outcome: ManagerMatch['outcome'],
  tiers: readonly ManagerTier[],
): { tier: number; stars: number } {
  const rung = tiers[position.tier];
  if (!rung) return position;

  if (outcome === 'win') {
    const stars = position.stars + 1;
    if (stars >= rung.stars && position.tier < tiers.length - 1) {
      return { tier: position.tier + 1, stars: 0 };
    }
    return { tier: position.tier, stars: Math.min(stars, rung.stars) };
  }

  if (outcome === 'loss') {
    if (position.stars > 0) return { tier: position.tier, stars: position.stars - 1 };
    if (rung.floor || position.tier === 0) return position;
    const below = tiers[position.tier - 1]!;
    return { tier: position.tier - 1, stars: Math.max(0, below.stars - 1) };
  }

  return position;
}

/** The next milestone still to reach this week, or null once all are paid. */
export function nextMilestone(
  state: Pick<ManagerState, 'claimed'>,
  config: ManagerConfig,
): ManagerMilestone | null {
  return config.milestones.find((milestone) => !state.claimed.includes(milestone.id)) ?? null;
}

/**
 * Picks who to play.
 *
 * Real published elevens first, nearest in OVR — the closest few, not strictly the
 * closest one, so the same opponent does not come up every time. With nobody else
 * published (or no cloud), a generated side near the player's own rating.
 */
export function pickOpponent(
  seed: string,
  selfId: string,
  rating: number,
  entries: readonly LeaderboardEntry[],
  config: Pick<ManagerConfig, 'botSpread'>,
): ManagerOpponent {
  const pool = entries
    .filter((entry) => entry.uid !== selfId && entry.rating > 0 && entry.cards.length > 0)
    .sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating))
    .slice(0, 8);

  if (pool.length > 0) {
    const chosen = pool[Math.floor(seeded(`${seed}:pick`) * pool.length) % pool.length]!;
    return {
      id: chosen.uid,
      name: chosen.username,
      rating: chosen.rating,
      avatarId: chosen.avatarId,
      bot: false,
    };
  }

  const spread = config.botSpread;
  const offset = Math.round((seeded(`${seed}:bot-rating`) * 2 - 1) * spread);
  const name = RIVAL_NAMES[Math.floor(seeded(`${seed}:bot-name`) * RIVAL_NAMES.length) % RIVAL_NAMES.length]!;
  const avatar =
    avatarCatalogue[Math.floor(seeded(`${seed}:bot-avatar`) * avatarCatalogue.length) % avatarCatalogue.length];
  return {
    id: `bot:${name}`,
    name,
    rating: Math.max(1, rating + offset),
    avatarId: avatar?.id ?? '',
    bot: true,
  };
}

export interface ManagerPlayInput {
  ranked: boolean;
  opponent: ManagerOpponent;
  /** The player's squad OVR at kick-off. */
  rating: number;
  config: ManagerConfig;
  now: Date;
  /** Fixed by the caller, so a re-run of the mutator plays the identical match. */
  matchId: string;
  /**
   * The result the live match produced. Absent, the match is decided here from the
   * two ratings — the quick simulation.
   */
  result?: { score: [number, number]; forfeit?: boolean };
  /** A star shield is switched on and held: a ranked loss keeps its stars. */
  shield?: boolean;
}

export function outcomeOf(score: readonly [number, number]): ManagerMatch['outcome'] {
  return score[0] > score[1] ? 'win' : score[0] < score[1] ? 'loss' : 'draw';
}

/**
 * Marks a ranked match as under way. Settled by `playManagerMatch` with the same id;
 * left unsettled, it is a forfeit.
 */
export function startPending(
  account: Account,
  pending: ManagerPending,
  config: ManagerConfig,
  now: Date,
): Account {
  return {
    ...account,
    manager: { ...currentState(account.manager, config, now), pending },
  };
}

export interface ManagerPlayOutcome {
  ok: boolean;
  error: ManagerPlayError | null;
  account: Account;
  match: ManagerMatch | null;
  /** Milestones this match completed, already credited. */
  paid: ManagerMilestone[];
}

/**
 * Plays one match and files everything it changes — ladder, week track, milestone
 * rewards, history — in a single new account. The result is decided and saved
 * before the screen reveals it.
 */
export function playManagerMatch(account: Account, input: ManagerPlayInput): ManagerPlayOutcome {
  const { config, now, ranked, opponent, rating, matchId } = input;
  const fail = (error: ManagerPlayError): ManagerPlayOutcome => ({
    ok: false,
    error,
    account,
    match: null,
    paid: [],
  });

  if (!config.enabled) return fail('closed');
  if (rating <= 0) return fail('no-squad');

  const state = currentState(account.manager, config, now);
  const seed = `${account.id}:manager:${matchId}`;
  const outcome = input.result ? outcomeOf(input.result.score) : playMatch(seed, rating, opponent.rating);
  const score = input.result ? input.result.score : scoreFor(seed, outcome);

  // A shield covers a ranked loss played to the end. Leaving early is not covered.
  const shielded = ranked && outcome === 'loss' && Boolean(input.shield) && !input.result?.forfeit;
  const after =
    ranked && !shielded ? climb(state, outcome, config.tiers) : { tier: state.tier, stars: state.stars };
  const weekWins = ranked && outcome === 'win' ? state.weekWins + 1 : state.weekWins;

  // Every milestone the new total reaches and that has not been paid this week.
  const paid = config.milestones.filter(
    (milestone) => milestone.wins <= weekWins && !state.claimed.includes(milestone.id),
  );

  let wallet = account.wallet;
  let ledger = account.ledger;
  for (const milestone of paid) {
    for (const line of milestone.rewards) {
      const result = credit(wallet, line.kind, line.amount, { reason: 'manager' });
      // A balance at its cap takes what fits; the milestone still counts as paid.
      if (!result.entry) continue;
      wallet = result.wallet;
      ledger = appendEntry(ledger, result.entry);
    }
  }

  const match: ManagerMatch = {
    id: matchId,
    at: now.toISOString(),
    ranked,
    opponent,
    rating,
    outcome,
    score,
    tierBefore: state.tier,
    starsBefore: state.stars,
    tierAfter: after.tier,
    starsAfter: after.stars,
    ...(input.result?.forfeit ? { forfeit: true } : {}),
    ...(shielded ? { shielded: true } : {}),
  };

  return {
    ok: true,
    error: null,
    match,
    paid,
    account: {
      ...account,
      wallet,
      ledger,
      manager: {
        ...state,
        tier: after.tier,
        stars: after.stars,
        weekWins,
        claimed: [...state.claimed, ...paid.map((milestone) => milestone.id)],
        played: state.played + 1,
        history: [match, ...state.history].slice(0, HISTORY_LIMIT),
        pending: state.pending?.id === matchId ? null : (state.pending ?? null),
      },
    },
  };
}
