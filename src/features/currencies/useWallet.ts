import { useCallback, useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import { emptyWallet, appendEntry, canAfford, credit, debit, setBalance } from './wallet';
import type { CurrencyKind, Wallet, WalletReason, WalletResult } from './types';

export interface WalletApi {
  balances: Wallet;
  /** Adds currency to the signed-in account. */
  earn(kind: CurrencyKind, amount: number, reason?: WalletReason): WalletResult;
  /** Removes currency. Fails rather than going negative. */
  spend(kind: CurrencyKind, amount: number, reason?: WalletReason): WalletResult;
  affords(kind: CurrencyKind, amount: number): boolean;
}

type Operation = (account: Account) => WalletResult;

/**
 * Wallet operations for the signed-in account.
 *
 * The pure helpers in wallet.ts do the arithmetic; this hook only wires them to the
 * account and persistence. Game systems should call earn/spend rather than writing
 * balances directly, so every change lands in the ledger.
 */
export function useWallet(): WalletApi {
  const { account, updateAccount } = useAuth();
  const balances = account?.wallet ?? emptyWallet();

  const run = useCallback(
    (operation: Operation): WalletResult => {
      if (!account) {
        return { ok: false, error: 'invalid-amount', wallet: emptyWallet(), entry: null };
      }

      const result = operation(account);
      if (!result.entry) return result;

      updateAccount((current) => ({
        ...current,
        wallet: result.wallet,
        ledger: appendEntry(current.ledger, result.entry),
      }));

      return result;
    },
    [account, updateAccount],
  );

  const earn = useCallback(
    (kind: CurrencyKind, amount: number, reason: WalletReason = 'reward') =>
      run((current) => credit(current.wallet, kind, amount, { reason })),
    [run],
  );

  const spend = useCallback(
    (kind: CurrencyKind, amount: number, reason: WalletReason = 'purchase') =>
      run((current) => debit(current.wallet, kind, amount, { reason })),
    [run],
  );

  const affords = useCallback(
    (kind: CurrencyKind, amount: number) => canAfford(balances, kind, amount),
    [balances],
  );

  return useMemo(() => ({ balances, earn, spend, affords }), [balances, earn, spend, affords]);
}

export interface AdminWalletApi {
  /** Mints currency into any account. Returns false if the account is gone. */
  grant(username: string, kind: CurrencyKind, amount: number): Promise<boolean>;
  /** Overwrites a balance outright. */
  set(username: string, kind: CurrencyKind, amount: number): Promise<boolean>;
}

/**
 * Admin-only wallet operations.
 *
 * Gating is the caller's job and is cosmetic anyway — with no server, anyone can
 * edit localStorage directly. See features/auth/README.md.
 */
export function useAdminWallet(): AdminWalletApi {
  const { account, updateOther } = useAuth();
  const by = account?.username;

  const apply = useCallback(
    (
      username: string,
      operation: (wallet: Wallet) => WalletResult,
    ): Promise<boolean> =>
      updateOther(username, (target) => {
        const result = operation(target.wallet);
        if (!result.entry) return target;
        return {
          ...target,
          wallet: result.wallet,
          ledger: appendEntry(target.ledger, result.entry),
        };
      }),
    [updateOther],
  );

  const grant = useCallback(
    (username: string, kind: CurrencyKind, amount: number) =>
      apply(username, (wallet) => credit(wallet, kind, amount, { reason: 'admin-grant', by })),
    [apply, by],
  );

  const set = useCallback(
    (username: string, kind: CurrencyKind, amount: number) =>
      apply(username, (wallet) => setBalance(wallet, kind, amount, { reason: 'admin-set', by })),
    [apply, by],
  );

  return useMemo(() => ({ grant, set }), [grant, set]);
}
