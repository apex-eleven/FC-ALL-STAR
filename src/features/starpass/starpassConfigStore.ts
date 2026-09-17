import { normalizeRewards } from '@/features/shop/shopConfigStore';
import {
  MAX_LEVELS,
  MAX_PRICE,
  MAX_RATE,
  MAX_TOTAL_XP,
  MAX_XP,
  STARPASS_CONFIG_KEY,
  TITLE_MAX,
  defaultStarPass,
  starpassId,
} from './constants';
import type { StarPassConfig, StarPassLevel, StarPassProgress } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

type Source = Record<string, unknown>;

function record(value: unknown): Source {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Source) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function price(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_PRICE, Math.round(value));
}

function text(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeConfig(value: unknown): StarPassConfig {
  if (value === null || value === undefined) return defaultStarPass();
  const source = record(value);
  const fallback = defaultStarPass();

  const seen = new Set<string>();
  const levels: StarPassLevel[] = list(source.levels)
    .slice(0, MAX_LEVELS)
    .map(record)
    .map((entry) => {
      let id = text(entry.id, 40);
      if (!id || seen.has(id)) id = starpassId('lv');
      seen.add(id);
      return { id, free: normalizeRewards(entry.free), premium: normalizeRewards(entry.premium) };
    });

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, TITLE_MAX, fallback.title),
    xpPerLevel: int(source.xpPerLevel, 1, MAX_XP, fallback.xpPerLevel),
    missionRate: int(source.missionRate, 0, MAX_RATE, fallback.missionRate),
    matchWin: int(source.matchWin, 0, MAX_XP, fallback.matchWin),
    matchDraw: int(source.matchDraw, 0, MAX_XP, fallback.matchDraw),
    matchLoss: int(source.matchLoss, 0, MAX_XP, fallback.matchLoss),
    priceGem: 'priceGem' in source ? price(source.priceGem) : fallback.priceGem,
    priceFcpoint: 'priceFcpoint' in source ? price(source.priceFcpoint) : fallback.priceFcpoint,
    levels,
  };
}

export function loadConfig(): StarPassConfig {
  try {
    const raw = window.localStorage.getItem(STARPASS_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultStarPass();
  } catch {
    return defaultStarPass();
  }
}

export function saveConfig(config: StarPassConfig): SaveResult {
  try {
    window.localStorage.setItem(STARPASS_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

function ids(value: unknown): string[] {
  return list(value)
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.slice(0, 40))
    .slice(0, MAX_LEVELS);
}

/** Repairs the per-account pass read from storage or Firestore. */
export function normalizeProgress(value: unknown): StarPassProgress {
  const source = record(value);
  return {
    season: int(source.season, -1, 1_000_000, -1),
    xp: int(source.xp, 0, MAX_TOTAL_XP, 0),
    premium: bool(source.premium, false),
    claimedFree: ids(source.claimedFree),
    claimedPremium: ids(source.claimedPremium),
  };
}
