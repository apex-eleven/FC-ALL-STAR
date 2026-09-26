import { STORAGE_PREFIX } from '@/features/backup/backup';
import { STARTER_COUNT } from '@/features/squad/constants';
import type { BadgeConfig } from './types';

export const BADGE_CONFIG_KEY = `${STORAGE_PREFIX}badges:v1`;

export const MAX_BADGES = 60;
export const NAME_MAX = 30;
export const DESCRIPTION_MAX = 60;
/**
 * Players a set can list. More than an eleven, so a crest can name a whole squad —
 * any of them on the pitch counts toward it.
 */
export const MAX_SET_CARDS = 20;
/**
 * The most a crest can ask to be on the pitch at once: the starting eleven. A set of
 * 20 with "all of them" (need 0) asks for 11.
 */
export const MAX_NEED = STARTER_COUNT;
export const MAX_BONUS = 99;

/** Crest art is small — it sits in a 74x56 slot and a picker row. */
export const IMAGE_MAX_W = 240;
export const IMAGE_MAX_H = 240;
export const IMAGE_MAX_BYTES = 40_000;

export function badgeId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `bg-${random}`;
}

export function defaultBadges(): BadgeConfig {
  return { enabled: true, badges: [] };
}
