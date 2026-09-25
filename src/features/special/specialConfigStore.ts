import { MAX_PLUS } from '@/features/rankup/constants';
import {
  MAX_OFFERS,
  MAX_PRICE,
  NAME_MAX,
  NOTE_MAX,
  REQUIRED_CARDS,
  SPECIAL_CONFIG_KEY,
  TITLE_MAX,
  defaultSpecial,
  specialId,
} from './constants';
import type { SpecialConfig, SpecialOffer, SpecialProgress } from './types';

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

/** Distinct, non-empty ids, at most REQUIRED_CARDS, in the order given. */
function requiredIds(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list(value)) {
    const id = text(entry, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= REQUIRED_CARDS) break;
  }
  return out;
}

export function normalizeConfig(value: unknown): SpecialConfig {
  if (value === null || value === undefined) return defaultSpecial();
  const source = record(value);
  const fallback = defaultSpecial();

  const seenIds = new Set<string>();
  const offers: SpecialOffer[] = [];
  for (const entry of list(source.offers).slice(0, MAX_OFFERS).map(record)) {
    let id = text(entry.id, 40);
    if (!id || seenIds.has(id)) id = specialId();
    seenIds.add(id);
    offers.push({
      id,
      enabled: bool(entry.enabled, true),
      name: text(entry.name, NAME_MAX),
      requiredIds: requiredIds(entry.requiredIds),
      cardId: text(entry.cardId, 80),
      plus: int(entry.plus, 0, MAX_PLUS, 0),
      price: int(entry.price, 0, MAX_PRICE, 0),
    });
  }

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, TITLE_MAX, fallback.title) || fallback.title,
    note: text(source.note, NOTE_MAX, fallback.note),
    offers,
  };
}

export function loadConfig(): SpecialConfig {
  try {
    const raw = window.localStorage.getItem(SPECIAL_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultSpecial();
  } catch {
    return defaultSpecial();
  }
}

export function saveConfig(config: SpecialConfig): SaveResult {
  try {
    window.localStorage.setItem(SPECIAL_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** Repairs the per-account purchase record read from storage or Firestore. */
export function normalizeProgress(value: unknown): SpecialProgress {
  const bought: SpecialProgress['bought'] = {};
  for (const [id, entry] of Object.entries(record(record(value).bought))) {
    if (!id) continue;
    bought[id.slice(0, 40)] = { at: text(record(entry).at, 40) };
  }
  return { bought };
}
