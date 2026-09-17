import { ROUTE_IDS } from '@/features/navigation/routes';
import {
  ANNOUNCEMENT_KEY,
  ANNOUNCEMENT_SEEN_KEY,
  BODY_MAX,
  DEFAULT_ANNOUNCEMENT,
  LABEL_MAX,
  TITLE_MAX,
} from './constants';
import type { AnnouncementAction, AnnouncementConfig, AnnouncementTone } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

const TONES: readonly AnnouncementTone[] = ['info', 'event', 'warning'];

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // Kept as typed. This runs on every keystroke in the admin tab, so trimming here
  // would eat a space the moment it is typed; the overlay's layout hides any
  // trailing whitespace anyway. Inner newlines are kept for paragraphs.
  return value.slice(0, max);
}

/** '' or a timestamp the browser could actually parse. Anything else is dropped. */
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  return Number.isNaN(Date.parse(value)) ? '' : value;
}

export function normalizeAnnouncement(value: unknown): AnnouncementConfig {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_ANNOUNCEMENT };

  const source = value as Record<string, unknown>;
  const action = source.action;
  const image = source.image;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
    revision: typeof source.revision === 'string' ? source.revision.slice(0, 32) : '',
    title: text(source.title, TITLE_MAX),
    body: text(source.body, BODY_MAX),
    tone: TONES.includes(source.tone as AnnouncementTone)
      ? (source.tone as AnnouncementTone)
      : 'info',
    // Only data URLs survive. A stored http(s) value would mean storage was edited
    // by hand, and rendering it would pull an arbitrary remote image into the game.
    image: typeof image === 'string' && image.startsWith('data:image/') ? image : '',
    startAt: timestamp(source.startAt),
    endAt: timestamp(source.endAt),
    once: typeof source.once === 'boolean' ? source.once : true,
    action:
      action === 'none' || ROUTE_IDS.includes(action as never)
        ? (action as AnnouncementAction)
        : 'none',
    actionLabel: text(source.actionLabel, LABEL_MAX),
  };
}

export function loadAnnouncement(): AnnouncementConfig {
  try {
    const raw = window.localStorage.getItem(ANNOUNCEMENT_KEY);
    return normalizeAnnouncement(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_ANNOUNCEMENT };
  }
}

export function saveAnnouncement(config: AnnouncementConfig): SaveResult {
  try {
    window.localStorage.setItem(ANNOUNCEMENT_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/**
 * Is this notice showable right now, ignoring whether the player has closed it?
 *
 * An empty title and body counts as not live: an admin who ticked "enabled" before
 * writing anything should get a blank preview, not an empty box over the game.
 */
export function isLive(config: AnnouncementConfig, now: number = Date.now()): boolean {
  if (!config.enabled) return false;
  if (!config.title && !config.body) return false;
  if (config.startAt && now < Date.parse(config.startAt)) return false;
  if (config.endAt && now > Date.parse(config.endAt)) return false;
  return true;
}

export function readSeen(): string {
  try {
    return window.localStorage.getItem(ANNOUNCEMENT_SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markSeen(revision: string) {
  try {
    window.localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, revision);
  } catch {
    // Private-mode storage refusing a write. The notice reappears next visit, which
    // is a far smaller problem than a crash on close.
  }
}
