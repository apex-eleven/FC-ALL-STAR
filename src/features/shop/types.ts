import type { CurrencyKind } from '@/features/currencies/types';

/**
 * The item shop (ร้านค้า).
 *
 * Three levels, all admin-defined: a section is a tab along the top (แนะนำ, แต้ม FC
 * และอัญมณี …), a category is an entry in the left rail (ของเด็ดใน FC, ขายดีที่สุด …),
 * and an item is one card in the row.
 */

/** In-game currencies an item can be paid with. Both can be offered at once. */
export type ShopPayKind = Extract<CurrencyKind, 'fcpoint' | 'gem'>;
export const SHOP_PAY_KINDS: readonly ShopPayKind[] = ['fcpoint', 'gem'];

export interface ShopCurrencyReward {
  kind: CurrencyKind;
  amount: number;
}

/**
 * A player card from the catalogue. `amount` is the number of copies. The copies are
 * snapshots taken at purchase time, like any other card in a club.
 */
export interface ShopCardReward {
  kind: 'card';
  /** Catalogue id — resolved when the item is bought, not when it is set up. */
  cardId: string;
  amount: number;
  /** Rank-up level the copies arrive at, 0..MAX_PLUS (+0 to +8). */
  plus: number;
}

export type ShopReward = ShopCurrencyReward | ShopCardReward;
export type ShopRewardKind = ShopReward['kind'];

/**
 * `band` is the dark strip across the card with the price on it; `button` is the
 * lime pill the FC-point packs use.
 */
export type PriceStyle = 'band' | 'button';

/** `lifetime` counts every purchase ever; `daily` starts again each shop day. */
export type LimitPeriod = 'lifetime' | 'daily';

export interface ShopItem {
  id: string;
  enabled: boolean;
  /** Drawn over the top of the card. Empty when the art already carries its title. */
  title: string;
  subtitle: string;
  /** Uploaded, re-encoded data URL, or '' for the drawn fallback. */
  image: string;

  /** Real money, in baht. null = not sold for money. */
  priceBaht: number | null;
  /** In-game prices. Every one that is set is offered, and the player picks. */
  priceFcpoint: number | null;
  priceGem: number | null;
  priceStyle: PriceStyle;

  rewards: ShopReward[];
  /** Given on top of `rewards` the first time an account buys this item. */
  firstBonus: ShopReward[];
  /** Draws the reward line (icon, amount, "+ BONUS") above the price. */
  showRewards: boolean;

  /** 0 = unlimited. */
  limit: number;
  limitPeriod: LimitPeriod;
  showLimit: boolean;

  /** "200% VALUE" starburst. 0 hides it. */
  valuePercent: number;
  /** The thumbs-up strip with a number. 0 hides it. */
  quantity: number;

  /** ISO timestamps or ''. After `endAt` the item disappears; before it, it counts down. */
  startAt: string;
  endAt: string;
  showCountdown: boolean;
}

export type CardSize = 'tall' | 'regular';

export interface ShopCategory {
  id: string;
  name: string;
  enabled: boolean;
  /** Kept so saved shops still load; the red dot is no longer drawn. */
  dot: boolean;
  cardSize: CardSize;
  items: ShopItem[];
}

export interface ShopSection {
  id: string;
  name: string;
  enabled: boolean;
  /** Red number beside the tab label. 0 hides it. */
  badge: number;
  categories: ShopCategory[];
}

export interface ShopConfig {
  enabled: boolean;
  sections: ShopSection[];
  /** Hour the daily limits start again, local time. */
  dailyResetHour: number;
  /** Where a baht purchase sends the player, e.g. a LINE or Facebook link. */
  contactUrl: string;
  contactLabel: string;
  /** Shown in the baht dialog above the contact button. */
  contactNote: string;
  /** Small print under the left rail. */
  footerNote: string;
}

/** Per-account purchase history for one item. */
export interface ShopPurchase {
  /** Purchases ever, used for the first-purchase bonus. */
  total: number;
  /** Purchases inside `day`, used for daily limits. */
  dayCount: number;
  /** Shop-day key (YYYY-MM-DD) that `dayCount` belongs to. */
  day: string;
}

export interface ShopProgress {
  bought: Record<string, ShopPurchase>;
}

export type ShopBuyError =
  | 'closed'
  | 'unavailable'
  | 'limit-reached'
  | 'no-such-price'
  | 'insufficient-funds'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';
