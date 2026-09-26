import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { dayKeyAt } from '@/lib/dayKey';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { ShopPurchase, ShopReward } from '@/features/shop/types';
import { currentCup } from './cup';
import type { CupConfig, CupShopError, CupShopItem, CupState } from './types';

/**
 * ร้าน Cup Token — spend the tokens a cup run pays. Pure, like the rest of the cup:
 * an account goes in, a new one comes out, and the charge, the delivery and the
 * purchase count all land in that one object.
 */

/** Provenance on cards bought here. */
export const CUP_SHOP_EVENT_ID = 'cup-shop';

/** The shop day, on the same `resetHour` the cup's entries turn over at. */
export function shopDayOf(now: Date, config: Pick<CupConfig, 'resetHour'>): string {
  return dayKeyAt(now, config.resetHour);
}

/** Purchases of this item that count against its limit right now. */
export function boughtCount(item: CupShopItem, state: CupState, now: Date, config: CupConfig): number {
  const row = state.shop?.[item.id];
  if (!row) return 0;
  if (item.limitPeriod === 'lifetime') return row.total;
  return row.day === shopDayOf(now, config) ? row.dayCount : 0;
}

/** Purchases left, or null for an item with no limit. */
export function remainingOf(item: CupShopItem, state: CupState, now: Date, config: CupConfig): number | null {
  if (item.limit <= 0) return null;
  return Math.max(0, item.limit - boughtCount(item, state, now, config));
}

/** Items a player can see: switched on, with something to hand over. */
export function shopItems(config: CupConfig): CupShopItem[] {
  if (!config.enabled || !config.shop.enabled) return [];
  return config.shop.items.filter((item) => item.enabled && item.rewards.length > 0);
}

export interface CupShopBuyInput {
  itemId: string;
  config: CupConfig;
  now: Date;
  lookup: CardLookup;
  stamp: ShopStamp;
}

export interface CupShopBuyOutcome {
  ok: boolean;
  error: CupShopError | null;
  account: Account;
  item: CupShopItem | null;
  /** What was handed over, already credited. */
  paid: ShopReward[];
  cards: OwnedPlayer[];
}

/**
 * Buys one of an item.
 *
 * Everything that could refuse is checked before a token moves — the shop being
 * open, the item, its limit, the balance, and then `deliverRewards`, which checks
 * the club and the wallet caps before crediting anything. Only then are the tokens
 * taken, in the same returned account. Nothing is ever refunded, because nothing is
 * charged until the purchase is certain (CLAUDE.md: charge after validating).
 */
export function buyCupShopItem(account: Account, input: CupShopBuyInput): CupShopBuyOutcome {
  const { config, now } = input;
  const fail = (error: CupShopError, item: CupShopItem | null = null): CupShopBuyOutcome => ({
    ok: false,
    error,
    account,
    item,
    paid: [],
    cards: [],
  });

  if (!config.enabled || !config.shop.enabled) return fail('closed');
  const item = shopItems(config).find((entry) => entry.id === input.itemId) ?? null;
  if (!item) return fail('unavailable');

  const state = currentCup(account.cup, config, now);
  const left = remainingOf(item, state, now, config);
  if (left !== null && left <= 0) return fail('limit-reached', item);
  if ((state.tokens ?? 0) < item.price) return fail('not-enough-tokens', item);

  const delivery = deliverRewards(account, item.rewards, input.lookup, input.stamp, 'cup', CUP_SHOP_EVENT_ID);
  if (!delivery.ok) return fail(delivery.error, item);

  const day = shopDayOf(now, config);
  const before: ShopPurchase = state.shop?.[item.id] ?? { total: 0, dayCount: 0, day };
  const after: ShopPurchase = {
    total: before.total + 1,
    dayCount: before.day === day ? before.dayCount + 1 : 1,
    day,
  };

  return {
    ok: true,
    error: null,
    item,
    paid: item.rewards,
    cards: delivery.cards,
    account: {
      ...delivery.account,
      cup: {
        ...state,
        tokens: state.tokens - item.price,
        shop: { ...state.shop, [item.id]: after },
      },
    },
  };
}
