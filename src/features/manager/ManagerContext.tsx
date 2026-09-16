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
import { fetchLeaderboard } from '@/features/cloud/cloudLeaderboard';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { indexOwned, squadRating } from '@/features/squad/squad';
import { defaultManager, managerId } from './constants';
import {
  currentState,
  pickOpponent,
  playManagerMatch,
  type ManagerPlayOutcome,
} from './manager';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './managerConfigStore';
import type { ManagerConfig, ManagerState } from './types';

export type ManagerPlayResult = Omit<ManagerPlayOutcome, 'account'>;

interface ManagerValue {
  config: ManagerConfig;
  replace(next: ManagerConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's ladder as of now (season and week rolled over). */
  state: ManagerState | null;
  /** Squad OVR of the eleven on the pitch — what a match is played at. */
  rating: number;
  /**
   * This account's place on the OVR leaderboard, counted the way the leaderboard
   * screen numbers its rows. null when it is not on the fetched table (no cloud, not
   * published yet, or below the rows fetched).
   */
  leaderboardRank: number | null;
  /** Re-reads the published elevens opponents are drawn from. */
  refreshOpponents(): void;
  play(ranked: boolean): ManagerPlayResult;
}

const ManagerContext = createContext<ManagerValue | null>(null);

export function ManagerProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId } = usePlayers();
  const [config, setConfig] = useState<ManagerConfig>(loadConfig);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  // Re-read once a minute so the season and week roll over on an open screen.
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const replace = useCallback((next: ManagerConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultManager()), [replace]);

  const refreshOpponents = useCallback(() => {
    void fetchLeaderboard().then(setEntries);
  }, []);

  const rating = useMemo(() => {
    if (!account) return 0;
    const owned = indexOwned(syncOwned(account.club.players, byId));
    return squadRating(account.squad, owned);
  }, [account, byId]);

  const leaderboardRank = useMemo(() => {
    if (!account) return null;
    const index = entries.findIndex((entry) => entry.uid === account.id);
    return index >= 0 ? index + 1 : null;
  }, [account, entries]);

  const state = useMemo(
    () => (account ? currentState(account.manager, config, new Date(clock)) : null),
    [account, config, clock],
  );

  /**
   * Opponent, id, and clock are fixed out here, then the same match is applied to the
   * latest save — the mutator may run twice, and both runs must play the same game.
   */
  const play = useCallback(
    (ranked: boolean): ManagerPlayResult => {
      if (!account) return { ok: false, error: 'closed', match: null, paid: [] };
      const now = new Date();
      const matchId = managerId('m');
      const opponent = pickOpponent(`${account.id}:${matchId}`, account.id, rating, entries, config);
      const input = { ranked, opponent, rating, config, now, matchId };

      const preview = playManagerMatch(account, input);
      if (!preview.ok) return { ok: false, error: preview.error, match: null, paid: [] };

      updateAccount((current) => {
        const outcome = playManagerMatch(current, input);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, match: preview.match, paid: preview.paid };
    },
    [account, rating, entries, config, updateAccount],
  );

  const value = useMemo<ManagerValue>(
    () => ({ config, replace, reset, state, rating, leaderboardRank, refreshOpponents, play }),
    [config, replace, reset, state, rating, leaderboardRank, refreshOpponents, play],
  );

  return <ManagerContext.Provider value={value}>{children}</ManagerContext.Provider>;
}

export function useManager(): ManagerValue {
  const value = useContext(ManagerContext);
  if (!value) throw new Error('useManager must be used inside a ManagerProvider');
  return value;
}
