import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { DEFAULT_WALKOUT, WALKOUT_CONFIG_KEY } from './constants';
import type { WalkoutConfig } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

/**
 * Repairs a config read from storage. Timings outside the clip's length would leave
 * a reveal that never fires, so each one is clamped rather than trusted.
 */
export function normalizeConfig(value: unknown): WalkoutConfig {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_WALKOUT };
  const source = value as Record<string, unknown>;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_WALKOUT.enabled,
    // A hand-edited list of nonsense tiers becomes an empty list, which reads as "no
    // tier condition" rather than as "nothing ever qualifies".
    sets: Array.isArray(source.sets)
      ? (source.sets.filter((set): set is PlayerSet =>
          PLAYER_SETS.includes(set as PlayerSet),
        ) as PlayerSet[])
      : [...DEFAULT_WALKOUT.sets],
    useMinRating:
      typeof source.useMinRating === 'boolean'
        ? source.useMinRating
        : DEFAULT_WALKOUT.useMinRating,
    minRating: Math.round(clamp(source.minRating, 1, 199, DEFAULT_WALKOUT.minRating)),
    nationAt: clamp(source.nationAt, 0, 7, DEFAULT_WALKOUT.nationAt),
    positionAt: clamp(source.positionAt, 0, 7, DEFAULT_WALKOUT.positionAt),
    clubAt: clamp(source.clubAt, 0, 7, DEFAULT_WALKOUT.clubAt),
    crossfade: clamp(source.crossfade, 0.05, 1, DEFAULT_WALKOUT.crossfade),
    flashOut: clamp(source.flashOut, 0, 3, DEFAULT_WALKOUT.flashOut),
    autoCloseSeconds: Math.round(clamp(source.autoCloseSeconds, 0, 120, DEFAULT_WALKOUT.autoCloseSeconds)),
  };
}

export function loadConfig(): WalkoutConfig {
  try {
    const raw = window.localStorage.getItem(WALKOUT_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : { ...DEFAULT_WALKOUT };
  } catch {
    return { ...DEFAULT_WALKOUT };
  }
}

export function saveConfig(config: WalkoutConfig): SaveResult {
  try {
    window.localStorage.setItem(WALKOUT_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
