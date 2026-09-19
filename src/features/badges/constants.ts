import { STORAGE_PREFIX } from '@/features/backup/backup';
import type { BadgeConfig } from './types';

export const BADGE_CONFIG_KEY = `${STORAGE_PREFIX}badges:v1`;

export const MAX_BADGES = 60;
export const NAME_MAX = 30;
export const DESCRIPTION_MAX = 60;
/** A set is at most a full eleven. */
export const MAX_SET_CARDS = 11;
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
