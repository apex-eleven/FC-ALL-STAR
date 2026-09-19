import { avatarCatalogue } from '@/data/mock/avatars';
import { dayKeyAt, dayStartAt } from '@/lib/dayKey';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { RIVAL_NAMES } from '@/features/sim/constants';
import { playTie, seeded, shootoutFor } from '@/features/sim/seeded';
import { advanceSlot, emptyBoard, isHome, tieOf } from './bracket';
import { HISTORY_LIMIT, YOU_ID, roundCount } from './constants';
import type {
  CupCompetition,
  CupConfig,
  CupKind,
  CupResult,
  CupRun,
  CupRoundReward,
  CupState,
  CupTeam,
  CupTie,
} from './types';

/**
 * Cup rules. Nothing here touches React, storage, or the network — opponents are
 * passed in, and every function that changes a run returns a new one.
 */

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The start of the cup day `now` falls in — `resetHour`, not midnight.
 *
 * The same boundary the shop's daily limits and the mission counts use, from the
 * same helper, so "today" means one thing across the whole game.
 */
export const cupDayStart = dayStartAt;

/** True when this competition runs on the cup day `now` falls in. */
export function windowOpen(now: Date, config: CupConfig, competition: CupCompetition): boolean {
  if (!config.enabled || !competition.enabled) return false;
  // No days set means every day — what the daily cup wants.
  if (competition.days.length === 0) return true;
  return competition.days.includes(cupDayStart(now, config.resetHour).getDay());
}

/**
 * The first cup day of the open stretch `now` sits in.
 *
 * Friday, Saturday and Sunday are one window, not three: entries bought on Friday
 * are still there on Sunday, and a run started on Saturday survives the night. So
 * the window is found by walking back over consecutive open days rather than by
 * taking today.
 *
 * The walk is capped at a week, because a competition set to all seven days has no
 * first day to find and would otherwise walk backwards forever.
 */
export function windowStart(now: Date, config: CupConfig, competition: CupCompetition): Date {
  const start = cupDayStart(now, config.resetHour);
  if (competition.days.length === 0 || competition.days.length >= 7) return start;

  const cursor = new Date(start);
  for (let step = 0; step < 7; step += 1) {
    const previous = new Date(cursor.getTime() - DAY_MS);
    if (!competition.days.includes(previous.getDay())) break;
    cursor.setTime(previous.getTime());
  }
  return cursor;
}

/** When the open stretch closes: `resetHour` on the day after its last open day. */
export function windowEnd(now: Date, config: CupConfig, competition: CupCompetition): Date {
  const start = cupDayStart(now, config.resetHour);
  const cursor = new Date(start);

  if (competition.days.length > 0 && competition.days.length < 7) {
    for (let step = 0; step < 7; step += 1) {
      const next = new Date(cursor.getTime() + DAY_MS);
      if (!competition.days.includes(next.getDay())) break;
      cursor.setTime(next.getTime());
    }
  }

  const end = new Date(cursor);
  end.setDate(end.getDate() + 1);
  return end;
}

/**
 * The next time this competition opens, for the countdown on a closed cup.
 *
 * Looks forward a fortnight rather than computing it: a fortnight covers every
 * weekly pattern, and a loop that reads the same `days` list the rest of the file
 * does cannot disagree with it.
 */
export function nextOpen(now: Date, config: CupConfig, competition: CupCompetition): Date | null {
  if (competition.days.length === 0) return null;
  const cursor = cupDayStart(now, config.resetHour);
  for (let step = 1; step <= 14; step += 1) {
    const day = new Date(cursor.getTime() + step * DAY_MS);
    if (competition.days.includes(day.getDay())) return day;
  }
  return null;
}

/** Identifies the window a run and its entry count belong to. */
export function periodKeyOf(now: Date, config: CupConfig, competition: CupCompetition): string {
  return dayKeyAt(windowStart(now, config, competition), config.resetHour);
}

export function emptyCup(): CupState {
  return {
    periodKey: { daily: '', weekend: '' },
    used: { daily: 0, weekend: 0 },
    runs: { daily: null, weekend: null },
    trophies: { daily: 0, weekend: 0 },
    history: [],
  };
}

