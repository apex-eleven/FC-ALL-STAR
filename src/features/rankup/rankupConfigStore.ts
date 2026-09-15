import { CURRENCY_ORDER } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import {
  DEFAULT_RANKUP,
  DEFAULT_LEVELS,
  MAX_COST,
  MAX_MATERIALS,
  MAX_PLUS,
  RANKUP_CONFIG_KEY,
} from './constants';
import type { RankUpConfig, RankUpFailMode, RankUpLevel } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

const FAIL_MODES: readonly RankUpFailMode[] = ['keep', 'down', 'reset', 'destroy'];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ).slice(0, 200);
}

/**
 * One ladder row, repaired against its defaults.
 *
 * Every number is clamped rather than trusted. A hand-edited `chance: 400` would make
 * the probability bar meaningless, and a negative cost would pay the player to
 * gamble.
 */
function sanitizeLevel(value: unknown, level: number): RankUpLevel {
  const fallback = DEFAULT_LEVELS[level - 1] ?? DEFAULT_LEVELS[0]!;
  if (typeof value !== 'object' || value === null) {
    return { ...fallback, level, materialIds: [] };
  }

  const source = value as Record<string, unknown>;
  const currency = CURRENCY_ORDER.includes(source.currency as CurrencyKind)
    ? (source.currency as CurrencyKind)
    : fallback.currency;

  return {
    level,
    materials: clampInt(source.materials, 0, MAX_MATERIALS, fallback.materials),
    chance: clampInt(source.chance, 0, 100, fallback.chance),
    bonus: clampInt(source.bonus, 0, 99, fallback.bonus),
    cost: clampInt(source.cost, 0, MAX_COST, fallback.cost),
    currency,
    onFail: FAIL_MODES.includes(source.onFail as RankUpFailMode)
      ? (source.onFail as RankUpFailMode)
      : fallback.onFail,
    materialIds: sanitizeIds(source.materialIds),
  };
}

export function normalizeConfig(value: unknown): RankUpConfig {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_RANKUP, levels: DEFAULT_LEVELS.map((entry) => ({ ...entry })) };
  }

  const source = value as Record<string, unknown>;
  const stored = Array.isArray(source.levels) ? source.levels : [];

  // Rebuilt by index rather than filtered: the strip draws MAX_PLUS tiles and a
  // missing row would leave a level nobody could ever reach.
  const levels = Array.from({ length: MAX_PLUS }, (_, index) =>
    sanitizeLevel(stored[index], index + 1),
  );

  const background = source.background;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_RANKUP.enabled,
    materialIds: sanitizeIds(source.materialIds),
    // Only data URLs come back. A stored http(s) value would mean somebody edited
    // storage by hand, and rendering it would fetch an arbitrary remote image.
    background:
      typeof background === 'string' && background.startsWith('data:image/') ? background : '',
    refundOnFail:
      typeof source.refundOnFail === 'boolean' ? source.refundOnFail : DEFAULT_RANKUP.refundOnFail,
    levels,
  };
}

export function loadConfig(): RankUpConfig {
  try {
    const raw = window.localStorage.getItem(RANKUP_CONFIG_KEY);
    return normalizeConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeConfig(null);
  }
}

export function saveConfig(config: RankUpConfig): SaveResult {
  try {
    window.localStorage.setItem(RANKUP_CONFIG_KEY, JSON.stringify(config));
    cache = config;
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/**
 * Module-level cache behind `getConfig`.
 *
 * The rating helpers are pure functions called once per card per render — squad
 * rating alone touches every owned card — and each one needs the bonus table. Going
 * to localStorage and JSON.parse on every call would be a parse per card per frame,
 * so the config is read once and invalidated when it actually changes.
 */
let cache: RankUpConfig | null = null;

export function getConfig(): RankUpConfig {
  if (!cache) cache = loadConfig();
  return cache;
}

export function invalidateConfigCache() {
  cache = null;
}

// The cloud listener replaces storage underneath the running app; without this the
// bonus table would stay on whatever was loaded at boot.
if (typeof window !== 'undefined') {
  window.addEventListener(CONFIG_CHANGED_EVENT, invalidateConfigCache);
}
