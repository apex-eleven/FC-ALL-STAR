import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { REDEEM_EVENT_ID, normalizeCodeText } from './constants';
import type { RedeemCode, RedeemConfig, RedeemError, RedeemProgress } from './types';

/**
 * Pure redemption rules. No storage, no React — the caller fixes the clock and the
 * stamp before `updateAccount`, so a mutator that runs twice lands on the same
 * rewards and the same card ids.
 */

export function emptyProgress(): RedeemProgress {
  return { used: {} };
}

export function progressOf(account: Pick<Account, 'redeem'>): RedeemProgress {
  return account.redeem ?? emptyProgress();
}

/** Times this account has already used a code. */
export function usedCount(progress: RedeemProgress, code: RedeemCode): number {
  return progress.used[code.id]?.count ?? 0;
}

/** Uses this account has left, or null when the code has no per-account limit. */
export function remainingOf(progress: RedeemProgress, code: RedeemCode): number | null {
  if (code.perAccount <= 0) return null;
  return Math.max(0, code.perAccount - usedCount(progress, code));
}

/** The code a typed string names, ignoring case and stray spacing. Null when none. */
export function findCode(config: RedeemConfig, typed: string): RedeemCode | null {
  const wanted = normalizeCodeText(typed);
  if (!wanted) return null;
  return config.codes.find((code) => code.code === wanted) ?? null;
}

/** Why a code cannot be used right now, or null when it can. */
export function refuse(
  config: RedeemConfig,
  code: RedeemCode,
  progress: RedeemProgress,
  now: Date,
): RedeemError | null {
  if (!config.enabled) return 'closed';
  if (!code.enabled) return 'disabled';
  if (code.startAt && now.getTime() < Date.parse(code.startAt)) return 'not-started';
  if (code.endAt && now.getTime() > Date.parse(code.endAt)) return 'expired';
  if (code.rewards.length === 0) return 'empty';
  const left = remainingOf(progress, code);
  if (left !== null && left <= 0) return 'used';
  return null;
}

export interface RedeemInput {
  config: RedeemConfig;
  /** As the player typed it. */
  typed: string;
  now: Date;
  lookup: CardLookup;
  stamp: ShopStamp;
}

export type RedeemOutcome =
  | { ok: true; error: null; account: Account; code: RedeemCode; rewards: ShopReward[]; cards: OwnedPlayer[] }
  | { ok: false; error: RedeemError; account: Account; code: RedeemCode | null; rewards: []; cards: [] };

function failed(account: Account, error: RedeemError, code: RedeemCode | null = null): RedeemOutcome {
  return { ok: false, error, account, code, rewards: [], cards: [] };
}

/**
 * Uses a code: pays its rewards and files the use — one new account, so a code can
 * never be marked used without paying or pay without being marked.
 *
 * The all-or-nothing rules come from `deliverRewards`: a wallet at its cap, a full
 * club or a card the admin has since deleted refuses the whole thing, and the code
 * stays unused so the player can try again once there is room.
 */
export function redeem(account: Account, input: RedeemInput): RedeemOutcome {
  const { config, typed, now, lookup, stamp } = input;

  if (!config.enabled) return failed(account, 'closed');
  if (!normalizeCodeText(typed)) return failed(account, 'blank');

  const code = findCode(config, typed);
  // A wrong code and a deleted one look the same from here, which is the point: it
  // should not be possible to probe the list for codes that exist but are not live.
  if (!code) return failed(account, 'unknown');

  const progress = progressOf(account);
  const refused = refuse(config, code, progress, now);
  if (refused) return failed(account, refused, code);

  const paid = deliverRewards(account, code.rewards, lookup, stamp, 'redeem', REDEEM_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error, code);

  return {
    ok: true,
    error: null,
    code,
    rewards: [...code.rewards],
    cards: paid.cards,
    account: {
      ...paid.account,
      redeem: {
        used: {
          ...progress.used,
          [code.id]: { count: usedCount(progress, code) + 1, at: now.toISOString() },
        },
      },
    },
  };
}
