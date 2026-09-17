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
import { spin, stateOf, type GachaSpinOutcome } from './gacha';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './gachaConfigStore';
import type { GachaConfig, GachaError, GachaPrize, GachaState, GachaWin } from './types';

/** Names a reward line, so a win reads as a name rather than an id. */
export type RewardName = (reward: ShopReward) => string;

export interface GachaSpinResult {
  ok: boolean;
  error: GachaError | null;
  prize: GachaPrize | null;
  win: GachaWin | null;
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
   * Charges the keys, pays one prize, and files the win.
   *
   * `describe` names a reward — the caller's job, because the names live in the
   * catalogues the screen already reads (`useRewardView`), not in this feature.
   */
  spinOnce(describe: RewardName): GachaSpinResult;
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

  const spinOnce = useCallback(
    (describe: RewardName): GachaSpinResult => {
      if (!account) return { ok: false, error: 'closed', prize: null, win: null };
      // Roll, clock, id and stamp are fixed here: `updateAccount` may run its mutator
      // twice, and both runs have to land on the same prize and file the same win.
      const roll = Math.random();
      const now = new Date();
      const winId = gachaId('win');
      const stamp = shopStamp();
      const run = (target: Account): GachaSpinOutcome => {
        const chosen = { config, roll, now, winId, lookup: byId, stamp, label: '' };
        // The label needs the prize, so the prize is rolled first and named second.
        const preview = spin(target, chosen);
        if (!preview.ok || !preview.prize) return preview;
        return spin(target, { ...chosen, label: describe(preview.prize.reward) });
      };

      const preview = run(account);
      if (!preview.ok) return { ok: false, error: preview.error, prize: null, win: null };

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });

      if (isCloudEnabled() && preview.prize?.announce && preview.win) {
        void publishGachaWin({
          uid: account.id,
          username: displayNameOf(account),
          avatarId: account.avatarId,
          prize: preview.win.name,
          rarity: preview.win.rarity,
          at: preview.win.at,
        }).then((sent) => {
          if (sent) refreshFeed();
        });
      }

      return { ok: true, error: null, prize: preview.prize, win: preview.win };
    },
    [account, config, byId, updateAccount, refreshFeed],
  );

  const state = useMemo(() => stateOf(account?.gacha), [account?.gacha]);

  const value = useMemo<GachaValue>(
    () => ({ config, replace, reset, state, feed, refreshFeed, spinOnce }),
    [config, replace, reset, state, feed, refreshFeed, spinOnce],
  );

  return <GachaContext.Provider value={value}>{children}</GachaContext.Provider>;
}

export function useGacha(): GachaValue {
  const value = useContext(GachaContext);
  if (!value) throw new Error('useGacha must be used inside a GachaProvider');
  return value;
}
