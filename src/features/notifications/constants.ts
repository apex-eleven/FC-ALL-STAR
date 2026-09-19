import { USERNAME_MAX_LENGTH } from '@/features/auth/constants';
import { STORAGE_PREFIX } from '@/features/backup/backup';
import type { InboxConfig } from './types';

export const INBOX_CONFIG_KEY = `${STORAGE_PREFIX}inbox:v1`;

export const MAX_MAILS = 300;
export const TITLE_MAX = 60;
export const SENDER_MAX = 40;
export const BODY_MAX = 800;
export const SCREEN_TITLE_MAX = 40;
/** A recipient is a login ID, so it is bounded the same way. */
export const TO_MAX = USERNAME_MAX_LENGTH;
/** Most ids one account's read/claimed/deleted lists keep. Oldest are dropped. */
export const MAX_PROGRESS_IDS = 1_000;
/** `eventId` on cards that arrived by mail — provenance only. */
export const INBOX_EVENT_ID = 'inbox';

export function inboxId(prefix = 'ml'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function defaultInbox(): InboxConfig {
  return {
    enabled: true,
    title: 'กล่องจดหมาย',
    mails: [],
  };
}
