import type { Account } from '@/features/auth/types';
import { appendEntry, credit, debit } from '@/features/currencies/wallet';
import type { Wallet, WalletEntry } from '@/features/currencies/types';
import { seasonIdAt } from '@/features/league/season';
import type {
  ShopBuyError,
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

function credited(
  wallet: Wallet,
  ledger: WalletEntry[],
  payout: readonly ShopReward[],
  reason: 'shop' | 'admin-grant',
  by?: string,
): { ok: boolean; wallet: Wallet; ledger: WalletEntry[] } {
  let nextWallet = wallet;
  let nextLedger = ledger;
  for (const reward of payout) {
    const result = credit(nextWallet, reward.kind, reward.amount, { reason, by });
    if (!result.ok || !result.entry) return { ok: false, wallet, ledger };
    nextWallet = result.wallet;
    nextLedger = appendEntry(nextLedger, result.entry);
  }
  return { ok: true, wallet: nextWallet, ledger: nextLedger };
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
): ShopBuyOutcome {
  const fail = (error: ShopBuyError): ShopBuyOutcome => ({ ok: false, error, account, payout: [] });

  if (!config.enabled) return fail('closed');
  if (!isLive(item, now)) return fail('unavailable');

  const progress = progressOf(account);
  const remaining = remainingOf(item, progress, now, config);
  if (remaining !== null && remaining <= 0) return fail('limit-reached');

  const cost = payPrice(item, kind);
  if (cost === null) return fail('no-such-price');

  const paid = debit(account.wallet, kind, cost, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) return fail('insufficient-funds');

  const payout = payoutOf(item, progress);
  const given = credited(paid.wallet, appendEntry(account.ledger, paid.entry), payout, 'shop');
  if (!given.ok) return fail('at-cap');

  return {
    ok: true,
    error: null,
    payout,
    account: {
      ...account,
      wallet: given.wallet,
      ledger: given.ledger,
      shop: recorded(progress, item, now, config),
    },
  };
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
): ShopBuyOutcome {
  const fail = (error: ShopBuyError): ShopBuyOutcome => ({ ok: false, error, account, payout: [] });

  const progress = progressOf(account);
  const remaining = remainingOf(item, progress, now, config);
  if (remaining !== null && remaining <= 0) return fail('limit-reached');

  const payout = payoutOf(item, progress);
  const given = credited(account.wallet, account.ledger, payout, 'admin-grant', by);
  if (!given.ok) return fail('at-cap');

  return {
    ok: true,
    error: null,
    payout,
    account: {
      ...account,
      wallet: given.wallet,
      ledger: given.ledger,
      shop: recorded(progress, item, now, config),
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
