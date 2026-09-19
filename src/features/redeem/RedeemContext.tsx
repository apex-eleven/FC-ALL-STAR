import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import type { OwnedPlayer } from '@/features/club/types';
import { defaultRedeem } from './constants';
import { progressOf, redeem as applyRedeem } from './redeem';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './redeemConfigStore';
import type { RedeemCode, RedeemConfig, RedeemError, RedeemProgress } from './types';

export interface RedeemResult {
  ok: boolean;
  error: RedeemError | null;
  /** The code that was matched, even when it was refused. Null when nothing matched. */
  code: RedeemCode | null;
  rewards: ShopReward[];
  cards: OwnedPlayer[];
}

interface RedeemValue {
  config: RedeemConfig;
  replace(next: RedeemConfig): SaveResult;
  reset(): SaveResult;
  /** Codes the signed-in account has already used. */
  progress: RedeemProgress;
  /** Pays a typed code's rewards and files the use. */
  redeem(typed: string): RedeemResult;
}

const RedeemContext = createContext<RedeemValue | null>(null);

export function RedeemProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<RedeemConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: RedeemConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultRedeem()), [replace]);

  const redeem = useCallback(
    (typed: string): RedeemResult => {
      if (!account) return { ok: false, error: 'closed', code: null, rewards: [], cards: [] };

      // Clock and stamp are fixed here: `updateAccount` may run its mutator twice,
      // and both runs have to hand over the same cards with the same ids.
      const now = new Date();
      const stamp = shopStamp();
      const run = (target: typeof account) =>
        applyRedeem(target, { config, typed, now, lookup: byId, stamp });

      const preview = run(account);
      if (!preview.ok) {
        return { ok: false, error: preview.error, code: preview.code, rewards: [], cards: [] };
      }

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });

      return {
        ok: true,
        error: null,
        code: preview.code,
        rewards: preview.rewards,
        cards: preview.cards,
      };
    },
    [account, config, byId, updateAccount],
  );

  const progress = useMemo(() => progressOf(account ?? { redeem: undefined }), [account]);

  const value = useMemo<RedeemValue>(
    () => ({ config, replace, reset, progress, redeem }),
    [config, replace, reset, progress, redeem],
  );

  return <RedeemContext.Provider value={value}>{children}</RedeemContext.Provider>;
}

export function useRedeem(): RedeemValue {
  const value = useContext(RedeemContext);
  if (!value) throw new Error('useRedeem must be used inside a RedeemProvider');
  return value;
}
