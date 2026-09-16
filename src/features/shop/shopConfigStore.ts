import { CURRENCY_ORDER } from '@/features/currencies/constants';
import { clampPlus } from '@/features/rankup/plus';
import type { CurrencyKind } from '@/features/currencies/types';
import {
  MAX_BAHT,
  MAX_CARD_COPIES,
  MAX_CATEGORIES,
  MAX_ITEMS,
  MAX_PRICE,
  MAX_REWARDS,
  MAX_SECTIONS,
  NAME_MAX,
  NOTE_MAX,
  SHOP_CONFIG_KEY,
  TEXT_MAX,
  blankItem,
  defaultShop,
  shopId,
} from './constants';
import type {
  ShopCategory,
  ShopConfig,
  ShopItem,
  ShopProgress,
  ShopPurchase,
  ShopReward,
  ShopSection,
} from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

type Source = Record<string, unknown>;

function record(value: unknown): Source {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Source)
    : {};
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function text(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** null stays null — "not sold this way" — and anything else is clamped. */
function price(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(max, value);
}

function whole(value: unknown): number | null {
  const amount = price(value, MAX_PRICE);
  return amount === null ? null : Math.max(1, Math.round(amount));
}

function baht(value: unknown): number | null {
  const amount = price(value, MAX_BAHT);
  return amount === null ? null : Math.round(amount * 100) / 100;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  return Number.isNaN(Date.parse(value)) ? '' : value;
}

/** Catalogue ids are short; anything longer is not one. */
const CARD_ID_MAX = 80;

function oneReward(entry: Source): ShopReward | null {
  if (entry.kind === 'card') {
    const cardId = typeof entry.cardId === 'string' ? entry.cardId.trim().slice(0, CARD_ID_MAX) : '';
    const amount = clampInt(entry.amount, 0, MAX_CARD_COPIES, 0);
    return cardId !== '' && amount > 0
      ? { kind: 'card', cardId, amount, plus: clampPlus(entry.plus) }
      : null;
  }
  if (!CURRENCY_ORDER.includes(entry.kind as CurrencyKind)) return null;
  const amount = clampInt(entry.amount, 0, MAX_PRICE, 0);
  return amount > 0 ? { kind: entry.kind as CurrencyKind, amount } : null;
}

function rewards(value: unknown): ShopReward[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => oneReward(record(entry)))
    .filter((entry): entry is ShopReward => entry !== null)
    .slice(0, MAX_REWARDS);
}

/** Only data URLs come back — a stored http(s) value would mean hand-edited storage. */
function image(value: unknown): string {
  return typeof value === 'string' && value.startsWith('data:image/') ? value : '';
}

function uniqueId(value: unknown, prefix: string, seen: Set<string>): string {
  let id = typeof value === 'string' && value.length > 0 ? value.slice(0, 60) : shopId(prefix);
  while (seen.has(id)) id = shopId(prefix);
  seen.add(id);
  return id;
}

function sanitizeItem(value: unknown, seen: Set<string>): ShopItem {
  const source = record(value);
  const base = blankItem(uniqueId(source.id, 'it', seen));
  return {
    ...base,
    enabled: bool(source.enabled, true),
    title: text(source.title, TEXT_MAX),
    subtitle: text(source.subtitle, TEXT_MAX),
    image: image(source.image),
    priceBaht: baht(source.priceBaht),
    priceFcpoint: whole(source.priceFcpoint),
    priceGem: whole(source.priceGem),
    priceStyle: source.priceStyle === 'button' ? 'button' : 'band',
    rewards: rewards(source.rewards),
    firstBonus: rewards(source.firstBonus),
    showRewards: bool(source.showRewards, false),
    limit: clampInt(source.limit, 0, 9_999, 0),
    limitPeriod: source.limitPeriod === 'daily' ? 'daily' : 'lifetime',
    showLimit: bool(source.showLimit, true),
    valuePercent: clampInt(source.valuePercent, 0, 9_999, 0),
    quantity: clampInt(source.quantity, 0, 999_999, 0),
    startAt: timestamp(source.startAt),
    endAt: timestamp(source.endAt),
    showCountdown: bool(source.showCountdown, true),
  };
}

function sanitizeCategory(value: unknown, seen: Set<string>, itemIds: Set<string>): ShopCategory {
  const source = record(value);
  return {
    id: uniqueId(source.id, 'cat', seen),
    name: text(source.name, NAME_MAX, 'หมวด'),
    enabled: bool(source.enabled, true),
    dot: bool(source.dot, false),
    cardSize: source.cardSize === 'tall' ? 'tall' : 'regular',
    items: (Array.isArray(source.items) ? source.items : [])
      .slice(0, MAX_ITEMS)
      .map((item) => sanitizeItem(item, itemIds)),
  };
}

function sanitizeSection(
  value: unknown,
  seen: Set<string>,
  categoryIds: Set<string>,
  itemIds: Set<string>,
): ShopSection {
  const source = record(value);
  return {
    id: uniqueId(source.id, 'sec', seen),
    name: text(source.name, NAME_MAX, 'หัวข้อ'),
    enabled: bool(source.enabled, true),
    badge: clampInt(source.badge, 0, 99, 0),
    categories: (Array.isArray(source.categories) ? source.categories : [])
      .slice(0, MAX_CATEGORIES)
      .map((entry) => sanitizeCategory(entry, categoryIds, itemIds)),
  };
}

/**
 * Repairs a stored shop. Ids are kept unique across the whole shop — purchase
 * history is keyed by item id, so two items sharing one would share a limit.
 */
export function normalizeConfig(value: unknown): ShopConfig {
  if (typeof value !== 'object' || value === null) return defaultShop();

  const source = record(value);
  const fallback = defaultShop();
  const sectionIds = new Set<string>();
  const categoryIds = new Set<string>();
  const itemIds = new Set<string>();

  return {
    enabled: bool(source.enabled, true),
    dailyResetHour: clampInt(source.dailyResetHour, 0, 23, fallback.dailyResetHour),
    contactUrl: /^https?:\/\//i.test(text(source.contactUrl, NOTE_MAX))
      ? text(source.contactUrl, NOTE_MAX)
      : '',
    contactLabel: text(source.contactLabel, NAME_MAX, fallback.contactLabel),
    contactNote: text(source.contactNote, NOTE_MAX, fallback.contactNote),
    footerNote: text(source.footerNote, NOTE_MAX, fallback.footerNote),
    sections: (Array.isArray(source.sections) ? source.sections : [])
      .slice(0, MAX_SECTIONS)
      .map((entry) => sanitizeSection(entry, sectionIds, categoryIds, itemIds)),
  };
}

export function loadConfig(): ShopConfig {
  try {
    const raw = window.localStorage.getItem(SHOP_CONFIG_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultShop();
  } catch {
    return defaultShop();
  }
}

export function saveConfig(config: ShopConfig): SaveResult {
  try {
    window.localStorage.setItem(SHOP_CONFIG_KEY, JSON.stringify(config));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

/** Repairs the per-account purchase history read from storage or Firestore. */
export function normalizeProgress(value: unknown): ShopProgress {
  const bought: Record<string, ShopPurchase> = {};
  for (const [id, entry] of Object.entries(record(record(value).bought))) {
    const source = record(entry);
    const total = clampInt(source.total, 0, 1_000_000, 0);
    if (!id || total === 0) continue;
    bought[id] = {
      total,
      dayCount: clampInt(source.dayCount, 0, 1_000_000, 0),
      day: text(source.day, 10),
    };
  }
  return { bought };
}
