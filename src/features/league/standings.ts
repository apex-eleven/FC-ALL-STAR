import type { CurrencyKind } from '@/features/currencies/types';
import { HISTORY_LIMIT, PLAYER_TEAM_ID } from './constants';
import {
  buildRivals,
  playMatch,
  roundRobin,
  scoreFor,
  seasonIdAt,
  slotTime,
  slotsElapsed,
  starsFor,
} from './season';
import { emptyRecord } from './types';
import type { LeagueConfig, LeagueRecord, LeagueResult, LeagueState, MatchOutcome, RankReward } from './types';

/** Applies one result to a record. Returns a new record — never mutates. */
function withResult(
  record: LeagueRecord,
  outcome: MatchOutcome,
  goalsFor: number,
  goalsAgainst: number,
): LeagueRecord {
  return {
    played: record.played + 1,
    won: record.won + (outcome === 'win' ? 1 : 0),
    drawn: record.drawn + (outcome === 'draw' ? 1 : 0),
    lost: record.lost + (outcome === 'loss' ? 1 : 0),
    goalsFor: record.goalsFor + goalsFor,
    goalsAgainst: record.goalsAgainst + goalsAgainst,
  };
}

export function emptyLeague(): LeagueState {
  return {
    seasonId: '',
    stars: 0,
    played: 0,
    record: emptyRecord(),
    lastSlot: -1,
    rivals: [],
    history: [],
    pending: null,
  };
}

/**
 * Where the account sits in the table. 1 is top. Ties break in the player's favour.
 *
 * `against` is the star totals to compare with. When real players are in the table it
 * must be theirs, not the generated rivals' — otherwise the rank on screen and the
 * rank the reward is paid for are two different numbers, and the player is right to
 * think the game cheated them.
 */
export function rankOf(state: LeagueState, against?: readonly number[]): number {
  const stars = against ?? state.rivals.map((rival) => rival.stars);
  return stars.filter((value) => value > state.stars).length + 1;
}

export function rewardFor(rank: number, config: LeagueConfig): RankReward | null {
  // Bands are "from this rank down", so the right one is the last whose start the
  // rank has reached.
  const sorted = [...config.rewards].sort((a, b) => a.fromRank - b.fromRank);
  let found: RankReward | null = null;
  for (const band of sorted) if (rank >= band.fromRank) found = band;
  return found;
}

export function rewardEntries(reward: RankReward): { kind: CurrencyKind; amount: number }[] {
  return (
    [
      { kind: 'ticket' as CurrencyKind, amount: reward.ticket },
      { kind: 'gem' as CurrencyKind, amount: reward.gem },
      { kind: 'fcpoint' as CurrencyKind, amount: reward.fcpoint },
    ] satisfies { kind: CurrencyKind; amount: number }[]
  ).filter((entry) => entry.amount > 0);
}

interface AdvanceInput {
  state: LeagueState;
  config: LeagueConfig;
  accountId: string;
  /** The player's squad rating. Drives the odds. */
  rating: number;
  now: Date;
  /** Real players' star totals, when the cloud table has any. Used for the final rank. */
  rivalStars?: readonly number[];
}

export interface AdvanceOutput {
  state: LeagueState;
  /** Set when the season rolled over and a reward is owed. */
  finished: LeagueResult | null;
  /** True when anything changed and the account needs saving. */
  changed: boolean;
}

/**
 * Brings a stored league state up to date with the clock.
 *
 * Called on open, not on a timer. Two things can have happened while the app was
 * closed: fixtures came due, and the 06:00 boundary passed. Both are replayed here,
 * in order, so the state is always a function of "what time is it" rather than of
 * "was the app running".
 *
 * Pure: takes a state, returns a new one. Granting the reward is the caller's job,
 * because that touches the wallet and this file does not.
 */
