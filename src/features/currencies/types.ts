import type { Entity } from '@/types/common';

export type CurrencyKind = 'exchange' | 'gem' | 'fcpoint' | 'ticket';

/**
 * Static description of a currency: what it looks like and how it behaves.
 * Balances are NOT here — they belong to an account. See Wallet below.
 */
export interface CurrencyDefinition {
  kind: CurrencyKind;
  label: string;
  /** Resolved asset URL. The artwork carries its own frame. */
  icon: string;
  /**
   * Rendered box size in design pixels. Per-currency because the supplied icons
   * fill their canvas differently — a round medallion needs more room than a bare
   * gem to read at the same optical weight.
   */
  iconSize: number;
  /** Whether the "+" affordance is shown in the top bar. */
  purchasable: boolean;
}

/** Balances, one integer per currency. Always whole numbers, never negative. */
export type Wallet = Record<CurrencyKind, number>;

export type CurrencyCatalogue = Record<CurrencyKind, CurrencyDefinition>;

/** Why a balance moved. Kept short — it is shown in the admin ledger. */
export type WalletReason =
  | 'signup-grant'
  | 'admin-grant'
  | 'admin-set'
  | 'purchase'
  | 'reward'
  | 'refund'
  /** A card exchanged back for points in the signing market. */
  | 'sale';

export interface WalletEntry extends Entity {
  kind: CurrencyKind;
  /** Signed. Negative means the balance went down. */
  delta: number;
  balanceAfter: number;
  reason: WalletReason;
  at: string;
  /** Username of the admin responsible, when the change was minted by hand. */
  by?: string;
}

export type WalletError = 'invalid-amount' | 'insufficient-funds' | 'at-cap';

export interface WalletResult {
  ok: boolean;
  error: WalletError | null;
  wallet: Wallet;
  entry: WalletEntry | null;
}
