import { MAX_PLUS } from './constants';
import { getConfig } from './rankupConfigStore';

/**
 * Rating helpers, deliberately split out from `rankup.ts`.
 *
 * `squad/rating.ts` and `club/club.ts` need the bonus and nothing else. Importing
 * the whole engine there would drag the wallet and the catalogue into the rating
 * path for the sake of one number.
 */

export function clampPlus(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PLUS, Math.round(value)));
}

/** What a card at this plus gains. +0 is always 0. */
export function plusBonus(plus: number): number {
  const level = clampPlus(plus);
  if (level === 0) return 0;
  return getConfig().levels[level - 1]?.bonus ?? 0;
}

/** Base rating plus the upgrade bonus. Used everywhere a card's real rating matters. */
export function ratingWithPlus(card: { rating: number; plus?: number }): number {
  return card.rating + plusBonus(card.plus ?? 0);
}
