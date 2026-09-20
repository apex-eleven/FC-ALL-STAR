import { MAX_PLUS } from '@/features/rankup/constants';
import type { ShopReward } from '@/features/shop/types';
import {
  CUP_CONFIG_KEY,
  CUP_SIZES,
  MAX_ENTRIES,
  MAX_ROUND_GAP,
  MAX_ROUND_REWARDS,
  MIN_ROUND_GAP,
  NAME_MAX,
  defaultCup,
} from './constants';
import type { CupCompetition, CupConfig, CupRoundReward, CupState, CupKind } from './types';

/**
 * The only file in this folder that touches localStorage, and the only one that
 * trusts nothing. Everything read back — from storage, from a cloud snapshot, from a
 * hand-edited save — goes through a normalizer before any rule sees it.
 */

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function text(value: unknown, max: number, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function dataUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('data:') ? value : '';
}

/** Rewards use the shop's shape, so the same three kinds are accepted here. */
function sanitizeRewardLine(value: unknown): ShopReward | null {
  if (typeof value !== 'object' || value === null) return null;
  const line = value as Record<string, unknown>;
  const amount = clampInt(line.amount, 1, 1_000_000, 1);

  if (line.kind === 'card') {
    const cardId = text(line.cardId, 64, '');
    if (!cardId) return null;
    return { kind: 'card', cardId, amount: Math.min(amount, 10), plus: clampInt(line.plus, 0, MAX_PLUS, 0) };
  }

  if (line.kind === 'item') {
    const itemId = text(line.itemId, 64, '');
    if (!itemId) return null;
    return { kind: 'item', itemId, amount: Math.min(amount, 99) };
  }

  const kinds = ['exchange', 'gem', 'fcpoint', 'ticket', 'special', 'key'] as const;
  const kind = kinds.find((entry) => entry === line.kind);
  return kind ? { kind, amount } : null;
}

function sanitizeRewards(value: unknown, fallback: CupRoundReward[]): CupRoundReward[] {
  if (!Array.isArray(value)) return fallback.map((band) => ({ ...band, rewards: [...band.rewards] }));

  const bands = value
    .flatMap((entry): CupRoundReward[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const band = entry as Record<string, unknown>;
      const rewards = Array.isArray(band.rewards)
        ? band.rewards.map(sanitizeRewardLine).filter((line): line is ShopReward => line !== null)
        : [];
      return [{ wins: clampInt(band.wins, 1, 8, 1), rewards }];
    })
    .slice(0, MAX_ROUND_REWARDS)
    .sort((a, b) => a.wins - b.wins);

  // One band per win count: two bands on the same number would both be unpaid after
  // the same win, and `claimed` records the number, so the second could never be paid.
  const seen = new Set<number>();
  return bands.filter((band) => {
    if (seen.has(band.wins)) return false;
    seen.add(band.wins);
    return true;
  });
}

function sanitizeDays(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const days = value
    .filter((day): day is number => typeof day === 'number' && Number.isFinite(day))
    .map((day) => Math.max(0, Math.min(6, Math.round(day))));
  return [...new Set(days)].sort((a, b) => a - b);
}

function sanitizeCompetition(value: unknown, fallback: CupCompetition): CupCompetition {
  if (typeof value !== 'object' || value === null) return { ...fallback, rewards: sanitizeRewards(null, fallback.rewards) };
  const source = value as Record<string, unknown>;

  const size = CUP_SIZES.includes(source.size as (typeof CUP_SIZES)[number])
    ? (source.size as number)
    : fallback.size;

  const currencies = ['ticket', 'gem', 'fcpoint', 'exchange'] as const;
  const entryCurrency =
    currencies.find((entry) => entry === source.entryCurrency) ?? fallback.entryCurrency;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    name: text(source.name, NAME_MAX, fallback.name) || fallback.name,
    size,
    entryCost: clampInt(source.entryCost, 0, 1_000_000, fallback.entryCost),
    entryCurrency,
    entries: clampInt(source.entries, 1, MAX_ENTRIES, fallback.entries),
    days: sanitizeDays(source.days, fallback.days),
    botSpread: clampInt(source.botSpread, 0, 60, fallback.botSpread),
    roundGapMinutes: clampInt(
      source.roundGapMinutes,
      MIN_ROUND_GAP,
      MAX_ROUND_GAP,
      fallback.roundGapMinutes,
    ),
    rewards: sanitizeRewards(source.rewards, fallback.rewards),
    background: dataUrl(source.background),
    trophy: dataUrl(source.trophy),
  };
}

export function normalizeConfig(value: unknown): CupConfig {
  const base = defaultCup();
  if (typeof value !== 'object' || value === null) return base;
  const source = value as Record<string, unknown>;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : base.enabled,
    resetHour: clampInt(source.resetHour, 0, 23, base.resetHour),
    // Floor of 30s: below that the engine's fixed step runs a whole half in a
    // handful of frames and the match is over before anything reads as football.
    matchSeconds: clampInt(source.matchSeconds, 30, 900, base.matchSeconds),
    daily: sanitizeCompetition(source.daily, base.daily),
    weekend: sanitizeCompetition(source.weekend, base.weekend),
  };
}

