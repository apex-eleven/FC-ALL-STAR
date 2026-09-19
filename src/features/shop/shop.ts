import type { Account } from '@/features/auth/types';
import { addPlayers } from '@/features/club/club';
import { CLUB_CAPACITY } from '@/features/club/constants';
import type { Club, OwnedPlayer } from '@/features/club/types';
import { appendEntry, credit, debit } from '@/features/currencies/wallet';
import type { Wallet, WalletEntry, WalletReason } from '@/features/currencies/types';
import { cardToPlayer } from '@/features/draft/pool';
import { seasonIdAt } from '@/features/league/season';
import { withItems } from '@/features/items/inventory';
import type { PlayerCard } from '@/features/players/types';
import { SHOP_EVENT_ID } from './constants';
import type {
  ShopBuyError,
  ShopCardReward,
  ShopCategory,
  ShopConfig,
  ShopItem,
  ShopPayKind,
  ShopProgress,
  ShopPurchase,
  ShopReward,
  ShopSection,
} from './types';

/**
 * Pure shop rules. Nothing here touches React or storage — every function that
 * changes an account takes one and returns a new one.
 */

export function emptyProgress(): ShopProgress {
  return { bought: {} };
}

export function progressOf(account: Pick<Account, 'shop'>): ShopProgress {
  return account.shop ?? emptyProgress();
}

/** The shop day a moment belongs to — daily limits start again at `dailyResetHour`. */
export function shopDay(now: Date, config: Pick<ShopConfig, 'dailyResetHour'>): string {
  return seasonIdAt(now, config.dailyResetHour);
}

/** Inside its start/end window and switched on. */
export function isLive(item: ShopItem, now: Date): boolean {
  if (!item.enabled) return false;
  const time = now.getTime();
  if (item.startAt && time < Date.parse(item.startAt)) return false;
  if (item.endAt && time >= Date.parse(item.endAt)) return false;
  return true;
}

export function visibleSections(config: ShopConfig): ShopSection[] {
  return config.sections
    .filter((section) => section.enabled)
    .map((section) => ({
      ...section,
      categories: section.categories.filter((category) => category.enabled),
    }))
    .filter((section) => section.categories.length > 0);
}

export function liveItems(category: ShopCategory, now: Date): ShopItem[] {
  return category.items.filter((item) => isLive(item, now));
}

/** Purchases that count against the limit right now. */
export function usedOf(
  item: ShopItem,
  progress: ShopProgress,
  now: Date,
  config: Pick<ShopConfig, 'dailyResetHour'>,
): number {
  const entry = progress.bought[item.id];
  if (!entry) return 0;
  if (item.limitPeriod === 'lifetime') return entry.total;
  return entry.day === shopDay(now, config) ? entry.dayCount : 0;
}

export function remainingOf(
  item: ShopItem,
  progress: ShopProgress,
  now: Date,
  config: Pick<ShopConfig, 'dailyResetHour'>,
): number | null {
  if (item.limit <= 0) return null;
  return Math.max(0, item.limit - usedOf(item, progress, now, config));
}

/** First purchase of this item by this account — the bonus is still to come. */
export function bonusPending(item: ShopItem, progress: ShopProgress): boolean {
  return item.firstBonus.length > 0 && (progress.bought[item.id]?.total ?? 0) === 0;
}

export function payPrice(item: ShopItem, kind: ShopPayKind): number | null {
  return kind === 'fcpoint' ? item.priceFcpoint : item.priceGem;
}

/** Every in-game way to pay for this item, in display order. */
export function payOptions(item: ShopItem): { kind: ShopPayKind; amount: number }[] {
  const options: { kind: ShopPayKind; amount: number }[] = [];
  if (item.priceFcpoint !== null) options.push({ kind: 'fcpoint', amount: item.priceFcpoint });
  if (item.priceGem !== null) options.push({ kind: 'gem', amount: item.priceGem });
  return options;
}

/** Rewards one purchase would give right now, bonus included when it applies. */
export function payoutOf(item: ShopItem, progress: ShopProgress): ShopReward[] {
  return bonusPending(item, progress) ? [...item.rewards, ...item.firstBonus] : item.rewards;
}

/** Card rewards resolve against the live catalogue at purchase time. */
export type CardLookup = (id: string) => PlayerCard | undefined;

/**
 * Identity for the cards a purchase hands out, fixed by the caller.
 *
 * `updateAccount` may run its mutator more than once; the copies are numbered off one
 * seed so every run produces the same ids.
 */
