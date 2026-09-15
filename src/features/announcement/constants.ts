import { STORAGE_PREFIX } from '@/features/backup/backup';
import type { AnnouncementConfig, AnnouncementTone } from './types';

export const ANNOUNCEMENT_KEY = `${STORAGE_PREFIX}announcement:v1`;

/**
 * The revision this device has already closed.
 *
 * Per-device, not per-account, and never shared: it is listed in backup.ts's
 * PERSONAL_KEYS, or the admin's own "already seen" would ride the config snapshot
 * out to every player and the notice would never appear for anyone.
 */
export const ANNOUNCEMENT_SEEN_KEY = `${STORAGE_PREFIX}announcement-seen:v1`;

export const TITLE_MAX = 60;
export const BODY_MAX = 600;
export const LABEL_MAX = 24;

export const IMAGE_MAX_W = 900;
export const IMAGE_MAX_H = 420;
export const IMAGE_MAX_BYTES = 220_000;

export const TONE_LABEL: Record<AnnouncementTone, string> = {
  info: 'ทั่วไป',
  event: 'อีเวนต์',
  warning: 'เตือน',
};

export const DEFAULT_ANNOUNCEMENT: AnnouncementConfig = {
  enabled: false,
  revision: '',
  title: '',
  body: '',
  tone: 'info',
  image: '',
  startAt: '',
  endAt: '',
  once: true,
  action: 'none',
  actionLabel: '',
};

/** A fresh revision id. Short and sortable is enough — nothing parses it. */
export function newRevision(): string {
  return Date.now().toString(36);
}