/**
 * The account's cups as of `now`: a window that has turned over clears its entry
 * count and its run.
 *
 * A finished run is kept until the window rolls, so someone who wins at 23:00 still
 * sees the bracket they won when they come back at 23:05 — but never so long that
 * yesterday's trophy is still sitting on today's screen.
 */
export function currentCup(saved: CupState | undefined, config: CupConfig, now: Date): CupState {
  const state = saved ?? emptyCup();
  const next: CupState = {
    periodKey: { ...state.periodKey },
    used: { ...state.used },
    runs: { ...state.runs },
    trophies: { ...state.trophies },
    history: state.history ?? [],
  };

  for (const kind of ['daily', 'weekend'] as const) {
    const key = periodKeyOf(now, config, config[kind]);
    if (next.periodKey[kind] === key) continue;
    next.periodKey[kind] = key;
    next.used[kind] = 0;
    next.runs[kind] = null;
  }

  return next;
}

/** Entries left in the current window. */
export function entriesLeft(state: CupState, kind: CupKind, competition: CupCompetition): number {
  return Math.max(0, competition.entries - (state.used[kind] ?? 0));
}

/** The signed-in account's seat in a run, or -1 on a run that somehow has none. */
export function yourSeat(run: CupRun): number {
  return run.teams.findIndex((team) => team.you);
}

/**
 * The account's tie in the round about to be played, or null once they are out.
 *
 * This is the one the "ดูสด" button watches and the one `playRound` settles with a
 * live score — the same tie either way, which is why both go through here.
 */
export function tieForYou(run: CupRun): CupTie | null {
  const ties = run.rounds[run.round];
  if (!ties) return null;
  const index = tieOf(ties, yourSeat(run));
  return index >= 0 ? (ties[index] ?? null) : null;
}

/** Ties the account has won in this run. Its position on the reward ladder. */
export function roundsWon(run: CupRun): number {
  const seat = yourSeat(run);
  if (seat < 0) return 0;
  return run.rounds.filter((ties) => ties.some((tie) => tie.played && tie.winner === seat)).length;
}

export interface BuildRunInput {
  id: string;
  kind: CupKind;
  periodKey: string;
  competition: CupCompetition;
  /** The account's own seat details. */
  self: { id: string; name: string; rating: number; avatarId: string };
  /** Published elevens to draw real opponents from. */
  entries: readonly LeaderboardEntry[];
  now: Date;
}

/**
 * Draws a bracket.
 *
 * Real published elevens first, nearest in OVR, with generated sides padding out
 * whatever is left — the same order of preference manager mode uses, for the same
 * reason: a cup full of bots when six real people are playing is a worse cup.
 *
 * Seats are then handed out by rating, strongest first, so the seeding means
 * something. A player near the bottom meets a top seed early; that is what being
 * seeded low is.
 */
export function buildRun(input: BuildRunInput): CupRun {
  const { competition, self, entries, id } = input;
  const size = competition.size;

  const real = entries
    .filter((entry) => entry.uid !== self.id && entry.rating > 0 && entry.cards.length > 0)
    .sort((a, b) => Math.abs(a.rating - self.rating) - Math.abs(b.rating - self.rating))
    .slice(0, size - 1)
    .map(
      (entry): CupTeam => ({
        id: entry.uid,
        name: entry.username,
        rating: entry.rating,
        avatarId: entry.avatarId,
        bot: false,
        you: false,
      }),
    );

  const bots: CupTeam[] = [];
  const usedNames = new Set(real.map((team) => team.name));
  for (let index = real.length; index < size - 1; index += 1) {
    const seed = `${id}:bot:${index}`;
    const offset = Math.round((seeded(`${seed}:ovr`) * 2 - 1) * competition.botSpread);

    // Walk the name list from the seeded position rather than re-rolling, so a
    // bracket can never field the same invented club twice however many it needs.
    let name = '';
    const first = Math.floor(seeded(`${seed}:name`) * RIVAL_NAMES.length);
    for (let step = 0; step < RIVAL_NAMES.length; step += 1) {
      const candidate = RIVAL_NAMES[(first + step) % RIVAL_NAMES.length]!;
      if (!usedNames.has(candidate)) {
        name = candidate;
        break;
      }
    }
    if (!name) name = `สโมสร ${index + 1}`;
    usedNames.add(name);

    const avatar =
      avatarCatalogue[Math.floor(seeded(`${seed}:avatar`) * avatarCatalogue.length) % avatarCatalogue.length];

    bots.push({
      id: `bot:${index}:${name}`,
      name,
      rating: Math.max(1, self.rating + offset),
      avatarId: avatar?.id ?? '',
      bot: true,
      you: false,
    });
  }

  const you: CupTeam = {
    id: YOU_ID,
    name: self.name,
    rating: self.rating,
    avatarId: self.avatarId,
    bot: false,
    you: true,
  };

  // Strongest first. The id tiebreak keeps the order stable, so the same draw does
  // not reshuffle itself between two reads of the same run.
  const teams = [you, ...real, ...bots]
    .slice(0, size)
    .sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    id,
    kind: input.kind,
    periodKey: input.periodKey,
    size,
    teams,
    rounds: emptyBoard(size),
    round: 0,
    status: 'running',
    claimed: [],
    startedAt: input.now.toISOString(),
  };
}

