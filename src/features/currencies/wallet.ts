import { CURRENCY_ORDER, LEDGER_LIMIT, MAX_BALANCE, STARTING_WALLET } from './constants';
import type {
  CurrencyKind,
  Wallet,
  WalletEntry,
  WalletReason,
  WalletResult,
} from './types';

function entryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Repairs a wallet read from storage. Accounts created before currencies existed
 * have no wallet at all, and a hand-edited record can hold anything, so every
 * balance is coerced to a whole number inside [0, MAX_BALANCE].
 */
export function normalizeWallet(value: unknown): Wallet {
  const source = (value ?? {}) as Partial<Record<CurrencyKind, unknown>>;
  const wallet = {} as Wallet;

  for (const kind of CURRENCY_ORDER) {
    const raw = source[kind];
    const amount = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : undefined;
    wallet[kind] = amount === undefined ? STARTING_WALLET[kind] : clamp(amount);
  }

  return wallet;
}

export function emptyWallet(): Wallet {
  return { exchange: 0, gem: 0, fcpoint: 0, ticket: 0, special: 0 };
}

export function startingWallet(): Wallet {
  return { ...STARTING_WALLET };
}

function clamp(amount: number): number {
  return Math.max(0, Math.min(MAX_BALANCE, amount));
}

export function canAfford(wallet: Wallet, kind: CurrencyKind, amount: number): boolean {
  return isValidAmount(amount) && wallet[kind] >= amount;
}

function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
}

export interface AdjustOptions {
  reason: WalletReason;
  by?: string;
}

/**
 * Adds to a balance. Returns a new wallet — never mutates the one passed in.
 * Hitting MAX_BALANCE is reported as an error so the caller can tell the user,
 * but the balance is still raised to the cap rather than left alone.
 */
export function credit(
  wallet: Wallet,
  kind: CurrencyKind,
  amount: number,
  options: AdjustOptions,
): WalletResult {
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'invalid-amount', wallet, entry: null };
  }

  const before = wallet[kind];
  const after = clamp(before + amount);
  const applied = after - before;
  const next = { ...wallet, [kind]: after };

  if (applied === 0) {
    return { ok: false, error: 'at-cap', wallet, entry: null };
  }

  return {
    ok: applied === amount,
    error: applied === amount ? null : 'at-cap',
    wallet: next,
    entry: makeEntry(kind, applied, after, options),
  };
}

/** Removes from a balance. Fails rather than going negative. */
export function debit(
  wallet: Wallet,
  kind: CurrencyKind,
  amount: number,
  options: AdjustOptions,
): WalletResult {
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'invalid-amount', wallet, entry: null };
  }
  if (wallet[kind] < amount) {
    return { ok: false, error: 'insufficient-funds', wallet, entry: null };
  }

  const after = wallet[kind] - amount;
  return {
    ok: true,
    error: null,
    wallet: { ...wallet, [kind]: after },
    entry: makeEntry(kind, -amount, after, options),
  };
}

/** Overwrites a balance outright. Admin only — normal play should credit/debit. */
export function setBalance(
  wallet: Wallet,
  kind: CurrencyKind,
  amount: number,
  options: AdjustOptions,
): WalletResult {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: 'invalid-amount', wallet, entry: null };
  }

  const after = clamp(amount);
  const delta = after - wallet[kind];

  return {
    ok: true,
    error: null,
    wallet: { ...wallet, [kind]: after },
    entry: makeEntry(kind, delta, after, options),
  };
}

function makeEntry(
  kind: CurrencyKind,
  delta: number,
  balanceAfter: number,
  { reason, by }: AdjustOptions,
): WalletEntry {
  return {
    id: entryId(),
    kind,
    delta,
    balanceAfter,
    reason,
    at: new Date().toISOString(),
    ...(by ? { by } : {}),
  };
}

/** Newest first, trimmed to LEDGER_LIMIT. */
export function appendEntry(
  ledger: readonly WalletEntry[] | undefined,
  entry: WalletEntry | null,
): WalletEntry[] {
  if (!entry) return [...(ledger ?? [])];
  return [entry, ...(ledger ?? [])].slice(0, LEDGER_LIMIT);
}
