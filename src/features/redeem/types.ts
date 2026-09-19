import type { ShopReward } from '@/features/shop/types';

/**
 * Redeem codes (แลกโค้ด).
 *
 * An admin writes a code, hangs a reward list on it, and hands the code out however
 * they like — LINE, a stream, a poster. A player types it in and the rewards are paid
 * through the same path as a shop purchase or a gacha prize.
 *
 * What this deliberately does *not* have is a global "used N of 100 times" counter.
 * The code list is admin config, shared read-only; a player cannot write to it, so a
 * total cap would be counted per browser and would not mean anything. The limit that
 * can be honoured is the per-account one, and that is the one that exists.
 */

export interface RedeemCode {
  id: string;
  /** Stored as typed, matched case-insensitively. A–Z, 0–9, `-` and `_`. */
  code: string;
  enabled: boolean;
  /** Shown to the player once the code goes through. Empty = the code itself. */
  name: string;
  rewards: ShopReward[];
  /** Times one account may use this code. 0 = no limit. */
  perAccount: number;
  /** ISO timestamps or ''. Outside the window the code is refused. */
  startAt: string;
  endAt: string;
}

export interface RedeemConfig {
  enabled: boolean;
  /** Screen heading. */
  title: string;
  /** Small print under the input. */
  note: string;
  codes: RedeemCode[];
}

export type RedeemError =
  | 'closed'
  | 'blank'
  | 'unknown'
  | 'disabled'
  | 'not-started'
  | 'expired'
  | 'used'
  | 'empty'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';

/** One code this account has used, and how many times. */
export interface RedeemUse {
  count: number;
  /** Most recent use. */
  at: string;
}

export interface RedeemProgress {
  /** Keyed by code id, not by the code text — an admin may rename a code. */
  used: Record<string, RedeemUse>;
}
