import type { RankUpConfig, RankUpLevel } from './types';

export const RANKUP_CONFIG_KEY = 'football-home-ui:rankup:v1';

/** Highest plus a card can reach. The bottom strip draws one tile per step. */
export const MAX_PLUS = 10;

/**
 * The gold tier. From here up the +N badge is drawn in metallic gold everywhere it
 * appears (see `goldPlusProps` and the `[data-plus-gold]` rule in globals.css).
 */
export const GOLD_PLUS_FROM = 9;

export function isGoldPlus(plus: number): boolean {
  return plus >= GOLD_PLUS_FROM;
}

/**
 * Spread onto any element that draws a +N badge. One attribute, one global rule, so
 * every screen that shows a plus turns gold at +9 without each one restyling itself.
 */
export function goldPlusProps(plus: number): { 'data-plus-gold'?: '' } {
  return isGoldPlus(plus) ? { 'data-plus-gold': '' } : {};
}

/**
 * The same, for a card's name: a +9/+10 card's name is written in gold wherever a
 * name is printed beside the card (`[data-name-gold]` in globals.css).
 */
export function goldNameProps(plus: number | undefined): { 'data-name-gold'?: '' } {
  return isGoldPlus(plus ?? 0) ? { 'data-name-gold': '' } : {};
}

/** Guard rails for the admin inputs. Hand-edited storage is clamped to these too. */
export const MAX_MATERIALS = 8;
export const MAX_COST = 100_000_000;

/** How large an uploaded backdrop may be, before and after re-encoding. */
export const BACKGROUND_MAX_W = 1600;
export const BACKGROUND_MAX_H = 760;
export const BACKGROUND_MAX_BYTES = 260_000;

/**
 * The shipped ladder.
 *
 * Chance falls faster than cost rises, which is what stops +8 from being a matter of
 * grinding currency. The first three levels keep the card on a failure so a new
 * player can learn the screen without losing anything; from +4 a failure costs a
 * level, which is where the decision to stop becomes a real one.
 *
 * Bonus is what the card is worth *at* that plus, not what the step adds.
 */
const LADDER: readonly [number, number, number, number][] = [
  // level, materials, chance %, rating bonus
  [1, 1, 90, 1],
  [2, 1, 80, 2],
  [3, 2, 68, 4],
  [4, 2, 54, 6],
  [5, 3, 42, 9],
  [6, 3, 30, 12],
  [7, 4, 20, 16],
  [8, 4, 12, 21],
  // The gold tier: five materials each and single-figure chances, so +10 is rare.
  [9, 5, 8, 27],
  [10, 5, 5, 34],
];

/** Costs climb about half again per step, rounded to something readable. */
const COSTS = [2_000, 4_000, 8_000, 15_000, 28_000, 50_000, 90_000, 160_000, 280_000, 500_000];

export const DEFAULT_LEVELS: readonly RankUpLevel[] = LADDER.map(
  ([level, materials, chance, bonus]): RankUpLevel => ({
    level,
    materials,
    chance,
    bonus,
    cost: COSTS[level - 1] ?? 2_000,
    currency: 'exchange',
    // Forgiving up to +3, then a real gamble. Nothing here ever destroys a card by
    // default — that has to be switched on deliberately.
    onFail: level <= 3 ? 'keep' : 'down',
    materialIds: [],
  }),
);

export const DEFAULT_RANKUP: RankUpConfig = {
  enabled: true,
  materialIds: [],
  background: '',
  refundOnFail: false,
  levels: DEFAULT_LEVELS.map((level) => ({ ...level, materialIds: [] })),
};

/**
 * Tile colours for the +1..+10 strip, matching the reference art's progression. +9
 * and +10 are the gold tier; where a badge is drawn they also get the metallic gold
 * treatment, and these tones are what glows and pips use.
 */
export const PLUS_TONES: readonly string[] = [
  '#ff7a1a',
  '#c9d2e0',
  '#4aa3ff',
  '#a463ff',
  '#ffc21a',
  '#ff4d6d',
  '#27e0d0',
  '#ff5ce0',
  '#f2c230',
  '#ffdf6e',
];

export function plusTone(plus: number): string {
  return PLUS_TONES[Math.max(1, Math.min(MAX_PLUS, plus)) - 1] ?? PLUS_TONES[0]!;
}
