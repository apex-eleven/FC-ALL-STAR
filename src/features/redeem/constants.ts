import { STORAGE_PREFIX } from '@/features/backup/backup';
import type { RedeemConfig } from './types';

export const REDEEM_CONFIG_KEY = `${STORAGE_PREFIX}redeem:v1`;

export const MAX_CODES = 200;
export const CODE_MAX = 24;
export const NAME_MAX = 40;
export const NOTE_MAX = 160;
export const TITLE_MAX = 40;
/** Most uses one account may be given for a single code. */
export const MAX_PER_ACCOUNT = 99;
/** `eventId` on cards a code hands over — provenance only. */
export const REDEEM_EVENT_ID = 'redeem';

export function redeemId(prefix = 'rc'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

/**
 * A code as it is stored and matched: upper case, no spaces, and only the characters
 * that survive being read off a screen and typed back in.
 *
 * ASCII on purpose. A code is meant to be retyped from a poster or a chat message,
 * and a Thai keyboard layout makes that harder, not easier.
 */
export function normalizeCodeText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, CODE_MAX);
}

export function defaultRedeem(): RedeemConfig {
  return {
    enabled: true,
    title: 'แลกโค้ด',
    note: 'โค้ดจากกิจกรรม ไลฟ์สด หรือแอดมิน · พิมพ์โค้ดแล้วกดแลกรับ · 1 ไอดีแลกได้ 1 ครั้งต่อโค้ด',
    codes: [],
  };
}
