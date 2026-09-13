import { PLAYER_SETS } from './types';
import type {
  DraftCounters,
  DraftEvent,
  DraftPlayer,
  PityRule,
  PlayerSet,
  SetOdds,
} from './types';

/** Injectable so tests are deterministic. Returns [0, 1). */
export type Rng = () => number;

export interface PullOutcome {
  player: DraftPlayer;
  set: PlayerSet;
  /** The pity rule that forced this result, if any. */
  pityRule: PityRule | null;
  counters: DraftCounters;
}

export interface PullResult {
  ok: boolean;
  error: 'empty-pool' | null;
  outcomes: PullOutcome[];
  counters: DraftCounters;
}

/** A is the best tier, D the worst. Lower index means better. */
const RANK: Record<PlayerSet, number> = { A: 0, B: 1, C: 2, D: 3 };

export function isAtLeast(candidate: PlayerSet, required: PlayerSet): boolean {
  return RANK[candidate] <= RANK[required];
}

export function startingCounters(pity: readonly PityRule[]): DraftCounters {
  return Object.fromEntries(pity.map((rule) => [rule.id, 0]));
}

/**
 * Repairs counters read from storage: unknown rule ids are dropped, missing ones
 * start at zero, and a counter past its threshold is clamped so a hand-edited record
 * cannot hold a guarantee hostage.
 */
export function normalizeCounters(
  value: unknown,
  pity: readonly PityRule[],
): DraftCounters {
  const source = (value ?? {}) as Record<string, unknown>;
  const counters: DraftCounters = {};

  for (const rule of pity) {
    const raw = source[rule.id];
    const count = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
    counters[rule.id] = Math.max(0, Math.min(rule.threshold, count));
  }

  return counters;
}

/** Pulls remaining before a rule pays out. Never negative. */
export function remaining(rule: PityRule, counters: DraftCounters): number {
  return Math.max(0, rule.threshold - (counters[rule.id] ?? 0));
}

function weightedSet(odds: SetOdds, available: Set<PlayerSet>, rng: Rng): PlayerSet {
  const candidates = PLAYER_SETS.filter((set) => available.has(set));
  const total = candidates.reduce((sum, set) => sum + Math.max(0, odds[set] ?? 0), 0);

  // Odds that are all zero, or that only name sets with nobody in them, would make
  // the roll undefined. Fall back to a flat pick over whoever is actually there.
  if (total <= 0) return candidates[Math.floor(rng() * candidates.length)] ?? 'D';

  let roll = rng() * total;
  for (const set of candidates) {
    roll -= Math.max(0, odds[set] ?? 0);
    if (roll < 0) return set;
  }
  return candidates[candidates.length - 1] ?? 'D';
}

function pickFrom(pool: readonly DraftPlayer[], set: PlayerSet, rng: Rng): DraftPlayer | null {
  const members = pool.filter((player) => player.set === set);
  if (members.length === 0) return null;
  return members[Math.floor(rng() * members.length)] ?? null;
}

/**
 * Draws one player.
 *
 * Order matters: pity is checked before the random roll, best tier first, so a pull
 * that would have triggered both the A and B guarantees pays the A one. Landing a
 * set also satisfies every guarantee for a worse tier, so those counters reset too —
 * otherwise a lucky A pull would still leave the player owed a B.
 */
export function pullOnce(
  event: Pick<DraftEvent, 'pool' | 'odds' | 'pity'>,
  counters: DraftCounters,
  rng: Rng,
): PullOutcome | null {
  if (event.pool.length === 0) return null;

  const available = new Set(event.pool.map((player) => player.set));
  const next: DraftCounters = { ...counters };

  // Every rule advances on every pull; the ones that pay out are reset below.
  for (const rule of event.pity) {
    next[rule.id] = (next[rule.id] ?? 0) + 1;
  }

  const byBestFirst = [...event.pity].sort((a, b) => RANK[a.set] - RANK[b.set]);
  const triggered =
    byBestFirst.find(
      (rule) => (next[rule.id] ?? 0) >= rule.threshold && available.has(rule.set),
    ) ?? null;

  const set = triggered ? triggered.set : weightedSet(event.odds, available, rng);
  const player = pickFrom(event.pool, set, rng) ?? event.pool[Math.floor(rng() * event.pool.length)];
  if (!player) return null;

  for (const rule of event.pity) {
    if (isAtLeast(player.set, rule.set)) next[rule.id] = 0;
  }

  return { player, set: player.set, pityRule: triggered, counters: next };
}

/** Draws `count` players, carrying counters between them. */
export function pull(
  event: Pick<DraftEvent, 'pool' | 'odds' | 'pity'>,
  counters: DraftCounters,
  count: number,
  rng: Rng = Math.random,
): PullResult {
  if (event.pool.length === 0) {
    return { ok: false, error: 'empty-pool', outcomes: [], counters };
  }

  const outcomes: PullOutcome[] = [];
  let running = counters;

  for (let i = 0; i < count; i += 1) {
    const outcome = pullOnce(event, running, rng);
    if (!outcome) break;
    outcomes.push(outcome);
    running = outcome.counters;
  }

  return { ok: outcomes.length > 0, error: null, outcomes, counters: running };
}

/** The players the showcase puts on the banner: highest rated in the pool. */
export function showcasePlayers(pool: readonly DraftPlayer[], count: number): DraftPlayer[] {
  return [...pool].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)).slice(0, count);
}