export interface ShopStamp {
  seed: string;
  at: string;
}

export function shopStamp(): ShopStamp {
  const seed =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { seed, at: new Date().toISOString() };
}

export function isCardReward(reward: ShopReward): reward is ShopCardReward {
  return reward.kind === 'card';
}

function credited(
  wallet: Wallet,
  ledger: WalletEntry[],
  payout: readonly ShopReward[],
  reason: Extract<
    WalletReason,
    'shop' | 'admin-grant' | 'mission' | 'starpass' | 'gacha' | 'redeem' | 'inbox' | 'login'
  >,
  by?: string,
): { ok: boolean; wallet: Wallet; ledger: WalletEntry[] } {
  let nextWallet = wallet;
  let nextLedger = ledger;
  for (const reward of payout) {
    if (reward.kind === 'card' || reward.kind === 'item') continue;
    const result = credit(nextWallet, reward.kind, reward.amount, { reason, by });
    if (!result.ok || !result.entry) return { ok: false, wallet, ledger };
    nextWallet = result.wallet;
    nextLedger = appendEntry(nextLedger, result.entry);
  }
  return { ok: true, wallet: nextWallet, ledger: nextLedger };
}

type Delivery = { ok: true; club: Club; cards: OwnedPlayer[] } | { ok: false; error: ShopBuyError };

/**
 * The card copies a payout gives, added to the club.
 *
 * Checked in full before anything is charged: a card the admin has since deleted
 * refuses the purchase, and so does a club without room for every copy — `addPlayers`
 * trims to capacity and would otherwise drop a card the player paid for.
 */
function delivered(
  club: Club,
  payout: readonly ShopReward[],
  lookup: CardLookup,
  stamp: ShopStamp,
  eventId: string = SHOP_EVENT_ID,
): Delivery {
  const lines = payout.filter(isCardReward);
  if (lines.length === 0) return { ok: true, club, cards: [] };

  const copies = lines.reduce((sum, line) => sum + line.amount, 0);
  if (club.players.length + copies > CLUB_CAPACITY) return { ok: false, error: 'club-full' };

  const cards: OwnedPlayer[] = [];
  for (const line of lines) {
    const card = lookup(line.cardId);
    if (!card) return { ok: false, error: 'card-missing' };
    const resolved = cardToPlayer(card);
    for (let copy = 0; copy < line.amount; copy += 1) {
      cards.push({
        id: `${stamp.seed}-${cards.length + 1}`,
        playerId: card.id,
        eventId,
        name: resolved.name,
        rating: resolved.rating,
        position: resolved.position,
        set: resolved.set,
        nation: resolved.nation,
        club: resolved.club,
        portrait: resolved.portrait,
        acquiredAt: stamp.at,
        ...(line.plus > 0 ? { plus: line.plus } : {}),
      });
    }
  }
  return { ok: true, club: addPlayers(club, cards), cards };
}

function recorded(
  progress: ShopProgress,
  item: ShopItem,
  now: Date,
  config: Pick<ShopConfig, 'dailyResetHour'>,
): ShopProgress {
  const day = shopDay(now, config);
  const previous: ShopPurchase = progress.bought[item.id] ?? { total: 0, dayCount: 0, day };
  return {
    bought: {
      ...progress.bought,
      [item.id]: {
        total: previous.total + 1,
        dayCount: previous.day === day ? previous.dayCount + 1 : 1,
        day,
      },
    },
  };
}

export interface ShopBuyOutcome {
  ok: boolean;
  error: ShopBuyError | null;
  account: Account;
  payout: ShopReward[];
  /** The card copies added to the club, newest first as they were filed. */
  cards: OwnedPlayer[];
}

/**
 * Buys one item with an in-game currency.
 *
 * Everything is checked before anything is charged, and the charge, the rewards,
 * and the purchase count are one new account — there is no state in which the
 * player paid and got nothing.
 */
