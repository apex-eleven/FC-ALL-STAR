import {
  BADGE_CONFIG_KEY,
  DESCRIPTION_MAX,
  MAX_BADGES,
  MAX_BONUS,
  MAX_NEED,
  MAX_SET_CARDS,
  NAME_MAX,
  badgeId,
  defaultBadges,
} from './constants';
import type { BadgeConfig, TeamBadge } from './types';

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

function cardIds(value: unknown): string[] {
  const seen = new Set<string>();
  return list(value)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => id.slice(0, 60))
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .slice(0, MAX_SET_CARDS);
}

export function normalizeConfig(value: unknown): BadgeConfig {
  if (value === null || value === undefined) return defaultBadges();
  const source = record(value);
  const fallback = defaultBadges();

  const seen = new Set<string>();
  const badges: TeamBadge[] = list(source.badges)
    .slice(0, MAX_BADGES)
    .map(record)
    .map((entry) => {
      let id = text(entry.id, 40);
      if (!id || seen.has(id)) id = badgeId();
      seen.add(id);
      return {
        id,
        enabled: bool(entry.enabled, true),
        name: text(entry.name, NAME_MAX),
        description: text(entry.description, DESCRIPTION_MAX),
        image: image(entry.image),
        cardIds: cardIds(entry.cardIds),
        need: int(entry.need, 0, MAX_NEED, 0),
        bonus: int(entry.bonus, 0, MAX_BONUS, 0),
      };
    });

  return { enabled: bool(source.enabled, fallback.enabled), badges };
}

export function loadConfig(): BadgeConfig {
  try {
    const raw = window.localStorage.getItem(BADGE_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultBadges();
  } catch {
    return defaultBadges();
  }
}

export function saveConfig(config: BadgeConfig): SaveResult {
  try {
    window.localStorage.setItem(BADGE_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
