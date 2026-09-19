import { ROUTE_IDS, type RouteId } from '@/features/navigation/routes';
import { normalizeRewards } from '@/features/shop/shopConfigStore';
import {
  BODY_MAX,
  INBOX_CONFIG_KEY,
  MAX_MAILS,
  MAX_PROGRESS_IDS,
  SCREEN_TITLE_MAX,
  SENDER_MAX,
  TITLE_MAX,
  TO_MAX,
  defaultInbox,
  inboxId,
} from './constants';
import type { InboxConfig, InboxMail, InboxProgress } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

type Source = Record<string, unknown>;

function record(value: unknown): Source {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Source)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** '' or a timestamp the browser could actually parse. Anything else is dropped. */
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  return Number.isNaN(Date.parse(value)) ? '' : value;
}

function route(value: unknown): RouteId | null {
  return ROUTE_IDS.includes(value as RouteId) ? (value as RouteId) : null;
}

export function normalizeConfig(value: unknown): InboxConfig {
  if (value === null || value === undefined) return defaultInbox();
  const source = record(value);
  const fallback = defaultInbox();

  const seen = new Set<string>();
  const mails: InboxMail[] = list(source.mails)
    .slice(0, MAX_MAILS)
    .map(record)
    .map((entry) => {
      let id = text(entry.id, 40);
      if (!id || seen.has(id)) id = inboxId();
      seen.add(id);
      return {
        id,
        enabled: bool(entry.enabled, true),
        to: text(entry.to, TO_MAX).trim(),
        title: text(entry.title, TITLE_MAX),
        body: text(entry.body, BODY_MAX),
        sender: text(entry.sender, SENDER_MAX),
        rewards: normalizeRewards(list(entry.rewards)),
        // A mail with no send time would sort nowhere; stamp it now so it still
        // shows up rather than vanishing.
        sentAt: timestamp(entry.sentAt) || new Date().toISOString(),
        expiresAt: timestamp(entry.expiresAt),
        route: route(entry.route),
      };
    });

  return {
    enabled: bool(source.enabled, fallback.enabled),
    title: text(source.title, SCREEN_TITLE_MAX, fallback.title) || fallback.title,
    mails,
  };
}

export function loadConfig(): InboxConfig {
  try {
    const raw = window.localStorage.getItem(INBOX_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultInbox();
  } catch {
    return defaultInbox();
  }
}

export function saveConfig(config: InboxConfig): SaveResult {
  try {
    window.localStorage.setItem(INBOX_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

function ids(value: unknown): string[] {
  return list(value)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => id.slice(0, 40))
    .slice(-MAX_PROGRESS_IDS);
}

/** Repairs the per-account inbox state read from storage or Firestore. */
export function normalizeProgress(value: unknown): InboxProgress {
  const source = record(value);
  const claimed: InboxProgress['claimed'] = {};
  for (const [id, at] of Object.entries(record(source.claimed)).slice(-MAX_PROGRESS_IDS)) {
    if (!id) continue;
    claimed[id.slice(0, 40)] = timestamp(at) || new Date(0).toISOString();
  }
  return { read: ids(source.read), claimed, deleted: ids(source.deleted) };
}
