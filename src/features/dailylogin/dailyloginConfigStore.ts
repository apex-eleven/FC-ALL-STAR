import { normalizeRewards } from '@/features/shop/shopConfigStore';
import {
  CYCLE_DAYS,
  DAILY_LOGIN_CONFIG_KEY,
  MAX_STREAK,
  TITLE_MAX,
  defaultDailyLogin,
  defaultDays,
} from './constants';
import { LOGIN_CYCLES, type DailyLoginConfig, type DailyLoginProgress, type LoginCycle, type LoginDay } from './types';

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

function cycle(value: unknown): LoginCycle {
  return LOGIN_CYCLES.includes(value as LoginCycle) ? (value as LoginCycle) : 'week';
}

/**
 * Exactly one tile per day of the cycle, numbered 1..n in order.
 *
 * Tiles are matched by position, not by their stored `day`: a list saved as a week
 * and re-read as a month keeps its first seven tiles and fills the rest from the
 * defaults, so switching the cycle never throws away the rewards already set.
 */
export function daysFor(kind: LoginCycle, value: unknown): LoginDay[] {
  const wanted = CYCLE_DAYS[kind];
  const fallback = defaultDays(kind);
  const given = list(value).map(record);
  return Array.from({ length: wanted }, (_, index) => {
    const entry = given[index];
    const base = fallback[index]!;
    if (!entry) return base;
    return {
      day: index + 1,
      rewards: normalizeRewards(list(entry.rewards)),
      big: bool(entry.big, base.big),
    };
  });
}

export function normalizeConfig(value: unknown): DailyLoginConfig {
  if (value === null || value === undefined) return defaultDailyLogin();
  const source = record(value);
  const fallback = defaultDailyLogin();
  const kind = cycle(source.cycle);

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, TITLE_MAX, fallback.title) || fallback.title,
    cycle: kind,
    resetHour: int(source.resetHour, 0, 23, fallback.resetHour),
    autoOpen: bool(source.autoOpen, fallback.autoOpen),
    days: daysFor(kind, source.days),
  };
}

export function loadConfig(): DailyLoginConfig {
  try {
    const raw = window.localStorage.getItem(DAILY_LOGIN_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultDailyLogin();
  } catch {
    return defaultDailyLogin();
  }
}

export function saveConfig(config: DailyLoginConfig): SaveResult {
  try {
    window.localStorage.setItem(DAILY_LOGIN_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Repairs the per-account calendar state read from storage or Firestore. */
export function normalizeProgress(value: unknown): DailyLoginProgress {
  const source = record(value);
  const seen = new Set<string>();
  const claimedDays = list(source.claimedDays)
    .filter((day): day is string => typeof day === 'string' && DAY_KEY.test(day))
    .filter((day) => (seen.has(day) ? false : (seen.add(day), true)))
    .slice(-CYCLE_DAYS.month);
  const lastClaimDay = text(source.lastClaimDay, 10);
  return {
    cycleKey: text(source.cycleKey, 16),
    claimedDays,
    streak: int(source.streak, 0, MAX_STREAK, 0),
    lastClaimDay: DAY_KEY.test(lastClaimDay) ? lastClaimDay : (claimedDays[claimedDays.length - 1] ?? ''),
  };
}