/** Resolves one tie with the quick simulation. */
function simulate(run: CupRun, round: number, index: number, tie: CupTie): CupTie {
  const home = run.teams[tie.a];
  const away = run.teams[tie.b];
  if (!home || !away) return tie;

  const result = playTie(`${run.id}:r${round}:t${index}`, home.rating, away.rating);
  return {
    ...tie,
    played: true,
    score: result.score,
    shootout: result.shootout,
    winner: result.homeWon ? tie.a : tie.b,
  };
}

/** Moves a round's winners into the round after it. */
function carryWinners(rounds: CupTie[][], round: number): CupTie[][] {
  const next = rounds[round + 1];
  if (!next) return rounds;

  const updated = next.map((tie) => ({ ...tie }));
  rounds[round]!.forEach((tie, index) => {
    if (tie.winner < 0) return;
    const { tie: target, side } = advanceSlot(index);
    const slot = updated[target];
    if (slot) slot[side] = tie.winner;
  });

  return rounds.map((ties, index) => (index === round + 1 ? updated : ties));
}

export interface PlayRoundInput {
  /**
   * The score the live match produced, **from the account's own point of view** —
   * goals for first, whichever side of the tie they were drawn on.
   *
   * Absent, the tie is decided by the quick simulation like every other one.
   */
  result?: {
    score: [number, number];
    shootout?: [number, number] | null;
    /** Who went through. Worked out from the score when the caller leaves it out. */
    youWon?: boolean;
  };
  now: Date;
}

export interface PlayRoundOutcome {
  run: CupRun;
  /** The account's own tie, as it finished. */
  tie: CupTie | null;
  /** True when the account went through. */
  through: boolean;
  /** Set once the run is over, ready for the history. */
  result: CupResult | null;
}

/**
 * Plays the current round: the account's own tie first, then every other tie in it,
 * then the winners move up.
 *
 * Once the account is out the rest of the bracket is played through to its final
 * anyway. Somebody wins this cup whether or not the player is still in it, and
 * "ตกรอบ" with no idea who lifted it is a worse ending than losing to the eventual
 * champion and being told so.
 */
