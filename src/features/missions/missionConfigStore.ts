import { normalizeRewards } from '@/features/shop/shopConfigStore';
import {
  MAX_CHESTS,
  MAX_COUNT,
  MAX_MISSIONS,
  MAX_POINTS,
  MAX_TARGET,
  METRIC_IDS,
  MISSION_CONFIG_KEY,
  TITLE_MAX,
  defaultMissions,
  missionId,
} from './constants';
import {
  MISSION_PERIODS,
  type MissionChest,
  type MissionConfig,
  type MissionCounts,
  type MissionDef,
  type MissionMetric,
  type MissionPeriod,
  type MissionPeriodState,
  type MissionProgress,
} from './types';

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

function uniqueId(value: unknown, prefix: string, seen: Set<string>): string {
  let id = text(value, 40);
  if (!id || seen.has(id)) id = missionId(prefix);
  seen.add(id);
  return id;
}

function isMetric(value: unknown): value is MissionMetric {
  return METRIC_IDS.includes(value as MissionMetric);
}

function chests(value: unknown, prefix: string): MissionChest[] {
  const seen = new Set<string>();
  return list(value)
    .slice(0, MAX_CHESTS)
    .map(record)
    .map((entry) => ({
      id: uniqueId(entry.id, prefix, seen),
      points: int(entry.points, 1, MAX_POINTS, 20),
      rewards: normalizeRewards(entry.rewards),
    }))
    // The track reads left to right.
    .sort((a, b) => a.points - b.points);
}

export function normalizeConfig(value: unknown): MissionConfig {
  if (value === null || value === undefined) return defaultMissions();
  const source = record(value);
  const fallback = defaultMissions();

  const seen = new Set<string>();
  const missions: MissionDef[] = list(source.missions)
    .slice(0, MAX_MISSIONS)
    .map(record)
    .filter((entry) => isMetric(entry.metric))
    .map((entry) => ({
      id: uniqueId(entry.id, 'ms', seen),
      enabled: bool(entry.enabled, true),
      period: MISSION_PERIODS.includes(entry.period as MissionPeriod) ? (entry.period as MissionPeriod) : 'daily',
      metric: entry.metric as MissionMetric,
      target: int(entry.target, 1, MAX_TARGET, 1),
      points: int(entry.points, 0, MAX_POINTS, 0),
      rewards: normalizeRewards(entry.rewards),
      title: text(entry.title, TITLE_MAX),
    }));

  return {
    enabled: bool(source.enabled, fallback.enabled),
    resetHour: int(source.resetHour, 0, 23, fallback.resetHour),
    missions,
    dailyChests: chests(source.dailyChests, 'dc'),
    weeklyChests: chests(source.weeklyChests, 'wc'),
  };
}

export function loadConfig(): MissionConfig {
  try {
    const raw = window.localStorage.getItem(MISSION_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultMissions();
  } catch {
    return defaultMissions();
  }
}

export function saveConfig(config: MissionConfig): SaveResult {
  try {
    window.localStorage.setItem(MISSION_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

function ids(value: unknown): string[] {
  return list(value)
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.slice(0, 40))
    .slice(0, Math.max(MAX_MISSIONS, MAX_CHESTS));
}

function period(value: unknown): MissionPeriodState {
  const source = record(value);
  const counts: MissionCounts = {};
  for (const [key, count] of Object.entries(record(source.counts))) {
    if (isMetric(key)) counts[key] = int(count, 0, MAX_COUNT, 0);
  }
  return {
    key: text(source.key, 10),
    counts,
    claimed: ids(source.claimed),
    points: int(source.points, 0, MAX_POINTS * MAX_MISSIONS, 0),
    chests: ids(source.chests),
  };
}

/** Repairs the per-account progress read from storage or Firestore. */
export function normalizeProgress(value: unknown): MissionProgress {
  const source = record(value);
  return { daily: period(source.daily), weekly: period(source.weekly) };
}
