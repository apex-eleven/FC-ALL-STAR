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
import { defaultShop } from './constants';
import { buyWith, grantPurchase, type ShopBuyOutcome } from './shop';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './shopConfigStore';
import type { ShopConfig, ShopItem, ShopPayKind, ShopReward } from './types';

export interface ShopBuyResult {
  ok: boolean;
  error: ShopBuyOutcome['error'];
  payout: ShopReward[];
}

interface ShopValue {
  config: ShopConfig;
  /** Replaces the whole shop. The admin tab edits a draft and commits it here. */
  replace(next: ShopConfig): SaveResult;
  reset(): SaveResult;
  buy(item: ShopItem, kind: ShopPayKind): ShopBuyResult;
  /** Admin: deliver a baht purchase to another account. */
  grant(username: string, item: ShopItem): Promise<ShopBuyResult>;
}

const ShopContext = createContext<ShopValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount, updateOther } = useAuth();
  const [config, setConfig] = useState<ShopConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: ShopConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultShop()), [replace]);

  /**
   * Checked against the account on screen, then applied to the latest save with the
   * same clock — the mutator may run twice, and both runs must agree on the shop day.
   */
  const buy = useCallback(
    (item: ShopItem, kind: ShopPayKind): ShopBuyResult => {
      if (!account) return { ok: false, error: 'closed', payout: [] };
      const now = new Date();
      const preview = buyWith(account, item, kind, config, now);
      if (!preview.ok) return { ok: false, error: preview.error, payout: [] };

      updateAccount((current) => {
        const outcome = buyWith(current, item, kind, config, now);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, payout: preview.payout };
    },
    [account, config, updateAccount],
  );

  const grant = useCallback(
    async (username: string, item: ShopItem): Promise<ShopBuyResult> => {
      const now = new Date();
      const by = account?.username ?? 'admin';
      let result: ShopBuyResult = { ok: false, error: 'unavailable', payout: [] };

      const saved = await updateOther(username, (current) => {
        const outcome = grantPurchase(current, item, config, now, by);
        result = { ok: outcome.ok, error: outcome.error, payout: outcome.payout };
        return outcome.ok ? outcome.account : current;
      });
      return saved ? result : { ok: false, error: 'unavailable', payout: [] };
    },
    [account?.username, config, updateOther],
  );

  const value = useMemo<ShopValue>(
    () => ({ config, replace, reset, buy, grant }),
    [config, replace, reset, buy, grant],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopValue {
  const value = useContext(ShopContext);
  if (!value) throw new Error('useShop must be used inside a ShopProvider');
  return value;
}
