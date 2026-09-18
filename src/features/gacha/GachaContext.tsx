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
import { displayNameOf } from '@/features/auth/constants';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { fetchGachaFeed, publishGachaWin, type GachaFeedRow } from '@/features/cloud/cloudGachaFeed';
import { isCloudEnabled } from '@/features/cloud/firebase';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { defaultGacha, gachaId } from './constants';
import { spinMany, stateOf, type BatchOutcome } from './gacha';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './gachaConfigStore';
import type { GachaConfig, GachaError, GachaPrize, GachaState, GachaWin } from './types';

/** Names a reward line, so a win reads as a name rather than an id. */
export type RewardName = (reward: ShopReward) => string;

export interface GachaSpinResult {
  /** At least one spin was paid. */
  ok: boolean;
  /** Why the run stopped early, or null when every spin went through. */
  error: GachaError | null;
  prizes: GachaPrize[];
  wins: GachaWin[];
}

interface GachaValue {
  config: GachaConfig;
  replace(next: GachaConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's spins and recent wins. */
  state: GachaState;
  /** Newest wins from every player; null until the first fetch. */
  feed: GachaFeedRow[] | null;
  refreshFeed(): void;
  /**
   * Charges the keys, pays the prizes, and files the wins — `count` spins in one go.
   *
   * `describe` names a reward — the caller's job, because the names live in the
   * catalogues the screen already reads (`useRewardView`), not in this feature.
   */
  spin(count: number, describe: RewardName): GachaSpinResult;
}

const GachaContext = createContext<GachaValue | null>(null);

export function GachaProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<GachaConfig>(loadConfig);
  const [feed, setFeed] = useState<GachaFeedRow[] | null>(null);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: GachaConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultGacha()), [replace]);

  const refreshFeed = useCallback(() => {
    void fetchGachaFeed().then(setFeed);
  }, []);

  const spin = useCallback(
    (count: number, describe: RewardName): GachaSpinResult => {
      if (!account) return { ok: false, error: 'closed', prizes: [], wins: [] };
      // Rolls, clock, ids and stamp are fixed here: `updateAccount` may run its mutator
      // twice, and both runs have to land on the same prizes and file the same wins.
      const rolls = Array.from({ length: Math.max(1, Math.floor(count)) }, () => Math.random());
      const now = new Date();
      const winIds = rolls.map(() => gachaId('win'));
      const stamp = shopStamp();
      const run = (target: Account): BatchOutcome => {
        const chosen = { config, rolls, now, winIds, lookup: byId, stamp, labels: [] as string[] };
        // A label needs its prize, so the prizes are rolled first and named second.
        const preview = spinMany(target, chosen);
        if (!preview.ok) return preview;
        return spinMany(target, {
          ...chosen,
          labels: preview.prizes.map((prize) => describe(prize.reward)),
        });
      };

      const preview = run(account);
      if (!preview.ok) return { ok: false, error: preview.error, prizes: [], wins: [] };

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });

      if (isCloudEnabled()) {
        const announced = preview.wins.filter((_, index) => preview.prizes[index]?.announce);
        if (announced.length > 0) {
          void Promise.all(
            announced.map((win) =>
              publishGachaWin({
                uid: account.id,
                username: displayNameOf(account),
                avatarId: account.avatarId,
                prize: win.name,
                rarity: win.rarity,
                at: win.at,
              }),
            ),
          ).then((sent) => {
            if (sent.some(Boolean)) refreshFeed();
          });
        }
      }

      return { ok: true, error: preview.error, prizes: preview.prizes, wins: preview.wins };
    },
    [account, config, byId, updateAccount, refreshFeed],
  );

  const state = useMemo(() => stateOf(account?.gacha), [account?.gacha]);

  const value = useMemo<GachaValue>(
    () => ({ config, replace, reset, state, feed, refreshFeed, spin }),
    [config, replace, reset, state, feed, refreshFeed, spin],
  );

  return <GachaContext.Provider value={value}>{children}</GachaContext.Provider>;
}

export function useGacha(): GachaValue {
  const value = useContext(GachaContext);
  if (!value) throw new Error('useGacha must be used inside a GachaProvider');
  return value;
}
