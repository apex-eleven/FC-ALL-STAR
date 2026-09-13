import { CURRENCY_ORDER } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import {
  DEFAULT_SHOWCASE,
  DRAFT_CONFIG_KEY,
  DRAFT_CONFIG_KEY_V1,
  MAX_CUSTOM_EVENTS,
  MAX_SHOWCASE_SLOTS,
  SHOWCASE_CARD_MAX_W,
  SHOWCASE_CARD_MIN_W,
  MAX_PACKS_PER_EVENT,
  NAME_MAX_LENGTH,
  PACK_BADGE_MAX,
  PACK_COST_MAX,
  PACK_LABEL_MAX,
  PACK_LIMIT_MAX,
  PACK_PULLS_MAX,
  TITLE_MAX_LENGTH,
} from './constants';
import { PLAYER_SETS } from './types';
import type {
  CustomDraftEvent,
  DraftConfig,
  DraftEventOverride,
  DraftOverrides,
  DraftPack,
  DraftPlayer,
  PityRule,
  SetOdds,
  ShowcaseSlot,
} from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function sanitizeOdds(value: unknown): SetOdds | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const source = value as Record<string, unknown>;
  const odds = {} as SetOdds;

  for (const set of PLAYER_SETS) {
    const raw = source[set];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
    odds[set] = Math.max(0, Math.min(1000, raw));
  }

  return odds;
}

function sanitizePlayer(value: unknown): DraftPlayer | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;

  if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
  if (typeof p.rating !== 'number' || !Number.isFinite(p.rating)) return null;
  if (typeof p.set !== 'string' || !PLAYER_SETS.includes(p.set as DraftPlayer['set'])) return null;

  return {
    id: p.id,
    name: p.name.slice(0, 40),
    rating: clampInt(p.rating, 1, 199, 1),
    position: typeof p.position === 'string' ? p.position.slice(0, 4) : 'CM',
    set: p.set as DraftPlayer['set'],
    portrait: typeof p.portrait === 'string' ? p.portrait : '',
    nation: typeof p.nation === 'string' ? p.nation.slice(0, 3) : '',
    club: typeof p.club === 'string' ? p.club.slice(0, 30) : 'สโมสรอิสระ',
  };
}

/**
 * A store button read back from storage.
 *
 * Every number is clamped rather than trusted: a hand-edited cost of -500 would pay
 * the player to open packs, and `pulls: 9999` would hand out a squad per press.
 */
function sanitizePack(value: unknown): DraftPack | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;

  if (typeof p.id !== 'string' || !p.id) return null;

  const currency = CURRENCY_ORDER.includes(p.currency as CurrencyKind)
    ? (p.currency as CurrencyKind)
    : CURRENCY_ORDER[0]!;

  const pack: DraftPack = {
    id: p.id,
    label: typeof p.label === 'string' ? p.label.slice(0, PACK_LABEL_MAX) : 'แพ็ค',
    cost: clampInt(p.cost, 0, PACK_COST_MAX, 0),
    currency,
    pulls: clampInt(p.pulls, 1, PACK_PULLS_MAX, 1),
  };

  const listCost = clampInt(p.listCost, 0, PACK_COST_MAX, 0);
  // A "was" price at or below the real price is not a discount; dropping it here
  // means the store never has to decide whether to believe it.
  if (listCost > pack.cost) pack.listCost = listCost;

  if (typeof p.badge === 'string' && p.badge.trim()) pack.badge = p.badge.trim().slice(0, PACK_BADGE_MAX);
  if (typeof p.visible === 'boolean') pack.visible = p.visible;

  const limit = clampInt(p.limitPerAccount, 0, PACK_LIMIT_MAX, 0);
  if (limit > 0) pack.limitPerAccount = limit;

  return pack;
}

function sanitizePacks(value: unknown): DraftPack[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const packs = value
    .map(sanitizePack)
    .filter((pack): pack is DraftPack => pack !== null)
    .slice(0, MAX_PACKS_PER_EVENT);
  return packs.length > 0 ? packs : undefined;
}

function sanitizeShowcase(value: unknown): ShowcaseSlot[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const slots = value
    .flatMap((entry): ShowcaseSlot[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const slot = entry as Record<string, unknown>;
      const cardId = typeof slot.cardId === 'string' && slot.cardId ? slot.cardId : null;
      return [
        {
          cardId,
          // Clamped generously rather than tightly: the canvas is wider than the
          // viewport and a card may hang off the left edge by design.
          left: clampInt(slot.left, -400, 4000, 0),
          top: clampInt(slot.top, -200, 800, 0),
          width: clampInt(slot.width, SHOWCASE_CARD_MIN_W, SHOWCASE_CARD_MAX_W, 152),
        },
      ];
    })
    .slice(0, MAX_SHOWCASE_SLOTS);

  return slots.length > 0 ? slots : undefined;
}

function sanitizeDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !value) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function sanitizeIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
}

