import {
  DEFAULT_BANDS,
  DEFAULT_TRANSFER,
  DEFAULT_WATCH_LIMIT,
  MAX_BANDS,
  MAX_PRICE,
  MAX_WATCH_LIMIT,
  TRANSFER_CONFIG_KEY,
} from './constants';
import type { CardPrice, PriceBand, TransferConfig, TransferProgress } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function price(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return clampInt(value, 0, MAX_PRICE, 0);
}

/**
 * Bands, repaired and sorted.
 *
 * Duplicated starts collapse to the last one written, and a ladder that no longer
 * starts at 0 gets a 0 band put back in front — otherwise a card under the lowest
 * start would have no price at all, and "no price" is not something the market can
 * show.
 */
function sanitizeBands(value: unknown): PriceBand[] {
  if (!Array.isArray(value)) return DEFAULT_BANDS.map((band) => ({ ...band }));

  const byStart = new Map<number, PriceBand>();
  for (const entry of value.slice(0, MAX_BANDS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const source = entry as Record<string, unknown>;
    const minRating = clampInt(source.minRating, 0, 199, 0);
    byStart.set(minRating, {
      minRating,
      buy: clampInt(source.buy, 0, MAX_PRICE, 0),
      sell: clampInt(source.sell, 0, MAX_PRICE, 0),
    });
  }

  const bands = [...byStart.values()].sort((a, b) => a.minRating - b.minRating);
  if (bands.length === 0) return DEFAULT_BANDS.map((band) => ({ ...band }));
  if (bands[0]!.minRating !== 0) bands.unshift({ minRating: 0, buy: 0, sell: 0 });
  return bands;
}

function sanitizeOverrides(value: unknown): Record<string, CardPrice> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const result: Record<string, CardPrice> = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!id || typeof entry !== 'object' || entry === null) continue;
    const source = entry as Record<string, unknown>;
    const clean: CardPrice = {
      buy: price(source.buy),
      sell: price(source.sell),
      hidden: source.hidden === true,
    };
    // An override that overrides nothing is dropped, so the stored map only ever
    // holds cards an admin actually changed.
    if (clean.buy !== null || clean.sell !== null || clean.hidden) result[id] = clean;
  }
  return result;
}

export function normalizeConfig(value: unknown): TransferConfig {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_TRANSFER, bands: DEFAULT_BANDS.map((band) => ({ ...band })) };
  }

  const source = value as Record<string, unknown>;
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_TRANSFER.enabled,
    bands: sanitizeBands(source.bands),
    overrides: sanitizeOverrides(source.overrides),
    watchLimit: clampInt(source.watchLimit, 0, MAX_WATCH_LIMIT, DEFAULT_WATCH_LIMIT),
  };
}

export function loadConfig(): TransferConfig {
  try {
    const raw = window.localStorage.getItem(TRANSFER_CONFIG_KEY);
    return normalizeConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeConfig(null);
  }
}

export function saveConfig(config: TransferConfig): SaveResult {
  try {
    window.localStorage.setItem(TRANSFER_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

function ids(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ).slice(0, limit);
}

/**
 * Repairs the per-account half read from storage or Firestore.
 *
 * Locks are only meaningful for cards still owned, so the caller passes the owned ids
 * and a lock on a card that has since gone is dropped rather than kept forever.
 */
export function normalizeProgress(
  value: unknown,
  ownedIds?: ReadonlySet<string>,
): TransferProgress {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const locked = ids(source.locked, 5_000);
  return {
    watch: ids(source.watch, MAX_WATCH_LIMIT),
    locked: ownedIds ? locked.filter((id) => ownedIds.has(id)) : locked,
  };
}
