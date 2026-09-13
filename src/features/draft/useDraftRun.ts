import { useCallback } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { addPlayers } from '@/features/club/club';
import type { OwnedPlayer } from '@/features/club/types';
import { useWallet } from '@/features/currencies/useWallet';
import { normalizeCounters, pull, type PullOutcome } from './pull';
import type { DraftCounters, DraftEvent, DraftPack } from './types';

export type DraftRunError = 'empty-pool' | 'insufficient-funds' | 'limit-reached' | 'not-live';

export interface DraftRunResult {
  ok: boolean;
  error: DraftRunError | null;
  outcomes: PullOutcome[];
}

function ownedId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DraftRunApi {
  /** Live pity counters for an event, repaired against its current rules. */
  countersFor(event: DraftEvent): DraftCounters;
  run(event: DraftEvent, pack: DraftPack): DraftRunResult;
  totalPulls(eventId: string): number;
  /** How many times this account has bought a limited pack. */
  purchasesOf(eventId: string, packId: string): number;
  /** Remaining buys, or null when the pack has no limit. */
  remainingOf(eventId: string, pack: DraftPack): number | null;
}

/**
 * Spends, draws, advances the pity counters, and files the results in the club — in
 * that order, as one account update.
 *
 * The pool is checked before the currency is spent. Refunding after a failed draw
 * would mean two ledger entries for something that never happened, and a pull that
 * cannot produce a card is a configuration error, not a transaction.
 */
export function useDraftRun(): DraftRunApi {
  const { account, updateAccount } = useAuth();
  const { spend } = useWallet();

  const countersFor = useCallback(
    (event: DraftEvent) =>
      normalizeCounters(account?.draftProgress?.[event.id]?.counters, event.pity),
    [account],
  );

  const totalPulls = useCallback(
    (eventId: string) => account?.draftProgress?.[eventId]?.pulls ?? 0,
    [account],
  );

  const purchasesOf = useCallback(
    (eventId: string, packId: string) =>
      account?.draftProgress?.[eventId]?.purchases?.[packId] ?? 0,
    [account],
  );

  const remainingOf = useCallback(
    (eventId: string, pack: DraftPack): number | null => {
      const limit = pack.limitPerAccount ?? 0;
      if (limit <= 0) return null;
      return Math.max(0, limit - purchasesOf(eventId, pack.id));
    },
    [purchasesOf],
  );

  const run = useCallback(
    (event: DraftEvent, pack: DraftPack): DraftRunResult => {
      if (event.pool.length === 0) {
        return { ok: false, error: 'empty-pool', outcomes: [] };
      }

      // A hidden or expired event can still be reached through a stale deep link, so
      // the check belongs here rather than only in the screen that draws the buttons.
      if (!event.live) return { ok: false, error: 'not-live', outcomes: [] };

      const limit = pack.limitPerAccount ?? 0;
      const bought = account?.draftProgress?.[event.id]?.purchases?.[pack.id] ?? 0;
      // Checked before spending, for the same reason the pool is: a refund means two
      // ledger entries for a transaction that never happened.
      if (limit > 0 && bought >= limit) {
        return { ok: false, error: 'limit-reached', outcomes: [] };
      }

      const paid = spend(pack.currency, pack.cost, 'purchase');
      if (!paid.ok) return { ok: false, error: 'insufficient-funds', outcomes: [] };

      const counters = normalizeCounters(
        account?.draftProgress?.[event.id]?.counters,
        event.pity,
      );
      const result = pull(event, counters, pack.pulls);

      const acquiredAt = new Date().toISOString();
      const owned: OwnedPlayer[] = result.outcomes.map((outcome) => ({
        id: ownedId(),
        playerId: outcome.player.id,
        eventId: event.id,
        name: outcome.player.name,
        rating: outcome.player.rating,
        position: outcome.player.position,
        set: outcome.player.set,
        nation: outcome.player.nation,
        club: outcome.player.club,
        portrait: outcome.player.portrait,
        acquiredAt,
      }));

      updateAccount((current) => ({
        ...current,
        draftProgress: {
          ...current.draftProgress,
          [event.id]: {
            pulls: (current.draftProgress?.[event.id]?.pulls ?? 0) + result.outcomes.length,
            counters: result.counters,
            // Only written for packs that carry a limit — an unlimited pack has no
            // reason to grow the save file every time it is pressed.
            //
            // Spread rather than assigned, so the key is absent instead of set to
            // `undefined` when there is nothing to record. Firestore rejects an
            // undefined field outright, and the game should not be storing one either.
            ...(limit > 0
              ? {
                  purchases: {
                    ...current.draftProgress?.[event.id]?.purchases,
                    [pack.id]: bought + 1,
                  },
                }
              : current.draftProgress?.[event.id]?.purchases
                ? { purchases: current.draftProgress[event.id]!.purchases }
                : {}),
          },
        },
        club: addPlayers(current.club, owned),
      }));

      return { ok: true, error: null, outcomes: result.outcomes };
    },
    [account, spend, updateAccount],
  );

  return { countersFor, run, totalPulls, purchasesOf, remainingOf };
}
