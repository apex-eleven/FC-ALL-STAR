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
import { syncOwned } from '@/features/club/sync';
import type { OwnedPlayer } from '@/features/club/types';
import { usePlayers } from '@/features/players/PlayerContext';
import type { PlayerCard } from '@/features/players/types';
import { DEFAULT_BANDS, DEFAULT_TRANSFER } from './constants';
import {
  buy as buyCard,
  ownedId,
  sell as sellCards,
  toggleLock as lockCard,
  toggleWatch as watchCard,
  type BuyOutcome,
  type SellOutcome,
} from './transfer';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './transferConfigStore';
import type { CardPrice, TransferConfig } from './types';

export interface BuyResult {
  ok: boolean;
  error: BuyOutcome['error'];
  card: OwnedPlayer | null;
}

export interface SellResult {
  ok: boolean;
  error: SellOutcome['error'];
  sold: number;
  earned: number;
}

interface TransferValue {
  config: TransferConfig;
  update(changes: Partial<TransferConfig>): SaveResult;
  /** Sets one card's override. Passing null prices and `hidden: false` clears it. */
  setOverride(cardId: string, price: CardPrice): SaveResult;
  reset(): SaveResult;
  buy(card: PlayerCard): BuyResult;
  sell(ownedIds: readonly string[]): SellResult;
  /** False when the watch list is already full. */
  toggleWatch(cardId: string): boolean;
  toggleLock(ownedId: string): void;
}

const TransferContext = createContext<TransferValue | null>(null);

function freshDefaults(): TransferConfig {
  return { ...DEFAULT_TRANSFER, bands: DEFAULT_BANDS.map((band) => ({ ...band })), overrides: {} };
}

export function TransferProvider({ children }: { children: ReactNode }) {
  // useAuth rather than useAccount: this sits above the sign-in gate, where there is
  // no account yet and useAccount would throw.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<TransferConfig>(loadConfig);

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const commit = useCallback((next: TransferConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const update = useCallback(
    (changes: Partial<TransferConfig>) => commit({ ...config, ...changes }),
    [config, commit],
  );

  const setOverride = useCallback(
    (cardId: string, price: CardPrice) =>
      commit({ ...config, overrides: { ...config.overrides, [cardId]: price } }),
    [config, commit],
  );

  const reset = useCallback(() => commit(freshDefaults()), [commit]);

  const refresh = useCallback(
    (cards: readonly OwnedPlayer[]) => syncOwned(cards, byId),
    [byId],
  );

  /**
   * Checked against the account on screen, then applied to the latest save.
   *
   * The id and timestamp are fixed out here so every run of the mutator produces the
   * same card — the one the confirmation shows is the one in the club.
   */
  const buy = useCallback(
    (card: PlayerCard): BuyResult => {
      if (!account) return { ok: false, error: 'closed', card: null };
      const stamp = { id: ownedId(), at: new Date().toISOString() };
      const preview = buyCard(account, card, config, stamp);
      if (!preview.ok) return { ok: false, error: preview.error, card: null };

      updateAccount((current) => {
        const outcome = buyCard(current, card, config, stamp);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, card: preview.card };
    },
    [account, config, updateAccount],
  );

  const sell = useCallback(
    (ownedIds: readonly string[]): SellResult => {
      if (!account) return { ok: false, error: 'closed', sold: 0, earned: 0 };
      const preview = sellCards(account, ownedIds, config, refresh);
      if (!preview.ok) return { ok: false, error: preview.error, sold: 0, earned: 0 };

      updateAccount((current) => {
        const outcome = sellCards(current, ownedIds, config, refresh);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, sold: preview.sold, earned: preview.earned };
    },
    [account, config, refresh, updateAccount],
  );

  const toggleWatch = useCallback(
    (cardId: string): boolean => {
      if (!account) return false;
      if (!watchCard(account, cardId, config.watchLimit).ok) return false;
      updateAccount((current) => watchCard(current, cardId, config.watchLimit).account);
      return true;
    },
    [account, config.watchLimit, updateAccount],
  );

  const toggleLock = useCallback(
    (ownedCardId: string) => updateAccount((current) => lockCard(current, ownedCardId)),
    [updateAccount],
  );

  const value = useMemo<TransferValue>(
    () => ({ config, update, setOverride, reset, buy, sell, toggleWatch, toggleLock }),
    [config, update, setOverride, reset, buy, sell, toggleWatch, toggleLock],
  );

  return <TransferContext.Provider value={value}>{children}</TransferContext.Provider>;
}

export function useTransfer(): TransferValue {
  const value = useContext(TransferContext);
  if (!value) throw new Error('useTransfer must be used inside a TransferProvider');
  return value;
}
