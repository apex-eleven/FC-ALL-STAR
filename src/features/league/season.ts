import { avatarCatalogue } from '@/data/mock/avatars';
import { RIVAL_NAMES } from './constants';
import { emptyRecord } from './types';
import type { LeagueConfig, LeagueRival, MatchOutcome, RivalFixture } from './types';

/**
 * Season boundaries, match slots, and the simulation itself — all pure.
 *
 * There is no server and no timer. A match does not "happen" at 14:00; it is
 * *derived* from the fact that 14:00 has passed. Open the app after eight hours away
 * and the eight fixtures you missed resolve at once, in order, exactly as they would
 * have if you had sat and watched. Anything else would punish closing the tab.
 */

/** YYYY-MM-DD of the 06:00 boundary the given moment belongs to. */
export function seasonIdAt(now: Date, resetHour: number): string {
  const start = seasonStart(now, resetHour);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

/** The most recent reset boundary at or before `now`, in local time. */
export function seasonStart(now: Date, resetHour: number): Date {
  const start = new Date(now);
  start.setHours(resetHour, 0, 0, 0);
  // Before today's boundary means the day still belongs to yesterday's season.
  if (start.getTime() > now.getTime()) start.setDate(start.getDate() - 1);
  return start;
}

export function nextReset(now: Date, resetHour: number): Date {
  const next = seasonStart(now, resetHour);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * How many match slots have fully elapsed since the season began.
 *
 * Slot 0 is the first fixture, played one interval after the reset — a season does
 * not open with a match already decided before the player has seen the table.
 */
export function slotsElapsed(now: Date, config: LeagueConfig): number {
  const start = seasonStart(now, config.resetHour).getTime();
  const minutes = (now.getTime() - start) / 60_000;
  return Math.max(0, Math.floor(minutes / config.matchIntervalMinutes));
}

export function slotTime(now: Date, config: LeagueConfig, slot: number): Date {
  const start = seasonStart(now, config.resetHour);
  return new Date(start.getTime() + (slot + 1) * config.matchIntervalMinutes * 60_000);
}

export function nextMatchAt(now: Date, config: LeagueConfig): Date {
  return slotTime(now, config, slotsElapsed(now, config));
}

/**
 * Deterministic 0..1 from a string.
 *
 * Seeded rather than random so the same account, season, and slot always produce the
 * same fixture. A player who reloads mid-day gets the day they already played, not a
 * re-roll — and a lost save rebuilds the identical league.
 */
export function seeded(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // FNV alone is uniform across millions of inputs but clumpy across a handful of
  // near-identical ones — and near-identical is exactly what this gets: the same
  // account and season with the slot number ticking up. Measured over the first 400
  // sequential seeds it produced 0.75% draws where 20% was expected. The avalanche
  // step below (murmur3's finalizer) spreads those neighbours apart; the same
  // measurement then lands at 19%.
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;

  // >>> 0 keeps it unsigned; the divisor is 2^32.
  return (hash >>> 0) / 4294967296;
}

/** The rivals for one season. Same inputs, same league. */
export function buildRivals(accountId: string, seasonId: string, config: LeagueConfig): LeagueRival[] {
  const count = Math.max(0, config.teamCount - 1);
  const span = Math.max(0, config.rivalMaxRating - config.rivalMinRating);

  return Array.from({ length: count }, (_, index) => {
    const seed = `${accountId}:${seasonId}:rival:${index}`;
    const nameRoll = seeded(`${seed}:name`);
    const ratingRoll = seeded(`${seed}:rating`);

    // Clubs in this game have no crests, so a rival is identified by its manager's
    // face — drawn from the same avatar catalogue the player picks from.
    const avatarRoll = seeded(`${seed}:avatar`);
    const avatar = avatarCatalogue[Math.floor(avatarRoll * avatarCatalogue.length) % avatarCatalogue.length];

    return {
      id: `rv-${index}`,
      // Offset by the roll so two accounts do not face the same list in the same order.
      name: RIVAL_NAMES[Math.floor(nameRoll * RIVAL_NAMES.length) % RIVAL_NAMES.length]!,
      rating: config.rivalMinRating + Math.round(ratingRoll * span),
      stars: 0,
      avatarId: avatar?.id ?? 'rookie',
      record: emptyRecord(),
    };
  });
}

/**
 * Resolves one fixture.
 *
 * Rating decides the odds, not the result: a 20-point gap is heavy odds, not a
 * guarantee, and an empty squad still gets to play rather than auto-losing. Draws
 * take the middle band, which is why the loss threshold is not simply 1 - winChance.
 */
export function playMatch(seed: string, rating: number, opponentRating: number): MatchOutcome {
  const gap = rating - opponentRating;
  // 0.5 at parity, saturating either side so no match is ever a certainty.
  const winChance = Math.min(0.85, Math.max(0.1, 0.5 + gap * 0.02));
  const drawChance = 0.2;

  const roll = seeded(seed);
  if (roll < winChance) return 'win';
  if (roll < winChance + drawChance) return 'draw';
  return 'loss';
}

/**
 * A scoreline that agrees with the result.
 *
 * The table shows goals for and against, so a result needs a score behind it — but
 * the score must never contradict the outcome the odds already decided. Winners get
 * 1-3, draws are level, and the loser's tally is derived from the winner's rather
 * than rolled separately.
 */
export function scoreFor(seed: string, outcome: MatchOutcome): [number, number] {
  const roll = seeded(`${seed}:score`);

  if (outcome === 'draw') {
    // 0-0, 1-1, 2-2 — weighted toward the low, dull ones, as draws are.
    const level = roll < 0.45 ? 0 : roll < 0.85 ? 1 : 2;
    return [level, level];
  }

  const winner = 1 + Math.floor(roll * 3);
  const loser = Math.max(0, winner - 1 - Math.floor(seeded(`${seed}:margin`) * 2));
  return outcome === 'win' ? [winner, loser] : [loser, winner];
}

/**
 * The day's fixture list for everyone who is not the player.
 *
 * The player's own opponent is excluded, and the rest are paired off in order from a
 * rotation that shifts each slot, so the board never shows a club playing itself and
 * rarely repeats the same pairing twice in a day.
 */
export function rivalFixtures(
  rivals: readonly LeagueRival[],
  slot: number,
  playerOpponentId: string,
): RivalFixture[] {
  const others = rivals.filter((rival) => rival.id !== playerOpponentId);
  const rotated = [...others.slice(slot % Math.max(1, others.length)), ...others.slice(0, slot % Math.max(1, others.length))];

  const fixtures: RivalFixture[] = [];
  for (let i = 0; i + 1 < rotated.length; i += 2) {
    fixtures.push({
      slot,
      at: '',
      homeId: rotated[i]!.id,
      awayId: rotated[i + 1]!.id,
      result: null,
    });
  }
  return fixtures;
}

export function starsFor(outcome: MatchOutcome, config: LeagueConfig): number {
  if (outcome === 'win') return config.winStars;
  if (outcome === 'draw') return config.drawStars;
  return config.lossStars;
}
