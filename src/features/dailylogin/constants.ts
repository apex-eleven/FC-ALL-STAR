import { STORAGE_PREFIX } from '@/features/backup/backup';
import type { ShopReward } from '@/features/shop/types';
import type { DailyLoginConfig, LoginCycle, LoginDay } from './types';

export const DAILY_LOGIN_CONFIG_KEY = `${STORAGE_PREFIX}daily-login:v1`;

export const TITLE_MAX = 40;
/** Tiles per cycle. A month calendar always shows 31 so its shape does not change. */
export const CYCLE_DAYS: Record<LoginCycle, number> = { week: 7, month: 31 };
/** Bounds a hand-edited streak. */
export const MAX_STREAK = 100_000;
/** `eventId` on cards handed out by the calendar — provenance only. */
export const LOGIN_EVENT_ID = 'login';

export const CYCLE_LABEL: Record<LoginCycle, string> = {
  week: '7 วัน (วนซ้ำ)',
  month: 'รายเดือน',
};

function day(index: number, rewards: ShopReward[], big = false): LoginDay {
  return { day: index, rewards, big };
}

/** A week's worth, building to a gem payout on day 7. */
export function defaultWeek(): LoginDay[] {
  return [
    day(1, [{ kind: 'exchange', amount: 1_000 }]),
    day(2, [{ kind: 'exchange', amount: 2_000 }]),
    day(3, [{ kind: 'ticket', amount: 1 }]),
    day(4, [{ kind: 'exchange', amount: 3_000 }]),
    day(5, [{ kind: 'gem', amount: 50 }]),
    day(6, [{ kind: 'ticket', amount: 2 }]),
    day(7, [{ kind: 'gem', amount: 200 }], true),
  ];
}

/** A month: the week pattern repeated, with a bigger prize every seventh day. */
export function defaultMonth(): LoginDay[] {
  const week = defaultWeek();
  return Array.from({ length: CYCLE_DAYS.month }, (_, index) => {
    const source = week[index % 7]!;
    return day(index + 1, source.rewards.map((reward) => ({ ...reward })), source.big);
  });
}

export function defaultDays(cycle: LoginCycle): LoginDay[] {
  return cycle === 'week' ? defaultWeek() : defaultMonth();
}

export function defaultDailyLogin(): DailyLoginConfig {
  return {
    enabled: true,
    title: 'เข้าเกมรายวัน',
    cycle: 'week',
    resetHour: 0,
    autoOpen: true,
    days: defaultWeek(),
  };
}
