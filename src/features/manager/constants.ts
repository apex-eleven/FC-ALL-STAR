import type { ManagerConfig, ManagerMilestone, ManagerTier } from './types';

export const MANAGER_CONFIG_KEY = 'football-home-ui:manager:v1';

export const MAX_TIERS = 16;
export const MAX_TIER_STARS = 5;
export const MAX_MILESTONES = 10;
export const MAX_MILESTONE_REWARDS = 4;
export const MAX_BANNERS = 4;
export const MAX_REWARD = 100_000_000;
export const HISTORY_LIMIT = 20;
export const NAME_MAX = 30;

/** Upload budgets — everything here shares the 1 MiB settings document. */
export const BACKGROUND_IMAGE = { maxWidth: 1600, maxHeight: 736, maxBytes: 150_000 };
export const FIGURE_IMAGE = { maxWidth: 640, maxHeight: 900, maxBytes: 110_000 };
export const TIER_IMAGE = { maxWidth: 300, maxHeight: 300, maxBytes: 28_000 };
export const BANNER_IMAGE = { maxWidth: 560, maxHeight: 150, maxBytes: 45_000 };
export const IMAGE_BUDGET_WARN = 450_000;

/** File fallbacks, dropped into public/brand without touching the admin panel. */
export const BACKGROUND_FILE = '/brand/manager_background.jpg';
export const FIGURE_FILE = '/brand/manager_figure.png';

/** Animated wait before a result, so a match feels like it was found. */
export const MATCHMAKING_MS = 1600;

/** Real seconds for a full match at 1x; the admin can set anything in this range. */
export const MATCH_SECONDS_MIN = 60;
export const MATCH_SECONDS_MAX = 600;
/** Engine step. Fixed, so a match plays the same however the frames fall. */
export const ENGINE_DT = 1 / 20;
export const SPEEDS = [1, 2, 4] as const;
/** A forfeit is recorded as this score. */
export const FORFEIT_SCORE: [number, number] = [0, 3];

export function managerId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

const TIER_NAMES: readonly [string, number][] = [
  ['มือใหม่', 3],
  ['สมัครเล่น III', 3],
  ['สมัครเล่น II', 3],
  ['สมัครเล่น I', 3],
  ['มืออาชีพ III', 3],
  ['มืออาชีพ II', 3],
  ['มืออาชีพ I', 3],
  ['ตำนาน IV', 3],
  ['ตำนาน III', 3],
  ['ตำนาน II', 3],
  ['ตำนาน I', 3],
];

export function defaultTiers(): ManagerTier[] {
  return TIER_NAMES.map(([name, stars], index) => ({
    id: `tier-${index}`,
    name,
    stars,
    // The first rung of each named group is safe ground.
    floor: index === 0 || index === 4 || index === 7,
    image: '',
  }));
}

export function defaultMilestones(): ManagerMilestone[] {
  return [
    { id: 'ms-1', wins: 1, rewards: [{ kind: 'fcpoint', amount: 50 }] },
    { id: 'ms-2', wins: 3, rewards: [{ kind: 'exchange', amount: 500 }] },
    { id: 'ms-3', wins: 5, rewards: [{ kind: 'gem', amount: 200 }] },
    { id: 'ms-4', wins: 8, rewards: [{ kind: 'ticket', amount: 20 }] },
    { id: 'ms-5', wins: 12, rewards: [{ kind: 'gem', amount: 500 }] },
  ];
}

export function defaultManager(): ManagerConfig {
  return {
    enabled: true,
    title: 'เมเนเจอร์โหมด',
    modeName: 'NUMERO',
    seasonDays: 14,
    seasonAnchor: '2026-09-01',
    seasonDrop: 2,
    resetHour: 6,
    tiers: defaultTiers(),
    milestones: defaultMilestones(),
    banners: [{ id: 'bn-1', title: 'รางวัลประจำสัปดาห์', tag: 'ใหม่', image: '' }],
    background: '',
    figure: '',
    headerCurrency: 'exchange',
    botSpread: 6,
    matchSeconds: 180,
  };
}
