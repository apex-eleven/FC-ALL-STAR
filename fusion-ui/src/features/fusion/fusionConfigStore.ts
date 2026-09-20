import { normalizeRewards } from '@/features/shop/shopConfigStore';
import type { ShopReward } from '@/features/shop/types';
import {
  FUSION_CONFIG_KEY,
  HISTORY_LIMIT,
  MAX_CHANCE,
  MAX_DRAWS,
  MAX_ID_LIST,
  MAX_MATERIALS,
  MAX_PRIZES,
  MIN_DRAWS,
  MIN_MATERIALS,
  NAME_MAX,
  defaultFusion,
  fusionId,
} from './constants';
import {
  FUSION_RARITIES,
  type FusionConfig,
  type FusionOffer,
  type FusionPick,
  type FusionPrize,
  type FusionRarity,
  type FusionState,
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

/** A de-duplicated list of catalogue ids. */
function ids(value: unknown): string[] {
  const seen = new Set<string>();
  for (const entry of list(value).slice(0, MAX_ID_LIST)) {
    if (typeof entry !== 'string') continue;
    const id = entry.slice(0, 60);
    if (id) seen.add(id);
  }
  return [...seen];
}

function rarity(value: unknown): FusionRarity {
  return FUSION_RARITIES.includes(value as FusionRarity) ? (value as FusionRarity) : 'common';
}

/** A prize's reward, repaired with the shop's own rules. Null when it gives nothing. */
function reward(value: unknown): ShopReward | null {
  return normalizeRewards([value])[0] ?? null;
}

export function normalizeConfig(value: unknown): FusionConfig {
  if (value === null || value === undefined) return defaultFusion();
  const source = record(value);
  const fallback = defaultFusion();

  const seen = new Set<string>();
  const prizes: FusionPrize[] = [];
  for (const entry of list(source.prizes).slice(0, MAX_PRIZES).map(record)) {
    const line = reward(entry.reward);
    if (!line) continue;
    let id = text(entry.id, 40);
    if (!id || seen.has(id)) id = fusionId();
    seen.add(id);
    prizes.push({
      id,
      enabled: bool(entry.enabled, true),
      name: text(entry.name, NAME_MAX),
      reward: line,
      chance: int(entry.chance, 0, MAX_CHANCE, 0),
      rarity: rarity(entry.rarity),
      announce: bool(entry.announce, false),
      showcase: bool(entry.showcase, false),
    });
  }

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, NAME_MAX, fallback.title) || fallback.title,
    subtitle: text(source.subtitle, NAME_MAX, fallback.subtitle),
    icon: image(source.icon),
    materials: int(source.materials, MIN_MATERIALS, MAX_MATERIALS, fallback.materials),
    draws: int(source.draws, MIN_DRAWS, MAX_DRAWS, fallback.draws),
    materialIds: ids(source.materialIds),
    lockedIds: ids(source.lockedIds),
    prizes,
  };
}

export function loadConfig(): FusionConfig {
  try {
    const raw = window.localStorage.getItem(FUSION_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultFusion();
  } catch {
    return defaultFusion();
  }
}

export function saveConfig(config: FusionConfig): SaveResult {
  try {
    window.localStorage.setItem(FUSION_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** One face-down card, repaired. Null when the reward behind it no longer parses. */
function pick(value: unknown): FusionPick | null {
  const source = record(value);
  const line = reward(source.reward);
  if (!line) return null;
  return {
    prizeId: text(source.prizeId, 40),
    name: text(source.name, NAME_MAX),
    rarity: rarity(source.rarity),
    reward: line,
    announce: bool(source.announce, false),
  };
}

/**
 * A stored hand, repaired.
 *
 * A hand that comes back short is dropped rather than shown: the player paid for a
 * choice between `draws` cards, and quietly offering them three instead would be
 * worse than the screen saying there is nothing on the table.
 */
function offer(value: unknown): FusionOffer | null {
  if (value === null || value === undefined) return null;
  const source = record(value);
  const id = text(source.id, 60);
  if (!id) return null;

  const picks: FusionPick[] = [];
  for (const entry of list(source.picks).slice(0, MAX_DRAWS)) {
    const one = pick(entry);
    if (!one) return null;
    picks.push(one);
  }
  if (picks.length === 0) return null;

  return { id, at: text(source.at, 40), spent: ids(source.spent), picks };
}

/** Repairs the per-account bench state read from storage or Firestore. */
export function normalizeState(value: unknown): FusionState {
  const source = record(value);
  return {
    fusions: int(source.fusions, 0, 10_000_000, 0),
    pending: offer(source.pending),
    history: list(source.history)
      .map(record)
      .map((entry) => ({
        id: text(entry.id, 60),
        at: text(entry.at, 40),
        prizeId: text(entry.prizeId, 40),
        name: text(entry.name, NAME_MAX),
        rarity: rarity(entry.rarity),
      }))
      .filter((entry) => entry.id !== '')
      .slice(0, HISTORY_LIMIT),
  };
}
