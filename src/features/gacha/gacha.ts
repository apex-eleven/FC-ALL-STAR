import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { appendEntry, debit } from '@/features/currencies/wallet';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import { GACHA_EVENT_ID, HISTORY_LIMIT } from './constants';
import type { GachaConfig, GachaError, GachaPrize, GachaState, GachaWin } from './types';

/**
 * Pure roulette rules. The roll comes in as a number in [0, 1) — fixed by the caller
 * before `updateAccount`, so a mutator that runs twice lands on the same prize.
 */

export function emptyState(): GachaState {
  return { spins: 0, history: [] };
}

export function stateOf(saved: GachaState | undefined): GachaState {
  return saved ?? emptyState();
}

/** Prizes a spin can land on. */
export function livePrizes(config: GachaConfig): GachaPrize[] {
  return config.prizes.filter((prize) => prize.enabled && prize.chance > 0);
}

/** Chance total the percentages are measured against. */
export function chanceTotal(config: GachaConfig): number {
  return livePrizes(config).reduce((sum, prize) => sum + prize.chance, 0);
}

/** A prize's real chance as a percentage of the wheel, 0 when the wheel is empty. */
export function percentOf(config: GachaConfig, prize: GachaPrize): number {
  const total = chanceTotal(config);
  if (total <= 0 || !prize.enabled || prize.chance <= 0) return 0;
  return (prize.chance / total) * 100;
}

/** The prize a roll in [0, 1) lands on. */
export function prizeFor(config: GachaConfig, roll: number): GachaPrize | null {
  const prizes = livePrizes(config);
  const total = chanceTotal(config);
  if (prizes.length === 0 || total <= 0) return null;
  let ticket = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const prize of prizes) {
    ticket -= prize.chance;
    if (ticket < 0) return prize;
  }
  return prizes[prizes.length - 1] ?? null;
}

export function prizeName(prize: GachaPrize, rewardName: string): string {
  return prize.name.trim() || rewardName;
}

export interface GachaSpinOutcome {
  ok: boolean;
  error: GachaError | null;
  account: Account;
  prize: GachaPrize | null;
  /** Card the prize handed over, when it was a card. */
  card: OwnedPlayer | null;
  /** The win as it was filed, for the feed and the toast. */
  win: GachaWin | null;
}

function failed(account: Account, error: GachaError): GachaSpinOutcome {
  return { ok: false, error, account, prize: null, card: null, win: null };
}

export interface SpinInput {
  config: GachaConfig;
  roll: number;
  now: Date;
  /** Fixed by the caller so both runs of a mutator file the same win. */
  winId: string;
  lookup: CardLookup;
  stamp: ShopStamp;
  /** The prize's display name, resolved by the caller (it needs the catalogues). */
  label: string;
}

/**
 * One spin: charges the keys, pays the prize, and files the win — one new account,
 * so a spin can never charge without paying or pay without charging.
 */
export function spin(account: Account, input: SpinInput): GachaSpinOutcome {
  const { config, roll, now, winId, lookup, stamp, label } = input;
  if (!config.enabled) return failed(account, 'closed');

  const prize = prizeFor(config, roll);
  if (!prize) return failed(account, 'empty');

  const cost = Math.max(0, Math.floor(config.keyCost));
  let wallet = account.wallet;
  let ledger = account.ledger;
  if (cost > 0) {
    const paid = debit(wallet, 'key', cost, { reason: 'gacha' });
    if (!paid.ok || !paid.entry) return failed(account, 'no-keys');
    wallet = paid.wallet;
    ledger = appendEntry(ledger, paid.entry);
  }

  const charged: Account = { ...account, wallet, ledger };
  const paidOut = deliverRewards(charged, [prize.reward], lookup, stamp, 'gacha', GACHA_EVENT_ID);
  if (!paidOut.ok) return failed(account, paidOut.error);

  const state = stateOf(account.gacha);
  const win: GachaWin = {
    id: winId,
    at: now.toISOString(),
    prizeId: prize.id,
    name: prizeName(prize, label),
    rarity: prize.rarity,
  };

  return {
    ok: true,
    error: null,
    prize,
    card: paidOut.cards[0] ?? null,
    win,
    account: {
      ...paidOut.account,
      gacha: {
        spins: state.spins + 1,
        history: [win, ...state.history].slice(0, HISTORY_LIMIT),
      },
    },
  };
}
