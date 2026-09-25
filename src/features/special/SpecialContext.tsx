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
import type { OwnedPlayer } from '@/features/club/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import { defaultSpecial } from './constants';
import { buy as applyBuy, progressOf } from './special';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './specialConfigStore';
import type { SpecialConfig, SpecialError, SpecialOffer, SpecialProgress } from './types';

export interface SpecialBuyResult {
  ok: boolean;
  error: SpecialError | null;
  offer: SpecialOffer | null;
  card: OwnedPlayer | null;
}

interface SpecialValue {
  config: SpecialConfig;
  replace(next: SpecialConfig): SaveResult;
  reset(): SaveResult;
  /** Offers the signed-in account has bought. */
  progress: SpecialProgress;
  /** Buys an offer's special card with Special Point. */
  buy(offerId: string): SpecialBuyResult;
}

const SpecialContext = createContext<SpecialValue | null>(null);

export function SpecialProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<SpecialConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const replace = useCallback((next: SpecialConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultSpecial()), [replace]);

  const buy = useCallback(
    (offerId: string): SpecialBuyResult => {
      if (!account) return { ok: false, error: 'closed', offer: null, card: null };

      // Clock and stamp are fixed here: `updateAccount` may run its mutator twice, and
      // both runs have to hand over the same card with the same id.
      const now = new Date();
      const stamp = shopStamp();
      const run = (target: typeof account) => applyBuy(target, { config, offerId, now, lookup: byId, stamp });

      // Charge after validating: the preview refuses before anything is written.
      const preview = run(account);
      if (!preview.ok) return { ok: false, error: preview.error, offer: preview.offer, card: null };

      updateAccount((current) => {
        const outcome = run(current);
        return outcome.ok ? outcome.account : current;
      });

      return { ok: true, error: null, offer: preview.offer, card: preview.card };
    },
    [account, config, byId, updateAccount],
  );

  const progress = useMemo(() => progressOf(account ?? { special: undefined }), [account]);

  const value = useMemo<SpecialValue>(
    () => ({ config, replace, reset, progress, buy }),
    [config, replace, reset, progress, buy],
  );

  return <SpecialContext.Provider value={value}>{children}</SpecialContext.Provider>;
}

export function useSpecial(): SpecialValue {
  const value = useContext(SpecialContext);
  if (!value) throw new Error('useSpecial must be used inside a SpecialProvider');
  return value;
}
