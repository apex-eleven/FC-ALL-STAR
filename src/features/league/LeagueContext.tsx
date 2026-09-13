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
import { appendEntry, credit } from '@/features/currencies/wallet';
import { indexOwned, squadRating } from '@/features/squad/squad';
import { syncOwned } from '@/features/club/sync';
import { usePlayers } from '@/features/players/PlayerContext';
import { loadConfig, saveConfig, normalizeConfig, type SaveResult } from './leagueConfigStore';
import { advance, emptyLeague, rankOf, rewardFor } from './standings';
import type { LeagueConfig, LeagueState } from './types';

interface LeagueValue {
  config: LeagueConfig;
  state: LeagueState;
  rank: number;
  /** The player's squad rating — the number the simulation plays with. */
  rating: number;
  updateConfig(changes: Partial<LeagueConfig>): SaveResult;
  resetConfig(): SaveResult;
  /** Clears the end-of-season summary once the player has seen it. */
  dismissResult(): void;
  /** Admin: set an account's star total by hand. */
  setStars(stars: number): void;
  /** Admin: wipe the current season and start it again. */
  restartSeason(): void;
}

const LeagueContext = createContext<LeagueValue | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  // Read through useAuth, not useAccount: this provider sits above the sign-in gate,
  // and useAccount throws while signed out — which took the whole app down to a blank
  // screen rather than showing the login form.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<LeagueConfig>(loadConfig);

  const state = account?.league ?? emptyLeague();

  const rating = useMemo(() => {
    if (!account) return 0;
    const owned = indexOwned(syncOwned(account.club.players, byId));
    return squadRating(account.squad, owned);
  }, [account, byId]);

  /**
   * Catches the league up with the clock, and pays out if the day rolled over.
   *
   * Runs on mount and whenever the account or the config changes rather than on a
   * timer: a fixture is derived from the time having passed, so the only moment that
   * matters is when somebody looks.
   */
  useEffect(() => {
    if (!account) return;

    const result = advance({
      state,
      config,
      accountId: account.id,
      rating,
      now: new Date(),
    });
    if (!result.changed) return;

    updateAccount((current) => {
      let wallet = current.wallet;
      let ledger = current.ledger;

      // The reward is credited here, in the same write that clears the season, so a
      // reload between the two cannot pay twice or lose the prize.
      if (result.finished) {
        for (const entry of result.finished.rewards) {
          const credited = credit(wallet, entry.kind, entry.amount, { reason: 'reward' });
          wallet = credited.wallet;
          ledger = appendEntry(ledger, credited.entry);
        }
      }

      return { ...current, wallet, ledger, league: result.state };
    });
    // `state` is read from the account, which updateAccount replaces — depending on it
    // directly would loop. The account object identity is the honest trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, config, rating, updateAccount]);

  const commit = useCallback((next: LeagueConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const updateConfig = useCallback(
    (changes: Partial<LeagueConfig>) => commit({ ...config, ...changes }),
    [config, commit],
  );

  const resetConfig = useCallback(() => commit(normalizeConfig(null)), [commit]);

  const dismissResult = useCallback(() => {
    updateAccount((current) => ({
      ...current,
      league: { ...(current.league ?? emptyLeague()), pending: null },
    }));
  }, [updateAccount]);

  const setStars = useCallback(
    (stars: number) => {
      updateAccount((current) => ({
        ...current,
        league: {
          ...(current.league ?? emptyLeague()),
          stars: Math.max(config.starFloor, Math.round(stars)),
        },
      }));
    },
    [updateAccount, config.starFloor],
  );

  const restartSeason = useCallback(() => {
    updateAccount((current) => ({ ...current, league: emptyLeague() }));
  }, [updateAccount]);

  const value = useMemo<LeagueValue>(
    () => ({
      config,
      state,
      rank: rankOf(state),
      rating,
      updateConfig,
      resetConfig,
      dismissResult,
      setStars,
      restartSeason,
    }),
    [config, state, rating, updateConfig, resetConfig, dismissResult, setStars, restartSeason],
  );

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeague(): LeagueValue {
  const value = useContext(LeagueContext);
  if (!value) throw new Error('useLeague must be used inside a LeagueProvider');
  return value;
}

export { rewardFor };
