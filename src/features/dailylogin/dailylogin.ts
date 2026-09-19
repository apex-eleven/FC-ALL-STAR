import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { dayKey } from '@/features/missions/missions';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { LOGIN_EVENT_ID, MAX_STREAK } from './constants';
import type {
  DailyLoginConfig,
  DailyLoginProgress,
  LoginClaimError,
  LoginDay,
  LoginTileStatus,
} from './types';

/**
 * Pure calendar rules. Nothing here touches React or storage — every function that
 * changes an account takes one and returns a new one.
 */

export function emptyProgress(cycleKey: string): DailyLoginProgress {
  return { cycleKey, claimedDays: [], streak: 0, lastClaimDay: '' };
}

/** Today's key, counting a day as starting at the reset hour. */
export function todayKey(now: Date, config: Pick<DailyLoginConfig, 'resetHour'>): string {
  return dayKey(now, config.resetHour);
}

/** The key of the day before `key`. */
function previousDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year ?? 2026, (month ?? 1) - 1, (day ?? 1) - 1, 12);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The run of the calendar that today belongs to.
 *
 * A month is the calendar month. A week is seven claims long: it keeps its key
 * until the seventh tile is taken, and starts a new run on the first claim after
 * that — a player who takes tile 7 today still sees the full calendar until
 * tomorrow.
 */
export function cycleKeyFor(
  config: Pick<DailyLoginConfig, 'cycle' | 'days'>,
  saved: DailyLoginProgress | undefined,
  today: string,
): string {
  if (config.cycle === 'month') return `m:${today.slice(0, 7)}`;
  if (!saved || !saved.cycleKey.startsWith('w:')) return `w:${today}`;
  const complete = saved.claimedDays.length >= config.days.length;
  if (complete && !saved.claimedDays.includes(today)) return `w:${today}`;
  return saved.cycleKey;
}

/** Saved progress brought up to date with the clock: another run starts fresh. */
export function currentProgress(
  saved: DailyLoginProgress | undefined,
  config: Pick<DailyLoginConfig, 'cycle' | 'days'>,
  today: string,
): DailyLoginProgress {
  const key = cycleKeyFor(config, saved, today);
  if (saved && saved.cycleKey === key) return saved;
  if (!saved) return emptyProgress(key);
  return {
    ...emptyProgress(key),
    // A claim made today under the old run (an admin switched week to month at
    // noon) still counts as today's: the new run opens with tile 1 taken rather
    // than paying the same day twice.
    claimedDays: saved.lastClaimDay === today ? [today] : [],
    // The streak survives a new run — it counts days, not tiles.
    streak: saved.streak,
    lastClaimDay: saved.lastClaimDay,
  };
}

export function claimedToday(progress: DailyLoginProgress, today: string): boolean {
  return progress.claimedDays.includes(today);
}

/** The tile today's claim lands on (1-based), or the tile already taken today. */
export function todayTile(progress: DailyLoginProgress, today: string): number {
  return claimedToday(progress, today) ? progress.claimedDays.length : progress.claimedDays.length + 1;
}

export function tileStatus(progress: DailyLoginProgress, today: string, day: LoginDay): LoginTileStatus {
  if (day.day <= progress.claimedDays.length) return 'claimed';
  if (day.day === todayTile(progress, today) && !claimedToday(progress, today)) return 'today';
  return 'upcoming';
}

/** The streak a claim today would leave: one more, or back to one after a gap. */
export function streakAfter(progress: DailyLoginProgress, today: string): number {
  if (progress.lastClaimDay === previousDay(today)) return Math.min(MAX_STREAK, progress.streak + 1);
  return 1;
}

/** Whether today's tile is there for the taking. */
export function canClaim(config: DailyLoginConfig, progress: DailyLoginProgress, today: string): boolean {
  if (!config.enabled) return false;
  if (claimedToday(progress, today)) return false;
  return todayTile(progress, today) <= config.days.length;
}

export interface LoginClaimOutcome {
  ok: boolean;
  error: LoginClaimError | null;
  account: Account;
  /** The tile that was taken. 0 on failure. */
  day: number;
  rewards: ShopReward[];
  cards: OwnedPlayer[];
}

function failed(account: Account, error: LoginClaimError): LoginClaimOutcome {
  return { ok: false, error, account, day: 0, rewards: [], cards: [] };
}

/**
 * Takes today's tile: pays its rewards and files the day — one new account, so a
 * day can never be marked without paying, or pay twice.
 *
 * The all-or-nothing rules come from `deliverRewards`: a wallet at its cap, a full
 * club or a card the admin has since deleted refuses the claim, and the day stays
 * open so the player can try again once there is room.
 */
export function claimToday(
  account: Account,
  config: DailyLoginConfig,
  now: Date,
  lookup: CardLookup,
  stamp: ShopStamp,
): LoginClaimOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const today = todayKey(now, config);
  const progress = currentProgress(account.login, config, today);
  if (claimedToday(progress, today)) return failed(account, 'claimed');

  const tile = todayTile(progress, today);
  const day = config.days[tile - 1];
  if (!day) return failed(account, 'complete');

  const paid = deliverRewards(account, day.rewards, lookup, stamp, 'login', LOGIN_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error);

  return {
    ok: true,
    error: null,
    day: tile,
    rewards: [...day.rewards],
    cards: paid.cards,
    account: {
      ...paid.account,
      login: {
        cycleKey: progress.cycleKey,
        claimedDays: [...progress.claimedDays, today],
        streak: streakAfter(progress, today),
        lastClaimDay: today,
      },
    },
  };
}