export function advance({
  state,
  config,
  accountId,
  rating,
  now,
  rivalStars,
}: AdvanceInput): AdvanceOutput {
  if (!config.enabled) return { state, finished: null, changed: false };

  const seasonId = seasonIdAt(now, config.resetHour);

  // --- season rollover -------------------------------------------------
  if (state.seasonId && state.seasonId !== seasonId) {
    const rank = rankOf(state, rivalStars);
    const reward = rewardFor(rank, config);

    const finished: LeagueResult = {
      seasonId: state.seasonId,
      rank,
      stars: state.stars,
      played: state.played,
      rewards: reward ? rewardEntries(reward) : [],
    };

    // A player who never kicked a ball gets the table reset but no prize: handing out
    // a reward for an untouched season would make the ladder pay for doing nothing.
    const earned = state.played > 0 ? finished : null;

    return {
      state: {
        ...freshSeason(accountId, seasonId, config),
        pending: earned,
      },
      finished: earned,
      changed: true,
    };
  }

  // --- first run -------------------------------------------------------
  if (!state.seasonId) {
    return { state: freshSeason(accountId, seasonId, config), finished: null, changed: true };
  }

  // Team count changed under a running season: top up or trim rather than wiping the
  // table, so an admin edit does not cost the player their stars.
  let rivals = state.rivals;
  if (rivals.length !== config.teamCount - 1) {
    const rebuilt = buildRivals(accountId, seasonId, config);
    rivals = rebuilt.map((rival, index) => ({
      ...rival,
      stars: rivals[index]?.stars ?? 0,
      record: rivals[index]?.record ?? rival.record,
    }));
  }

  // --- fixtures due ----------------------------------------------------
  const due = slotsElapsed(now, config);

  // Nothing new to play. This guard has to be exact: the caller writes the returned
  // state back to the account, which re-runs the effect, so reporting "changed" when
  // nothing changed is an infinite render loop, not a wasted write. The last slot
  // played is `due - 1`, so anything at or below that is already resolved.
  const nothingDue = due - 1 <= state.lastSlot;
  if (nothingDue && rivals === state.rivals) {
    return { state, finished: null, changed: false };
  }

  let stars = state.stars;
  let played = state.played;
  let record = state.record ?? emptyRecord();
  const history = [...state.history];
  const table = rivals.map((rival) => ({ ...rival }));
  const byId = new Map(table.map((rival) => [rival.id, rival]));

  /**
   * Every team's schedule for the day, the player included, built once from a
   * proper round-robin (`season.roundRobin`) — the same schedule the fixture board
   * reads to draw itself. A slot is one full round: everyone plays, or sits a bye
   * if the team count is odd, never a fixture invented independently of what the
   * board shows.
   */
  const teamIds = [PLAYER_TEAM_ID, ...table.map((rival) => rival.id)];
  const rounds = roundRobin(teamIds);
  const cycleLength = Math.max(1, rounds.length);

  for (let slot = state.lastSlot + 1; slot < due; slot += 1) {
    const round = rounds[slot % cycleLength] ?? [];

    for (const [homeId, awayId] of round) {
      if (homeId === PLAYER_TEAM_ID || awayId === PLAYER_TEAM_ID) {
        const opponent = byId.get(homeId === PLAYER_TEAM_ID ? awayId : homeId);
        if (!opponent) continue;

        const seed = `${accountId}:${seasonId}:${slot}`;
        const outcome = playMatch(seed, rating, opponent.rating);
        const [goalsFor, goalsAgainst] = scoreFor(seed, outcome);
        const delta = starsFor(outcome, config);

        stars = Math.max(config.starFloor, stars + delta);
        played += 1;
        record = withResult(record, outcome, goalsFor, goalsAgainst);
        history.unshift({
          slot,
          at: slotTime(now, config, slot).toISOString(),
          opponentId: opponent.id,
          opponent: opponent.name,
          opponentRating: opponent.rating,
          opponentAvatarId: opponent.avatarId,
          outcome,
          goalsFor,
          goalsAgainst,
          delta,
        });

        // The club that played the human takes the mirror of that result, score
        // included — one match, one scoreline, read from both ends.
        const mirrored: MatchOutcome = outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw';
        opponent.stars = Math.max(config.starFloor, opponent.stars + starsFor(mirrored, config));
        opponent.record = withResult(opponent.record ?? emptyRecord(), mirrored, goalsAgainst, goalsFor);
        continue;
      }

      // Two rivals, neither of them the player, paired by the same round-robin —
      // resolved for real against each other's actual rating rather than against a
      // fabricated average, so the table this produces is the table the board shows.
      const home = byId.get(homeId);
      const away = byId.get(awayId);
      if (!home || !away) continue;

      const pairSeed = `${accountId}:${seasonId}:${slot}:${homeId}-${awayId}`;
      const outcome = playMatch(pairSeed, home.rating, away.rating);
      const [homeGoals, awayGoals] = scoreFor(pairSeed, outcome);
      const awayOutcome: MatchOutcome = outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw';

      home.stars = Math.max(config.starFloor, home.stars + starsFor(outcome, config));
      home.record = withResult(home.record ?? emptyRecord(), outcome, homeGoals, awayGoals);
      away.stars = Math.max(config.starFloor, away.stars + starsFor(awayOutcome, config));
      away.record = withResult(away.record ?? emptyRecord(), awayOutcome, awayGoals, homeGoals);
    }
  }

  return {
    state: {
      ...state,
      stars,
      played,
      record,
      lastSlot: Math.max(state.lastSlot, due - 1),
      rivals: table,
      history: history.slice(0, HISTORY_LIMIT),
    },
    finished: null,
    changed: true,
  };
}

function freshSeason(accountId: string, seasonId: string, config: LeagueConfig): LeagueState {
  return {
    seasonId,
    stars: 0,
    played: 0,
    record: emptyRecord(),
    lastSlot: -1,
    rivals: buildRivals(accountId, seasonId, config),
    history: [],
    pending: null,
  };
}