export function playRound(run: CupRun, input: PlayRoundInput): PlayRoundOutcome {
  if (run.status !== 'running' || run.round >= run.rounds.length) {
    return { run, tie: null, through: false, result: null };
  }

  const round = run.round;
  const seat = yourSeat(run);
  const ties = run.rounds[round]!;
  const yourIndex = tieOf(ties, seat);

  const resolved = ties.map((tie, index) => {
    if (tie.played) return tie;

    if (index === yourIndex && input.result) {
      const atHome = isHome(tie, seat);
      const [mine, theirs] = input.result.score;
      let shootout = input.result.shootout ?? null;
      let youWon = input.result.youWon ?? (shootout ? shootout[0] > shootout[1] : undefined);

      if (youWon === undefined) {
        if (mine !== theirs) {
          youWon = mine > theirs;
        } else {
          // Level after 90 minutes. A knockout tie has to produce a winner, and it
          // produces it here by exactly the rule an unwatched tie uses — watching a
          // match must not change what kind of result it is allowed to have.
          const me = run.teams[seat];
          const them = run.teams[atHome ? tie.b : tie.a];
          const pens = shootoutFor(
            `${run.id}:r${round}:t${index}`,
            me?.rating ?? 0,
            them?.rating ?? 0,
          );
          shootout = pens.shootout;
          youWon = pens.homeWon;
        }
      }

      // The engine reports the score from the account's side; the tie stores it from
      // side `a`'s, so an away leg is written the other way round.
      return {
        ...tie,
        played: true,
        live: true,
        score: (atHome ? [mine, theirs] : [theirs, mine]) as [number, number],
        shootout: shootout
          ? ((atHome ? shootout : [shootout[1], shootout[0]]) as [number, number])
          : null,
        winner: youWon ? seat : atHome ? tie.b : tie.a,
      };
    }

    return simulate(run, round, index, tie);
  });

  let rounds = run.rounds.map((list, index) => (index === round ? resolved : list));
  rounds = carryWinners(rounds, round);

  const yourTie = yourIndex >= 0 ? (resolved[yourIndex] ?? null) : null;
  const through = yourTie ? yourTie.winner === seat : false;
  const last = round === run.rounds.length - 1;

  let status: CupRun['status'] = 'running';
  if (!through) status = 'out';
  else if (last) status = 'champion';

  // Out, or champion: play the rest of the board so the run has a winner either way.
  if (status !== 'running') {
    for (let next = round + 1; next < rounds.length; next += 1) {
      const played = rounds[next]!.map((tie, index) =>
        tie.played ? tie : simulate({ ...run, rounds }, next, index, tie),
      );
      rounds = rounds.map((list, index) => (index === next ? played : list));
      rounds = carryWinners(rounds, next);
    }
  }

  const after: CupRun = { ...run, rounds, round: round + 1, status };
  const won = roundsWon(after);

  return {
    run: after,
    tie: yourTie,
    through,
    result:
      status === 'running'
        ? null
        : {
            id: run.id,
            kind: run.kind,
            roundsWon: won,
            size: run.size,
            champion: status === 'champion',
            at: input.now.toISOString(),
          },
  };
}

/**
 * Reward lines the account has earned in this run and not yet been paid.
 *
 * Keyed by wins rather than by round index so an admin who changes the bracket size
 * cannot shift a reward onto a different round mid-run. `claimed` holds the same
 * `wins` numbers, which is what stops a reload from paying a round twice.
 */
export function unpaidRewards(run: CupRun, competition: CupCompetition): CupRoundReward[] {
  const won = roundsWon(run);
  return competition.rewards.filter((band) => band.wins <= won && !run.claimed.includes(band.wins));
}

/** The next reward still ahead in this run, for the "ชนะอีกนัดได้…" line. */
export function nextReward(run: CupRun, competition: CupCompetition): CupRoundReward | null {
  const won = roundsWon(run);
  return competition.rewards.find((band) => band.wins > won) ?? null;
}

export function withClaimed(run: CupRun, paid: readonly CupRoundReward[]): CupRun {
  if (paid.length === 0) return run;
  return { ...run, claimed: [...run.claimed, ...paid.map((band) => band.wins)] };
}

export function withHistory(state: CupState, result: CupResult): CupState {
  return {
    ...state,
    trophies: result.champion
      ? { ...state.trophies, [result.kind]: (state.trophies[result.kind] ?? 0) + 1 }
      : state.trophies,
    history: [result, ...state.history.filter((entry) => entry.id !== result.id)].slice(0, HISTORY_LIMIT),
  };
}

/** Cups won across both competitions — the number the trophy cabinet shows. */
export function totalTrophies(state: CupState): number {
  return (state.trophies.daily ?? 0) + (state.trophies.weekend ?? 0);
}

/** "2 วัน 04:11" down to zero. Never negative. */
export function countdown(target: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const days = Math.floor(seconds / 86_400);
  const clock = `${pad(Math.floor((seconds % 86_400) / 3_600))}:${pad(Math.floor((seconds % 3_600) / 60))}`;
  return days > 0 ? `${days} วัน ${clock}` : clock;
}

export { roundCount };