export function buyWith(
  account: Account,
  item: ShopItem,
  kind: ShopPayKind,
  config: ShopConfig,
  now: Date,
  lookup: CardLookup,
  stamp: ShopStamp = shopStamp(),
): ShopBuyOutcome {
  const fail = (error: ShopBuyError): ShopBuyOutcome => ({
    ok: false,
    error,
    account,
    payout: [],
    cards: [],
  });

  if (!config.enabled) return fail('closed');
  if (!isLive(item, now)) return fail('unavailable');

  const progress = progressOf(account);
  const remaining = remainingOf(item, progress, now, config);
  if (remaining !== null && remaining <= 0) return fail('limit-reached');

  const cost = payPrice(item, kind);
  if (cost === null) return fail('no-such-price');

  const payout = payoutOf(item, progress);
  const cards = delivered(account.club, payout, lookup, stamp);
  if (!cards.ok) return fail(cards.error);

  const paid = debit(account.wallet, kind, cost, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) return fail('insufficient-funds');

  const given = credited(paid.wallet, appendEntry(account.ledger, paid.entry), payout, 'shop');
  if (!given.ok) return fail('at-cap');

  return {
    ok: true,
    error: null,
    payout,
    cards: cards.cards,
    account: {
      ...account,
      wallet: given.wallet,
      ledger: given.ledger,
      club: cards.club,
      shop: recorded(progress, item, now, config),
      ...itemsFor(account, payout),
    },
  };
}

/** The inventory after a payout's item lines, as a spreadable field. */
function itemsFor(account: Account, payout: readonly ShopReward[]): Pick<Account, 'inventory'> {
  const inventory = withItems(account.inventory, payout);
  return inventory ? { inventory } : {};
}

/**
 * An admin handing over a baht purchase that was paid outside the game.
 *
 * Counts as a real purchase — the limit and first-purchase bonus behave exactly as
 * they would for an in-game one — but charges nothing. The limit is enforced here
 * too, so a double-click in the admin panel cannot deliver twice past it.
 */
export function grantPurchase(
  account: Account,
  item: ShopItem,
  config: ShopConfig,
  now: Date,
  by: string,
  lookup: CardLookup,
  stamp: ShopStamp = shopStamp(),
): ShopBuyOutcome {
  const fail = (error: ShopBuyError): ShopBuyOutcome => ({
    ok: false,
    error,
    account,
    payout: [],
    cards: [],
  });

  const progress = progressOf(account);
  const remaining = remainingOf(item, progress, now, config);
  if (remaining !== null && remaining <= 0) return fail('limit-reached');

  const payout = payoutOf(item, progress);
  const cards = delivered(account.club, payout, lookup, stamp);
  if (!cards.ok) return fail(cards.error);

  const given = credited(account.wallet, account.ledger, payout, 'admin-grant', by);
  if (!given.ok) return fail('at-cap');

  return {
    ok: true,
    error: null,
    payout,
    cards: cards.cards,
    account: {
      ...account,
      wallet: given.wallet,
      ledger: given.ledger,
      club: cards.club,
      shop: recorded(progress, item, now, config),
      ...itemsFor(account, payout),
    },
  };
}

export type RewardDelivery =
  | { ok: true; account: Account; cards: OwnedPlayer[] }
  | { ok: false; error: Extract<ShopBuyError, 'at-cap' | 'club-full' | 'card-missing'> };

/**
 * Hands over a reward list outside a purchase — mission, chest, Star Pass, gacha, redeem-code,
 * inbox and daily-login payouts. Same all-or-nothing rules as buying: every card is checked before anything is credited.
 */
export function deliverRewards(
  account: Account,
  payout: readonly ShopReward[],
  lookup: CardLookup,
  stamp: ShopStamp,
  reason: 'mission' | 'starpass' | 'gacha' | 'redeem' | 'inbox' | 'login',
  eventId: string,
): RewardDelivery {
  const cards = delivered(account.club, payout, lookup, stamp, eventId);
  if (!cards.ok) return { ok: false, error: cards.error === 'club-full' ? 'club-full' : 'card-missing' };
  const given = credited(account.wallet, account.ledger, payout, reason);
  if (!given.ok) return { ok: false, error: 'at-cap' };
  return {
    ok: true,
    cards: cards.cards,
    account: {
      ...account,
      wallet: given.wallet,
      ledger: given.ledger,
      club: cards.club,
      ...itemsFor(account, payout),
    },
  };
}

/** "17:51:40", or "2 วัน 17:51:40" once there is more than a day left. */
export function countdown(endAt: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((Date.parse(endAt) - now.getTime()) / 1000));
  const days = Math.floor(seconds / 86_400);
  const pad = (value: number) => String(value).padStart(2, '0');
  const clock = `${pad(Math.floor((seconds % 86_400) / 3_600))}:${pad(
    Math.floor((seconds % 3_600) / 60),
  )}:${pad(seconds % 60)}`;
  return days > 0 ? `${days} วัน ${clock}` : clock;
}

export function formatBaht(amount: number): string {
  return `฿${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
