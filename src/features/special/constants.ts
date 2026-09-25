import { STORAGE_PREFIX } from '@/features/backup/backup';
import type { SpecialConfig } from './types';

/** Under the shared prefix, so backups, admin.json and the cloud config carry it. */
export const SPECIAL_CONFIG_KEY = `${STORAGE_PREFIX}special:v1`;

/** Cards a player must own to unlock an offer. */
export const REQUIRED_CARDS = 11;
export const MAX_OFFERS = 50;
export const MAX_PRICE = 1_000_000;
export const NAME_MAX = 40;
export const TITLE_MAX = 40;
export const NOTE_MAX = 200;
/** `eventId` on the special cards handed over — provenance only. */
export const SPECIAL_EVENT_ID = 'special';

export function specialId(prefix = 'sp'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function defaultSpecial(): SpecialConfig {
  return {
    enabled: true,
    title: 'การ์ดพิเศษ',
    note: 'มีการ์ดครบ 11 ใบที่กำหนดในคลับ เพื่อปลดล็อกการซื้อการ์ดพิเศษด้วย Special Point · การ์ด 11 ใบไม่ถูกใช้ไป · 1 ไอดีซื้อได้ 1 ครั้งต่อรายการ',
    offers: [],
  };
}
