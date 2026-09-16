import { CURRENCY_ORDER } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import { MATCH_OUTCOMES } from './outcomes';
import {
  HISTORY_LIMIT,
  MANAGER_CONFIG_KEY,
  MAX_BANNERS,
  MAX_MILESTONE_REWARDS,
  MAX_MILESTONES,
  MAX_REWARD,
  MAX_TIER_STARS,
  MAX_TIERS,
  NAME_MAX,
  defaultManager,
  managerId,
} from './constants';
import type {
  ManagerBanner,
  ManagerConfig,
  ManagerMatch,
  ManagerMilestone,
  ManagerOpponent,
  ManagerRewardLine,
  ManagerState,
  ManagerTier,
} from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

type Source = Record<string, unknown>;

function record(value: unknown): Source {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Source)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function text(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Only data URLs come back — a stored http(s) value would mean hand-edited storage. */
function image(value: unknown): string {
  return typeof value === 'string' && value.startsWith('data:image/') ? value : '';
}

function currency(value: unknown, fallback: CurrencyKind): CurrencyKind {
  return CURRENCY_ORDER.includes(value as CurrencyKind) ? (value as CurrencyKind) : fallback;
}

function uniqueId(value: unknown, prefix: string, seen: Set<string>): string {
  let id = text(value, 40);
  if (!id || seen.has(id)) id = managerId(prefix);
  seen.add(id);
  return id;
}

function rewards(value: unknown): ManagerRewardLine[] {
  return list(value)
    .map(record)
    .filter((entry) => CURRENCY_ORDER.includes(entry.kind as CurrencyKind))
    .map((entry) => ({
      kind: entry.kind as CurrencyKind,
      amount: int(entry.amount, 0, MAX_REWARD, 0),
    }))
    .filter((entry) => entry.amount > 0)
    .slice(0, MAX_MILESTONE_REWARDS);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function normalizeConfig(value: unknown): ManagerConfig {
  const source = record(value);
  const fallback = defaultManager();

  const tierIds = new Set<string>();
  const tiers: ManagerTier[] = list(source.tiers)
    .slice(0, MAX_TIERS)
    .map(record)
    .map((entry, index) => ({
      id: uniqueId(entry.id, 'tier', tierIds),
      name: text(entry.name, NAME_MAX, `แรงค์ ${index + 1}`) || `แรงค์ ${index + 1}`,
      stars: int(entry.stars, 1, MAX_TIER_STARS, 3),
      floor: bool(entry.floor, false),
      image: image(entry.image),
    }));

  const milestoneIds = new Set<string>();
  const milestones: ManagerMilestone[] = list(source.milestones)
    .slice(0, MAX_MILESTONES)
    .map(record)
    .map((entry) => ({
      id: uniqueId(entry.id, 'ms', milestoneIds),
      wins: int(entry.wins, 1, 999, 1),
      rewards: rewards(entry.rewards),
    }))
    // Ordered by the win they unlock at, so the track always reads left to right.
    .sort((a, b) => a.wins - b.wins);

  const bannerIds = new Set<string>();
  const banners: ManagerBanner[] = list(source.banners)
    .slice(0, MAX_BANNERS)
    .map(record)
    .map((entry) => ({
      id: uniqueId(entry.id, 'bn', bannerIds),
      title: text(entry.title, 60),
      tag: text(entry.tag, 12),
      image: image(entry.image),
    }));

  const anchor = text(source.seasonAnchor, 10);

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, NAME_MAX, fallback.title),
    modeName: text(source.modeName, 16, fallback.modeName),
    seasonDays: int(source.seasonDays, 1, 365, fallback.seasonDays),
    seasonAnchor: isDate(anchor) ? anchor : fallback.seasonAnchor,
    seasonDrop: int(source.seasonDrop, 0, MAX_TIERS, fallback.seasonDrop),
    resetHour: int(source.resetHour, 0, 23, fallback.resetHour),
    // A ladder needs at least one rung; an emptied list gets the default back.
    tiers: tiers.length > 0 ? tiers : fallback.tiers,
    milestones,
    banners,
    background: image(source.background),
    figure: image(source.figure),
    headerCurrency: currency(source.headerCurrency, fallback.headerCurrency),
    botSpread: int(source.botSpread, 0, 40, fallback.botSpread),
  };
}

export function loadConfig(): ManagerConfig {
  try {
    const raw = window.localStorage.getItem(MANAGER_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultManager();
  } catch {
    return defaultManager();
  }
}

export function saveConfig(config: ManagerConfig): SaveResult {
  try {
    window.localStorage.setItem(MANAGER_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

function opponent(value: unknown): ManagerOpponent {
  const source = record(value);
  return {
    id: text(source.id, 80, 'unknown'),
    name: text(source.name, 40, '-'),
    rating: int(source.rating, 0, 999, 0),
    avatarId: text(source.avatarId, 60),
    bot: bool(source.bot, true),
  };
}

function match(value: unknown): ManagerMatch | null {
  const source = record(value);
  const outcome = source.outcome;
  if (!MATCH_OUTCOMES.includes(outcome as ManagerMatch['outcome'])) return null;
  const score = list(source.score);
  return {
    id: text(source.id, 60, managerId('m')),
    at: text(source.at, 40),
    ranked: bool(source.ranked, false),
    opponent: opponent(source.opponent),
    rating: int(source.rating, 0, 999, 0),
    outcome: outcome as ManagerMatch['outcome'],
    score: [int(score[0], 0, 99, 0), int(score[1], 0, 99, 0)],
    tierBefore: int(source.tierBefore, 0, MAX_TIERS, 0),
    starsBefore: int(source.starsBefore, 0, MAX_TIER_STARS, 0),
    tierAfter: int(source.tierAfter, 0, MAX_TIERS, 0),
    starsAfter: int(source.starsAfter, 0, MAX_TIER_STARS, 0),
  };
}

/** Repairs the per-account ladder read from storage or Firestore. */
export function normalizeState(value: unknown): ManagerState {
  const source = record(value);
  return {
    season: int(source.season, -1, 1_000_000, -1),
    tier: int(source.tier, 0, MAX_TIERS - 1, 0),
    stars: int(source.stars, 0, MAX_TIER_STARS, 0),
    week: text(source.week, 10),
    weekWins: int(source.weekWins, 0, 100_000, 0),
    claimed: list(source.claimed)
      .filter((id): id is string => typeof id === 'string')
      .slice(0, MAX_MILESTONES),
    played: int(source.played, 0, 10_000_000, 0),
    history: list(source.history)
      .map(match)
      .filter((entry): entry is ManagerMatch => entry !== null)
      .slice(0, HISTORY_LIMIT),
  };
}
