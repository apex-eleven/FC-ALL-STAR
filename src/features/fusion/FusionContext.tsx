import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Account } from '@/features/auth/types';
import { useAuth } from '@/features/auth/AuthContext';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { defaultFusion, fusionId } from './constants';
import { claim, deal, discard, stateOf, type ClaimOutcome, type DealOutcome } from './fusion';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './fusionConfigStore';
import type { FusionConfig, FusionError, FusionPick, FusionState } from './types';

/** Names a reward line, so a prize reads as a name rather than an id. */
export type RewardName = (reward: ShopReward) => string;

export interface DealResult {
  ok: boolean;
  error: FusionError | null;
  /** The hand now on the table, face down. */
  picks: FusionPick[];
}

export interface ClaimResult {
  ok: boolean;
  error: FusionError | null;
  pick: FusionPick | null;
}

interface FusionValue {
  config: FusionConfig;
  replace(next: FusionConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's bench: the hand on the table and recent keeps. */
  state: FusionState;
  /**
   * Burns the chosen cards and deals a hand face down.
   *
   * `describe` names a reward — the caller's job, because the names live in the
   * catalogues the screen already reads (`useRewardView`), not in this feature.
   */
  fuse(chosen: readonly string[], describe: RewardName): DealResult;
  /** Turns one card of the hand over and keeps it. The rest are torn up. */
  take(index: number): ClaimResult;
  /** Throws the hand away — the escape hatch when nothing on it can be paid. */
  drop(): void;
}

const FusionContext = createContext<FusionValue | null>(null);

export function FusionProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate, like the gachapon.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<FusionConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: FusionConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultFusion()), [replace]);

  const fuse = useCallback(
    (chosen: readonly string[], describe: RewardName): DealResult => {
      if (!account) return { ok: false, error: 'closed', picks: [] };

      // Rolls, clock and id are fixed here: `updateAccount` may run its mutator twice,
      // and both runs have to deal the same hand.
      const rolls = Array.from({ length: Math.max(1, Math.floor(config.draws)) }, () =>
        Math.random(),
      );
      const now = new Date();
      const offerId = fusionId('fo');
      const run = (target: Account): DealOutcome =>
        deal(target, {
          config,
          chosen,
          rolls,
          now,
          offerId,
          label: (prize) => describe(prize.reward),
        });

      const preview = run(account);
      if (!preview.ok || !preview.offer) return { ok: false, error: preview.error, picks: [] };

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });

      return { ok: true, error: null, picks: preview.offer.picks };
    },
    [account, config, updateAccount],
  );

  const take = useCallback(
    (index: number): ClaimResult => {
      if (!account) return { ok: false, error: 'closed', pick: null };

      const now = new Date();
      const winId = fusionId('win');
      const stamp = shopStamp();
      const run = (target: Account): ClaimOutcome =>
        claim(target, { index, now, winId, lookup: byId, stamp });

      const preview = run(account);
      if (!preview.ok) return { ok: false, error: preview.error, pick: null };

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });

      return { ok: true, error: null, pick: preview.pick };
    },
    [account, byId, updateAccount],
  );

  const drop = useCallback(() => {
    updateAccount((current) => discard(current));
  }, [updateAccount]);

  const state = useMemo(() => stateOf(account?.fusion), [account?.fusion]);

  const value = useMemo<FusionValue>(
    () => ({ config, replace, reset, state, fuse, take, drop }),
    [config, replace, reset, state, fuse, take, drop],
  );

  return <FusionContext.Provider value={value}>{children}</FusionContext.Provider>;
}

export function useFusion(): FusionValue {
  const value = useContext(FusionContext);
  if (!value) throw new Error('useFusion must be used inside a FusionProvider');
  return value;
}
