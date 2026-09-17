import { CURRENCY_ORDER } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import { MAX_PLUS } from '@/features/rankup/constants';
import {
  DESCRIPTION_MAX,
  ITEMS_CONFIG_KEY,
  ITEM_TYPES,
  MAX_BOX_AMOUNT,
  MAX_ITEM_COUNT,
  MAX_ITEMS,
  MAX_OVR,
  NAME_MAX,
  defaultEffect,
  defaultItems,
  itemId,
} from './constants';
import type { Inventory, ItemDef, ItemEffect, ItemType, ItemsConfig } from './types';

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

function effect(value: unknown): ItemEffect | null {
  const source = record(value);
  const type = source.type as ItemType;
  if (!ITEM_TYPES.some((entry) => entry.type === type)) return null;
  const base = defaultEffect(type);
  switch (base.type) {
    case 'avatar':
      return { type: 'avatar', avatarId: text(source.avatarId, 60), avatarName: text(source.avatarName, NAME_MAX) };
    case 'pack': {
      const ovrMin = int(source.ovrMin, 1, MAX_OVR, base.ovrMin);
      const plusMin = int(source.plusMin, 0, MAX_PLUS, base.plusMin);
      return {
        type: 'pack',
        ovrMin,
        ovrMax: Math.max(ovrMin, int(source.ovrMax, 1, MAX_OVR, base.ovrMax)),
        plusMin,
        plusMax: Math.max(plusMin, int(source.plusMax, 0, MAX_PLUS, base.plusMax)),
      };
    }
    case 'plus':
      return { type: 'plus', plus: int(source.plus, 1, MAX_PLUS, base.plus) };
    case 'box': {
      const min = int(source.min, 0, MAX_BOX_AMOUNT, base.min);
      return {
        type: 'box',
        currency: CURRENCY_ORDER.includes(source.currency as CurrencyKind)
          ? (source.currency as CurrencyKind)
          : base.currency,
        min,
        max: Math.max(min, int(source.max, 0, MAX_BOX_AMOUNT, base.max)),
      };
    }
    case 'pick': {
      const ovrMin = int(source.ovrMin, 1, MAX_OVR, base.ovrMin);
      return { type: 'pick', ovrMin, ovrMax: Math.max(ovrMin, int(source.ovrMax, 1, MAX_OVR, base.ovrMax)) };
    }
    default:
      return base;
  }
}

export function normalizeConfig(value: unknown): ItemsConfig {
  if (value === null || value === undefined) return defaultItems();
  const seen = new Set<string>();
  const items: ItemDef[] = [];
  for (const entry of list(record(value).items).slice(0, MAX_ITEMS).map(record)) {
    const parsed = effect(entry.effect);
    if (!parsed) continue;
    let id = text(entry.id, 40);
    if (!id || seen.has(id)) id = itemId();
    seen.add(id);
    items.push({
      id,
      enabled: bool(entry.enabled, true),
      name: text(entry.name, NAME_MAX, 'ไอเท็ม') || 'ไอเท็ม',
      description: text(entry.description, DESCRIPTION_MAX),
      image: image(entry.image),
      effect: parsed,
    });
  }
  return { items };
}

export function loadConfig(): ItemsConfig {
  try {
    const raw = window.localStorage.getItem(ITEMS_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultItems();
  } catch {
    return defaultItems();
  }
}

export function saveConfig(config: ItemsConfig): SaveResult {
  try {
    window.localStorage.setItem(ITEMS_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** Repairs the per-account bag read from storage or Firestore. */
export function normalizeInventory(value: unknown): Inventory {
  const source = record(value);
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(record(source.counts)).slice(0, 500)) {
    const n = int(count, 0, MAX_ITEM_COUNT, 0);
    if (key && key.length <= 80 && n > 0) counts[key] = n;
  }
  return {
    counts,
    avatars: list(source.avatars)
      .filter((id): id is string => typeof id === 'string' && id.length <= 60)
      .slice(0, 200),
    shieldArmed: bool(source.shieldArmed, false),
  };
}

/** A stored display name, or undefined when there is none worth showing. */
export function normalizeDisplayName(value: unknown): string | undefined {
  const name = typeof value === 'string' ? value.trim().slice(0, 30) : '';
  return name ? name : undefined;
}