export function loadConfig(): CupConfig {
  try {
    const raw = window.localStorage.getItem(CUP_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultCup();
  } catch {
    return defaultCup();
  }
}

export function saveConfig(config: CupConfig): SaveResult {
  try {
    window.localStorage.setItem(CUP_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/**
 * Repairs the per-account half, read back from a save that may predate the cup or
 * have been edited by hand.
 *
 * A run whose shape disagrees with itself — seats pointing outside the team list, a
 * board with the wrong number of rounds — is dropped rather than patched. A patched
 * bracket is a bracket nobody drew, and the entry it cost is already spent either
 * way; losing it is better than playing a run that cannot resolve.
 */
export function normalizeProgress(value: unknown): CupState {
  const fallback: CupState = {
    periodKey: { daily: '', weekend: '' },
    used: { daily: 0, weekend: 0 },
    runs: { daily: null, weekend: null },
    trophies: { daily: 0, weekend: 0 },
    history: [],
  };
  if (typeof value !== 'object' || value === null) return fallback;
  const source = value as Record<string, unknown>;

  const readKind = <T>(field: unknown, pick: (raw: unknown) => T): Record<CupKind, T> => {
    const record = typeof field === 'object' && field !== null ? (field as Record<string, unknown>) : {};
    return { daily: pick(record.daily), weekend: pick(record.weekend) };
  };

  return {
    periodKey: readKind(source.periodKey, (raw) => text(raw, 20, '')),
    used: readKind(source.used, (raw) => clampInt(raw, 0, MAX_ENTRIES, 0)),
    runs: readKind(source.runs, (raw) => normalizeRun(raw)),
    trophies: readKind(source.trophies, (raw) => clampInt(raw, 0, 100_000, 0)),
    history: Array.isArray(source.history)
      ? source.history
          .flatMap((entry) => {
            if (typeof entry !== 'object' || entry === null) return [];
            const row = entry as Record<string, unknown>;
            const kind = row.kind === 'weekend' ? 'weekend' : 'daily';
            return [
              {
                id: text(row.id, 64, ''),
                kind: kind as CupKind,
                roundsWon: clampInt(row.roundsWon, 0, 8, 0),
                size: clampInt(row.size, 2, 64, 8),
                champion: row.champion === true,
                at: text(row.at, 40, ''),
              },
            ];
          })
          .filter((row) => row.id !== '')
          .slice(0, 30)
      : [],
  };
}

function normalizeRun(value: unknown): CupState['runs'][CupKind] {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;

  const size = clampInt(source.size, 2, 64, 0);
  if (!CUP_SIZES.includes(size as (typeof CUP_SIZES)[number])) return null;
  if (!Array.isArray(source.teams) || source.teams.length !== size) return null;
  if (!Array.isArray(source.rounds)) return null;

  const teams = source.teams.map((entry) => {
    const team = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    return {
      id: text(team.id, 64, ''),
      name: text(team.name, NAME_MAX, 'ทีม'),
      rating: clampInt(team.rating, 0, 9999, 0),
      avatarId: text(team.avatarId, 40, ''),
      bot: team.bot === true,
      you: team.you === true,
    };
  });
  // Exactly one seat is the account's, or the run cannot be played or scored.
  if (teams.filter((team) => team.you).length !== 1) return null;

  const rounds = source.rounds.map((list) =>
    Array.isArray(list)
      ? list.map((entry) => {
          const tie = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
          const seat = (raw: unknown) => {
            const index = clampInt(raw, -1, size - 1, -1);
            return index;
          };
          const score = Array.isArray(tie.score) ? tie.score : [0, 0];
          const shootout = Array.isArray(tie.shootout) ? tie.shootout : null;
          return {
            a: seat(tie.a),
            b: seat(tie.b),
            played: tie.played === true,
            score: [clampInt(score[0], 0, 99, 0), clampInt(score[1], 0, 99, 0)] as [number, number],
            shootout: shootout
              ? ([clampInt(shootout[0], 0, 99, 0), clampInt(shootout[1], 0, 99, 0)] as [number, number])
              : null,
            winner: seat(tie.winner),
            live: tie.live === true,
          };
        })
      : [],
  );

  const expected = Math.round(Math.log2(size));
  if (rounds.length !== expected) return null;

  const status = source.status === 'champion' ? 'champion' : source.status === 'out' ? 'out' : 'running';

  return {
    id: text(source.id, 64, ''),
    kind: source.kind === 'weekend' ? 'weekend' : 'daily',
    periodKey: text(source.periodKey, 20, ''),
    size,
    teams,
    rounds,
    round: clampInt(source.round, 0, expected, 0),
    // A run saved before kickoff times existed gets none, and `kickoffAt` treats a
    // missing time as "playable now" — an old run must not be stranded mid-bracket.
    kickoffs: Array.isArray(source.kickoffs)
      ? source.kickoffs.slice(0, expected).map((entry) => text(entry, 40, ''))
      : [],
    status,
    claimed: Array.isArray(source.claimed)
      ? [...new Set(source.claimed.map((entry) => clampInt(entry, 1, 8, 1)))]
      : [],
    startedAt: text(source.startedAt, 40, ''),
  };
}
