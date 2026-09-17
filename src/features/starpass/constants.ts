import type { StarPassConfig, StarPassLevel, StarPassReward } from './types';

export const STARPASS_CONFIG_KEY = 'football-home-ui:starpass:v1';

export const MAX_LEVELS = 100;
export const MAX_XP = 1_000_000;
export const MAX_RATE = 10_000;
export const MAX_PRICE = 100_000_000;
export const TITLE_MAX = 30;
/** `eventId` on cards that came from the pass — provenance only. */
export const STARPASS_EVENT_ID = 'starpass';
/** Bounds a hand-edited XP total. */
export const MAX_TOTAL_XP = 1_000_000_000;

export function starpassId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function level(index: number): StarPassLevel {
  const n = index + 1;
  // Free: small change most levels, gems every fifth. Premium: more of each, with a
  // bigger drop every tenth level.
  const free: StarPassReward[] =
    n % 5 === 0 ? [{ kind: 'gem', amount: 50 }] : [{ kind: 'exchange', amount: 500 + index * 20 }];
  const premium: StarPassReward[] =
    n % 10 === 0
      ? [
          { kind: 'fcpoint', amount: 100 },
          { kind: 'ticket', amount: 5 },
        ]
      : n % 2 === 0
        ? [{ kind: 'gem', amount: 100 }]
        : [{ kind: 'ticket', amount: 1 }];
  return { id: `lv-${n}`, free, premium };
}

export function defaultStarPass(): StarPassConfig {
  return {
    enabled: true,
    title: 'STAR PASS',
    xpPerLevel: 100,
    missionRate: 100,
    matchWin: 30,
    matchDraw: 20,
    matchLoss: 10,
    priceGem: 1_000,
    priceFcpoint: null,
    levels: Array.from({ length: 30 }, (_, index) => level(index)),
  };
}
