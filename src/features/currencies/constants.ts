import type { CurrencyKind, Wallet } from './types';

/** Every currency, in canonical order. */
export const CURRENCY_ORDER: readonly CurrencyKind[] = ['exchange', 'gem', 'fcpoint', 'ticket', 'special'];

/**
 * Which currencies each screen shows. The reference puts draft tickets in the first
 * slot on the draft screen and exchange points there on the home screen, so the top
 * bar is per-screen rather than global.
 */
export const HOME_CURRENCIES: readonly CurrencyKind[] = ['exchange', 'gem', 'fcpoint'];
export const DRAFT_CURRENCIES: readonly CurrencyKind[] = ['ticket', 'gem', 'fcpoint'];

/**
 * Hard ceiling per currency. Keeps balances inside the range where JavaScript
 * integers are exact and stops a fat-fingered admin grant from producing a number
 * that overflows the top bar.
 */
export const MAX_BALANCE = 999_999_999;

/** Largest single admin grant, as a guard against a stray extra zero. */
export const MAX_GRANT = 100_000_000;

/**
 * What a brand new account starts with. Tune freely.
 *
 * Only new accounts are affected — an existing save keeps whatever it has, because
 * the wallet normaliser only falls back to these numbers for a currency that is
 * missing entirely.
 */
export const STARTING_WALLET: Wallet = {
  exchange: 10_000,
  gem: 10_000,
  fcpoint: 1_000,
  ticket: 150,
  special: 0,
};

/** How many ledger entries an account keeps. Oldest are dropped. */
export const LEDGER_LIMIT = 25;

/** Thousands separator used across the wallet. */
export const formatCurrency = (value: number): string => value.toLocaleString('en-US');
