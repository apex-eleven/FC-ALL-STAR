import { normalizeRewards } from '@/features/shop/shopConfigStore';
import {
  CODE_MAX,
  MAX_CODES,
  MAX_PER_ACCOUNT,
  NAME_MAX,
  NOTE_MAX,
  REDEEM_CONFIG_KEY,
  TITLE_MAX,
  defaultRedeem,
  normalizeCodeText,
  redeemId,
} from './constants';
import type { RedeemCode, RedeemConfig, RedeemProgress } from './types';

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

/** '' or a timestamp the browser could actually parse. Anything else is dropped. */
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  return Number.isNaN(Date.parse(value)) ? '' : value;
}

export function normalizeConfig(value: unknown): RedeemConfig {
  if (value === null || value === undefined) return defaultRedeem();
  const source = record(value);
  const fallback = defaultRedeem();

  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const codes: RedeemCode[] = [];

  for (const entry of list(source.codes).slice(0, MAX_CODES).map(record)) {
    const code = normalizeCodeText(text(entry.code, CODE_MAX));
    // A blank code could never be typed, and a duplicate would make the second copy
    // unreachable — the first match wins, so the rest are dropped rather than kept
    // as rows an admin can edit forever with no effect.
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);

    let id = text(entry.id, 40);
    if (!id || seenIds.has(id)) id = redeemId();
    seenIds.add(id);

    codes.push({
      id,
      code,
      enabled: bool(entry.enabled, true),
      name: text(entry.name, NAME_MAX),
      rewards: normalizeRewards(list(entry.rewards)),
      perAccount: int(entry.perAccount, 0, MAX_PER_ACCOUNT, 1),
      startAt: timestamp(entry.startAt),
      endAt: timestamp(entry.endAt),
    });
  }

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, TITLE_MAX, fallback.title) || fallback.title,
    note: text(source.note, NOTE_MAX, fallback.note),
    codes,
  };
}

export function loadConfig(): RedeemConfig {
  try {
    const raw = window.localStorage.getItem(REDEEM_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultRedeem();
  } catch {
    return defaultRedeem();
  }
}

export function saveConfig(config: RedeemConfig): SaveResult {
  try {
    window.localStorage.setItem(REDEEM_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** Repairs the per-account redeem history read from storage or Firestore. */
export function normalizeProgress(value: unknown): RedeemProgress {
  const source = record(value);
  const used: RedeemProgress['used'] = {};

  for (const [id, entry] of Object.entries(record(source.used))) {
    const use = record(entry);
    const count = int(use.count, 0, 1_000_000, 0);
    if (count <= 0) continue;
    used[id.slice(0, 40)] = { count, at: text(use.at, 40) };
  }

  return { used };
}
