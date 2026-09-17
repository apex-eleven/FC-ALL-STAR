import type { Account } from '@/features/auth/types';
import { weekKey } from '@/features/manager/manager';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { OwnedPlayer } from '@/features/club/types';
import { MAX_COUNT, MISSION_EVENT_ID, metricInfo } from './constants';
import type {
  MissionChest,
  MissionClaimError,
  MissionConfig,
  MissionDef,
  MissionMetric,
  MissionPeriod,
  MissionPeriodState,
  MissionProgress,
  MissionReward,
  MissionStatus,
} from './types';

/**
 * Pure mission rules. Nothing here touches React or storage — every function that
 * changes an account takes one and returns a new one.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The date a day belongs to, counting a day as starting at the reset hour. */
export function dayKey(now: Date, resetHour: number): string {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - resetHour);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

export function periodKey(period: MissionPeriod, now: Date, config: Pick<MissionConfig, 'resetHour'>): string {
  return period === 'daily' ? dayKey(now, config.resetHour) : weekKey(now, config.resetHour);
}

/** When the current period ends. */
export function periodEnd(period: MissionPeriod, now: Date, config: Pick<MissionConfig, 'resetHour'>): Date {
  const [year, month, day] = periodKey(period, now, config).split('-').map(Number);
  const start = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1, config.resetHour, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + (period === 'daily' ? 1 : 7));
  return end;
}

export function emptyPeriod(key: string): MissionPeriodState {
  return { key, counts: {}, claimed: [], points: 0, chests: [] };
}

/** Saved progress brought up to date with the clock: an old period starts fresh. */
export function currentProgress(
  saved: MissionProgress | undefined,
  now: Date,
  config: Pick<MissionConfig, 'resetHour'>,
): MissionProgress {
  const daily = periodKey('daily', now, config);
  const weekly = periodKey('weekly', now, config);
  return {
    daily: saved && saved.daily.key === daily ? saved.daily : emptyPeriod(daily),
    weekly: saved && saved.weekly.key === weekly ? saved.weekly : emptyPeriod(weekly),
  };
}

function bumped(state: MissionPeriodState, metric: MissionMetric, amount: number): MissionPeriodState {
  const count = Math.min(MAX_COUNT, (state.counts[metric] ?? 0) + amount);
  return { ...state, counts: { ...state.counts, [metric]: count } };
}

/**
 * Counts `amount` of `metric` toward both periods.
 *
 * `login` counts days: it only moves once per day, so the weekly count is the number
 * of days the player opened the game that week. Returns the same account when there
 * is nothing to count, so callers can hand the result straight back to updateAccount.
 */
export function recordMission(
  account: Account,
  metric: MissionMetric,
  amount: number,
  now: Date,
  config: Pick<MissionConfig, 'resetHour'>,
): Account {
  const step = Math.floor(amount);
  if (!Number.isFinite(step) || step <= 0) return account;

  const progress = currentProgress(account.missions, now, config);
  // Once a day: today's login is already counted.
  if (metric === 'login' && (progress.daily.counts.login ?? 0) > 0) return account;
  const add = metric === 'login' ? 1 : step;
  return {
    ...account,
    missions: {
      daily: bumped(progress.daily, metric, add),
      weekly: bumped(progress.weekly, metric, add),
    },
  };
}

export function missionTitle(mission: MissionDef): string {
  if (mission.title.trim()) return mission.title.trim();
  if (mission.metric === 'login' && mission.period === 'daily' && mission.target === 1) return 'เข้าเกมวันนี้';
  return metricInfo(mission.metric).template.replace('{n}', mission.target.toLocaleString('en-US'));
}

/** Enabled missions of one period, in admin order. */
export function missionsOf(config: MissionConfig, period: MissionPeriod): MissionDef[] {
  return config.missions.filter((mission) => mission.enabled && mission.period === period);
}

export function chestsOf(config: MissionConfig, period: MissionPeriod): MissionChest[] {
  return period === 'daily' ? config.dailyChests : config.weeklyChests;
}

/** Progress toward a mission, capped at its target. */
export function countOf(progress: MissionProgress, mission: MissionDef): number {
  return Math.min(mission.target, progress[mission.period].counts[mission.metric] ?? 0);
}

export function statusOf(progress: MissionProgress, mission: MissionDef): MissionStatus {
  const state = progress[mission.period];
  if (state.claimed.includes(mission.id)) return 'claimed';
  return (state.counts[mission.metric] ?? 0) >= mission.target ? 'ready' : 'progress';
}

export function chestStatus(progress: MissionProgress, period: MissionPeriod, chest: MissionChest): MissionStatus {
  const state = progress[period];
  if (state.chests.includes(chest.id)) return 'claimed';
  return state.points >= chest.points ? 'ready' : 'progress';
}

export interface MissionClaimOutcome {
  ok: boolean;
  error: MissionClaimError | null;
  account: Account;
  rewards: MissionReward[];
  cards: OwnedPlayer[];
}

function failed(account: Account, error: MissionClaimError): MissionClaimOutcome {
  return { ok: false, error, account, rewards: [], cards: [] };
}

/**
 * Claims one finished mission: pays its rewards, adds its points, marks it done —
 * one new account, so a claim can never pay twice or mark without paying.
 */
export function claimMission(
  account: Account,
  missionId: string,
  now: Date,
  config: MissionConfig,
  lookup: CardLookup,
  stamp: ShopStamp,
): MissionClaimOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const mission = config.missions.find((entry) => entry.id === missionId && entry.enabled);
  if (!mission) return failed(account, 'unknown');

  const progress = currentProgress(account.missions, now, config);
  const status = statusOf(progress, mission);
  if (status === 'claimed') return failed(account, 'claimed');
  if (status !== 'ready') return failed(account, 'not-ready');

  const paid = deliverRewards(account, mission.rewards, lookup, stamp, 'mission', MISSION_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error);

  const state = progress[mission.period];
  return {
    ok: true,
    error: null,
    rewards: mission.rewards,
    cards: paid.cards,
    account: {
      ...paid.account,
      missions: {
        ...progress,
        [mission.period]: {
          ...state,
          claimed: [...state.claimed, mission.id],
          points: state.points + mission.points,
        },
      },
    },
  };
}

/** Opens one chest on a period's point track. */
export function claimChest(
  account: Account,
  period: MissionPeriod,
  chestId: string,
  now: Date,
  config: MissionConfig,
  lookup: CardLookup,
  stamp: ShopStamp,
): MissionClaimOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const chest = chestsOf(config, period).find((entry) => entry.id === chestId);
  if (!chest) return failed(account, 'unknown');

  const progress = currentProgress(account.missions, now, config);
  const status = chestStatus(progress, period, chest);
  if (status === 'claimed') return failed(account, 'claimed');
  if (status !== 'ready') return failed(account, 'not-ready');

  const paid = deliverRewards(account, chest.rewards, lookup, stamp, 'mission', MISSION_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error);

  const state = progress[period];
  return {
    ok: true,
    error: null,
    rewards: chest.rewards,
    cards: paid.cards,
    account: {
      ...paid.account,
      missions: { ...progress, [period]: { ...state, chests: [...state.chests, chest.id] } },
    },
  };
}