function sanitizeOverride(value: unknown): DraftEventOverride | null {
  if (typeof value !== 'object' || value === null) return null;

  const source = value as Record<string, unknown>;
  const override: DraftEventOverride = {};

  if (typeof source.railName === 'string') override.railName = source.railName.slice(0, NAME_MAX_LENGTH);
  if (typeof source.title === 'string') override.title = source.title.slice(0, TITLE_MAX_LENGTH);

  // Only data URLs are accepted back. A stored http(s) URL would mean somebody
  // hand-edited the record, and rendering it would fetch an arbitrary remote image.
  for (const key of ['banner', 'thumbnail'] as const) {
    const candidate = source[key];
    if (typeof candidate === 'string' && candidate.startsWith('data:image/')) {
      override[key] = candidate;
    }
  }

  const odds = sanitizeOdds(source.odds);
  if (odds) override.odds = odds;

  if (typeof source.pity === 'object' && source.pity !== null) {
    const pity: Record<string, number> = {};
    for (const [ruleId, threshold] of Object.entries(source.pity)) {
      if (typeof threshold === 'number' && Number.isFinite(threshold)) {
        pity[ruleId] = clampInt(threshold, 1, 999, 1);
      }
    }
    if (Object.keys(pity).length > 0) override.pity = pity;
  }

  if (Array.isArray(source.pool)) {
    const pool = source.pool.map(sanitizePlayer).filter((p): p is DraftPlayer => p !== null);
    // An empty pool would make every pull fail, so a record that sanitises down to
    // nothing is treated as no override at all.
    if (pool.length > 0) override.pool = pool;
  }

  const poolIds = sanitizeIds(source.poolIds);
  if (poolIds) override.poolIds = poolIds;

  const packs = sanitizePacks(source.packs);
  if (packs) override.packs = packs;

  const showcase = sanitizeShowcase(source.showcase);
  if (showcase) override.showcase = showcase;

  if (Array.isArray(source.pityRules)) {
    // An empty array is meaningful here — it means "this event has no guarantees" —
    // so it survives, unlike the other list fields.
    override.pityRules = sanitizePity(source.pityRules);
  }

  if (typeof source.hidden === 'boolean') override.hidden = source.hidden;
  if (typeof source.order === 'number' && Number.isFinite(source.order)) {
    override.order = clampInt(source.order, 0, 999, 0);
  }

  const startsAt = sanitizeDate(source.startsAt);
  if (startsAt !== undefined) override.startsAt = startsAt;
  const endsAt = sanitizeDate(source.endsAt);
  if (endsAt !== undefined) override.endsAt = endsAt;

  return Object.keys(override).length > 0 ? override : null;
}

function sanitizePity(value: unknown): PityRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): PityRule[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== 'string' || !PLAYER_SETS.includes(r.set as PityRule['set'])) return [];

    return [
      {
        id: r.id,
        set: r.set as PityRule['set'],
        threshold: clampInt(r.threshold, 1, 999, 10),
        label: typeof r.label === 'string' ? r.label.slice(0, 40) : 'รับประกัน',
        description: typeof r.description === 'string' ? r.description.slice(0, 80) : '',
        tone: r.tone === 'secondary' ? 'secondary' : 'primary',
      },
    ];
  });
}

/** An admin-authored event. Stored whole, so every field is repaired on the way in. */
function sanitizeCustom(value: unknown): CustomDraftEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== 'string' || !e.id) return null;

  const odds = sanitizeOdds(e.odds) ?? { A: 1, B: 6, C: 28, D: 65 };
  const image = (key: 'banner' | 'thumbnail'): string => {
    const candidate = e[key];
    return typeof candidate === 'string' && candidate.startsWith('data:image/') ? candidate : '';
  };

  return {
    id: e.id,
    railName: typeof e.railName === 'string' ? e.railName.slice(0, NAME_MAX_LENGTH) : 'แพ็คใหม่',
    title: typeof e.title === 'string' ? e.title.slice(0, TITLE_MAX_LENGTH) : 'แพ็คใหม่',
    banner: image('banner'),
    thumbnail: image('thumbnail'),
    hot: e.hot === true,
    endsInDays: clampInt(e.endsInDays, 0, 365, 7),
    poolIds: sanitizeIds(e.poolIds) ?? [],
    showcase: sanitizeShowcase(e.showcase) ?? DEFAULT_SHOWCASE.map((slot) => ({ ...slot })),
    odds,
    pity: sanitizePity(e.pity),
    packs: sanitizePacks(e.packs) ?? [],
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(0).toISOString(),
  };
}

const EMPTY: DraftConfig = { overrides: {}, custom: [], removed: [] };

function readOverrides(value: unknown): DraftOverrides {
  if (typeof value !== 'object' || value === null) return {};
  const overrides: DraftOverrides = {};
  for (const [id, entry] of Object.entries(value)) {
    const clean = sanitizeOverride(entry);
    if (clean) overrides[id] = clean;
  }
  return overrides;
}

/**
 * Reads v2, falling back to the v1 override map.
 *
 * v1 is only read, never written: an older build left running in another tab keeps
 * working off its own key instead of finding a shape it cannot parse.
 */
export function loadConfig(): DraftConfig {
  try {
    const raw = window.localStorage.getItem(DRAFT_CONFIG_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY };

      const source = parsed as Record<string, unknown>;
      return {
        overrides: readOverrides(source.overrides),
        custom: Array.isArray(source.custom)
          ? source.custom
              .map(sanitizeCustom)
              .filter((event): event is CustomDraftEvent => event !== null)
              .slice(0, MAX_CUSTOM_EVENTS)
          : [],
        removed: Array.isArray(source.removed)
          ? source.removed.filter((id): id is string => typeof id === 'string')
          : [],
      };
    }

    const legacy = window.localStorage.getItem(DRAFT_CONFIG_KEY_V1);
    if (!legacy) return { ...EMPTY };
    return { overrides: readOverrides(JSON.parse(legacy)), custom: [], removed: [] };
  } catch {
    return { ...EMPTY };
  }
}

export function saveConfig(config: DraftConfig): SaveResult {
  try {
    window.localStorage.setItem(DRAFT_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
