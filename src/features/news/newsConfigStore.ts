import {
  HEADING_MAX_LENGTH,
  MAX_NEWS_SLIDES,
  NEWS_CONFIG_KEY,
  NEWS_CONFIG_KEY_V1,
} from './constants';
import type { CustomNewsSlide, NewsConfig, NewsOverrides, NewsSlideOverride } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function sanitize(value: unknown): NewsSlideOverride | null {
  if (typeof value !== 'object' || value === null) return null;

  const source = value as Record<string, unknown>;
  const override: NewsSlideOverride = {};

  if (typeof source.heading === 'string') {
    override.heading = source.heading.slice(0, HEADING_MAX_LENGTH);
  }
  // Only data URLs are accepted back. A stored http(s) URL would mean somebody
  // hand-edited the record, and rendering it would fetch an arbitrary remote image.
  if (typeof source.artwork === 'string' && source.artwork.startsWith('data:image/')) {
    override.artwork = source.artwork;
  }

  return Object.keys(override).length > 0 ? override : null;
}

function readOverrides(value: unknown): NewsOverrides {
  if (typeof value !== 'object' || value === null) return {};

  const overrides: NewsOverrides = {};
  for (const [id, entry] of Object.entries(value)) {
    const clean = sanitize(entry);
    if (clean) overrides[id] = clean;
  }
  return overrides;
}

/** An admin-added slide. Stored whole, so every field is repaired on the way in. */
function sanitizeCustom(value: unknown): CustomNewsSlide | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== 'string' || !source.id) return null;

  return {
    id: source.id,
    heading:
      typeof source.heading === 'string' ? source.heading.slice(0, HEADING_MAX_LENGTH) : 'แบนเนอร์ใหม่',
    // Same rule as the override: only data URLs come back, never a remote address
    // somebody hand-edited in.
    artwork:
      typeof source.artwork === 'string' && source.artwork.startsWith('data:image/')
        ? source.artwork
        : '',
    focus: typeof source.focus === 'string' ? source.focus : undefined,
    draftId: typeof source.draftId === 'string' ? source.draftId : undefined,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date(0).toISOString(),
  };
}

const EMPTY: NewsConfig = { overrides: {}, custom: [], removed: [] };

/**
 * Reads v2, falling back to the v1 override map.
 *
 * v1 is only read, never written: an older build left running in another tab keeps
 * working off its own key instead of finding a shape it cannot parse.
 */
export function loadConfig(): NewsConfig {
  try {
    const raw = window.localStorage.getItem(NEWS_CONFIG_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY };
      const source = parsed as Record<string, unknown>;

      return {
        overrides: readOverrides(source.overrides),
        custom: Array.isArray(source.custom)
          ? source.custom
              .map(sanitizeCustom)
              .filter((slide): slide is CustomNewsSlide => slide !== null)
              .slice(0, MAX_NEWS_SLIDES)
          : [],
        removed: Array.isArray(source.removed)
          ? source.removed.filter((id): id is string => typeof id === 'string')
          : [],
      };
    }

    const legacy = window.localStorage.getItem(NEWS_CONFIG_KEY_V1);
    if (!legacy) return { ...EMPTY };
    return { overrides: readOverrides(JSON.parse(legacy)), custom: [], removed: [] };
  } catch {
    return { ...EMPTY };
  }
}

export function saveConfig(config: NewsConfig): SaveResult {
  try {
    window.localStorage.setItem(NEWS_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    // Base64 images are the one thing here big enough to hit the quota, so this is
    // reported rather than swallowed — the admin needs to know the save did not land.
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
