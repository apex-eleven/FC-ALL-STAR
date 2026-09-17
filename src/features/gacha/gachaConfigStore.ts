import { normalizeRewards } from '@/features/shop/shopConfigStore';
import type { ShopReward } from '@/features/shop/types';
import {
  GACHA_CONFIG_KEY,
  HISTORY_LIMIT,
  MAX_CHANCE,
  MAX_KEY_COST,
  MAX_PRIZES,
  NAME_MAX,
  defaultGacha,
  gachaId,
} from './constants';
import { GACHA_RARITIES, type GachaConfig, type GachaPrize, type GachaRarity, type GachaState } from './types';

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

/** A prize's reward, repaired with the shop's own rules. Null when it gives nothing. */
function reward(value: unknown): ShopReward | null {
  return normalizeRewards([value])[0] ?? null;
}

export function normalizeConfig(value: unknown): GachaConfig {
  if (value === null || value === undefined) return defaultGacha();
  const source = record(value);
  const fallback = defaultGacha();

  const seen = new Set<string>();
  const prizes: GachaPrize[] = [];
  for (const entry of list(source.prizes).slice(0, MAX_PRIZES).map(record)) {
    const line = reward(entry.reward);
    if (!line) continue;
    let id = text(entry.id, 40);
    if (!id || seen.has(id)) id = gachaId();
    seen.add(id);
    prizes.push({
      id,
      enabled: bool(entry.enabled, true),
      name: text(entry.name, NAME_MAX),
      reward: line,
      chance: int(entry.chance, 0, MAX_CHANCE, 0),
      rarity: GACHA_RARITIES.includes(entry.rarity as GachaRarity)
        ? (entry.rarity as GachaRarity)
        : 'common',
      announce: bool(entry.announce, false),
    });
  }

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, NAME_MAX, fallback.title) || fallback.title,
    caseName: text(source.caseName, NAME_MAX, fallback.caseName),
    subtitle: text(source.subtitle, NAME_MAX, fallback.subtitle),
    keyCost: int(source.keyCost, 0, MAX_KEY_COST, fallback.keyCost),
    caseImage: image(source.caseImage),
    prizes,
  };
}

export function loadConfig(): GachaConfig {
  try {
    const raw = window.localStorage.getItem(GACHA_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultGacha();
  } catch {
    return defaultGacha();
  }
}

export function saveConfig(config: GachaConfig): SaveResult {
  try {
    window.localStorage.setItem(GACHA_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** Repairs the per-account spin history read from storage or Firestore. */
export function normalizeState(value: unknown): GachaState {
  const source = record(value);
  return {
    spins: int(source.spins, 0, 10_000_000, 0),
    history: list(source.history)
      .map(record)
      .map((entry) => ({
        id: text(entry.id, 60),
        at: text(entry.at, 40),
        prizeId: text(entry.prizeId, 40),
        name: text(entry.name, NAME_MAX),
        rarity: GACHA_RARITIES.includes(entry.rarity as GachaRarity)
          ? (entry.rarity as GachaRarity)
          : 'common',
      }))
      .filter((entry) => entry.id !== '')
      .slice(0, HISTORY_LIMIT),
  };
}
