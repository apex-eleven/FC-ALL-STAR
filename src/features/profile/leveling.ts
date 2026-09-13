import { MAX_LEVEL } from './constants';

export const STARTING_LEVEL = 1;
export const STARTING_XP = 0;

/**
 * XP curve. Linear growth rounded to the nearest 50 so the numbers read like a
 * game rather than an equation. Tuned so level 1 needs 300 XP and level 57 needs
 * 6400 XP, matching the reference screenshot's progress readout.
 */
const BASE_XP = 300;
const XP_PER_LEVEL = 109;

export function requiredXPForLevel(level: number): number {
  const clamped = Math.min(Math.max(level, 1), MAX_LEVEL);
  const raw = BASE_XP + (clamped - 1) * XP_PER_LEVEL;
  return Math.round(raw / 50) * 50;
}

export interface LevelState {
  level: number;
  currentXP: number;
}

export interface XPAward extends LevelState {
  levelsGained: number;
}

/**
 * Adds XP and rolls over as many levels as the amount covers. At MAX_LEVEL the bar
 * pins full instead of overflowing.
 */
export function awardXP(state: LevelState, amount: number): XPAward {
  if (amount <= 0) return { ...state, levelsGained: 0 };

  let { level, currentXP } = state;
  currentXP += amount;
  let levelsGained = 0;

  while (level < MAX_LEVEL && currentXP >= requiredXPForLevel(level)) {
    currentXP -= requiredXPForLevel(level);
    level += 1;
    levelsGained += 1;
  }

  if (level >= MAX_LEVEL) {
    level = MAX_LEVEL;
    currentXP = Math.min(currentXP, requiredXPForLevel(MAX_LEVEL));
  }

  return { level, currentXP, levelsGained };
}
