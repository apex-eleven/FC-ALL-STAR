import { DEFAULT_LEAGUE, LEAGUE_CONFIG_KEY, MAX_TEAMS, MIN_TEAMS } from './constants';
import type { LeagueConfig, RankReward } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sanitizeRewards(value: unknown): RankReward[] {
  if (!Array.isArray(value)) return DEFAULT_LEAGUE.rewards.map((band) => ({ ...band }));

  const bands = value
    .flatMap((entry): RankReward[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const band = entry as Record<string, unknown>;
      return [
        {
          fromRank: clampInt(band.fromRank, 1, MAX_TEAMS, 1),
          ticket: clampInt(band.ticket, 0, 999, 0),
          gem: clampInt(band.gem, 0, 1_000_000, 0),
          fcpoint: clampInt(band.fcpoint, 0, 1_000_000, 0),
        },
      ];
    })
    .sort((a, b) => a.fromRank - b.fromRank);

  // An empty table would mean nobody is ever paid, which reads as a broken ladder
  // rather than as a deliberate setting.
  return bands.length > 0 ? bands : DEFAULT_LEAGUE.rewards.map((band) => ({ ...band }));
}

/** Repairs a config read from storage. Every number is clamped, never trusted. */
export function normalizeConfig(value: unknown): LeagueConfig {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_LEAGUE };
  const source = value as Record<string, unknown>;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_LEAGUE.enabled,
    teamCount: clampInt(source.teamCount, MIN_TEAMS, MAX_TEAMS, DEFAULT_LEAGUE.teamCount),
    // Floor of 5 minutes: anything shorter and a day's catch-up would resolve
    // hundreds of fixtures in one frame.
    matchIntervalMinutes: clampInt(source.matchIntervalMinutes, 5, 24 * 60, DEFAULT_LEAGUE.matchIntervalMinutes),
    resetHour: clampInt(source.resetHour, 0, 23, DEFAULT_LEAGUE.resetHour),
    winStars: clampInt(source.winStars, -10, 10, DEFAULT_LEAGUE.winStars),
    drawStars: clampInt(source.drawStars, -10, 10, DEFAULT_LEAGUE.drawStars),
    lossStars: clampInt(source.lossStars, -10, 10, DEFAULT_LEAGUE.lossStars),
    starFloor: clampInt(source.starFloor, -999, 0, DEFAULT_LEAGUE.starFloor),
    rivalMinRating: clampInt(source.rivalMinRating, 1, 199, DEFAULT_LEAGUE.rivalMinRating),
    rivalMaxRating: clampInt(source.rivalMaxRating, 1, 199, DEFAULT_LEAGUE.rivalMaxRating),
    rewards: sanitizeRewards(source.rewards),
  };
}

export function loadConfig(): LeagueConfig {
  try {
    const raw = window.localStorage.getItem(LEAGUE_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : { ...DEFAULT_LEAGUE };
  } catch {
    return { ...DEFAULT_LEAGUE };
  }
}

export function saveConfig(config: LeagueConfig): SaveResult {
  try {
    window.localStorage.setItem(LEAGUE_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
