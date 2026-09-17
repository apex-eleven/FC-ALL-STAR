import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { syncOwned } from '@/features/club/sync';
import { fetchLeaderboard } from '@/features/cloud/cloudLeaderboard';
import {
  fetchManagerLadder,
  publishManagerRank,
  type ManagerLadderRow,
} from '@/features/cloud/cloudManagerLadder';
import { isCloudEnabled } from '@/features/cloud/firebase';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { indexOwned, squadRating } from '@/features/squad/squad';
import { FORFEIT_SCORE, defaultManager, managerId } from './constants';
import { resolveLadder, type LadderView } from './ladder';
import { botLineup, entryLineup, homeLineup } from './lineup';
import {
  currentState,
  pickOpponent,
  playManagerMatch,
  startPending,
  type ManagerPlayOutcome,
} from './manager';
import type { MatchSetup } from './matchEngine';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './managerConfigStore';
import type { ManagerConfig, ManagerOpponent, ManagerPlayError, ManagerState } from './types';

export type ManagerPlayResult = Omit<ManagerPlayOutcome, 'account'>;

/** Everything a live match needs, fixed at kick-off. */
export interface LiveMatch {
  id: string;
  ranked: boolean;
  opponent: ManagerOpponent;
  rating: number;
  setup: MatchSetup;
}

export type PrepareResult =
  | { ok: true; live: LiveMatch }
  | { ok: false; error: ManagerPlayError };

interface ManagerValue {
  config: ManagerConfig;
  replace(next: ManagerConfig): SaveResult;
  reset(): SaveResult;
  /** The signed-in account's ladder as of now (season and week rolled over). */
  state: ManagerState | null;
  /** Squad OVR of the eleven on the pitch — what a match is played at. */
  rating: number;
  /**
   * This account's place on the manager-rank leaderboard, counted the way the ladder
   * screen numbers its rows. null when it is not on the fetched table (no cloud, not
   * published yet, or below the rows fetched).
   */
  leaderboardRank: number | null;
  /** Real players ranked by manager tier and stars; null until first fetched. */
  ladder: LadderView[] | null;
  /** Re-reads the published elevens opponents are drawn from, and the rank ladder. */
  refreshOpponents(): void;
  /** Picks the opponent, builds both elevens, and (ranked) records the kick-off. */
  prepare(ranked: boolean): PrepareResult;
  /** Settles a finished live match with the score it ended on. */
  finish(live: LiveMatch, score: [number, number]): ManagerPlayResult;
  /** Leaves a live match early: a 0-3 loss if ranked, nothing if not. */
  forfeit(live: LiveMatch): ManagerPlayResult;
}

const ManagerContext = createContext<ManagerValue | null>(null);

/** Stands in for the lineups of a match settled without being played. */
const EMPTY_SETUP: MatchSetup = {
  home: [],
  away: [],
  homeBench: [],
  homeName: '',
  awayName: '',
  seed: '',
  duration: 1,
};

export function ManagerProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId, players } = usePlayers();
  const [config, setConfig] = useState<ManagerConfig>(loadConfig);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [ladderRows, setLadderRows] = useState<ManagerLadderRow[] | null>(null);
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

  const refreshLadder = useCallback(() => {
    void fetchManagerLadder().then(setLadderRows);
  }, []);

  const refreshOpponents = useCallback(() => {
    void fetchLeaderboard().then(setEntries);
    refreshLadder();
  }, [refreshLadder]);

  const rating = useMemo(() => {
    if (!account) return 0;
    const owned = indexOwned(syncOwned(account.club.players, byId));
    return squadRating(account.squad, owned);
  }, [account, byId]);

  const ladder = useMemo(
    () => (ladderRows ? resolveLadder(ladderRows, config, new Date(clock)) : null),
    [ladderRows, config, clock],
  );

  const accountId = account?.id ?? null;
  const leaderboardRank = useMemo(() => {
    if (!accountId || !ladder) return null;
    const index = ladder.findIndex((row) => row.uid === accountId);
    return index >= 0 ? index + 1 : null;
  }, [accountId, ladder]);

  const state = useMemo(
    () => (account ? currentState(account.manager, config, new Date(clock)) : null),
    [account, config, clock],
  );

  // Publish this account's rank whenever it changes, so other players see it on the
  // ladder. Accounts that never touched manager mode stay off it.
  const published = useRef('');
  const hasManager = Boolean(account?.manager);
  const username = account?.username ?? '';
  const avatarId = account?.avatarId ?? '';
  const tierId = state ? (config.tiers[state.tier]?.id ?? '') : '';
  const lastPlayed = state?.history.find((match) => match.ranked)?.at ?? '';
  useEffect(() => {
    if (!accountId || !state || !hasManager || !isCloudEnabled()) return;
    const signature = [accountId, username, avatarId, tierId, state.tier, state.stars, state.season].join('|');
    if (published.current === signature) return;
    published.current = signature;
    void publishManagerRank({
      uid: accountId,
      username,
      avatarId,
      tierId,
      tier: state.tier,
      stars: state.stars,
      season: state.season,
      // When the rank was reached, so ties keep whoever got there first ahead.
      updatedAt: lastPlayed || new Date().toISOString(),
    }).then((ok) => {
      if (ok) refreshLadder();
    });
  }, [accountId, username, avatarId, tierId, state, hasManager, lastPlayed, refreshLadder]);

  // The match this page is playing, so a pending one found on load can be told
  // apart from the one just kicked off.
  const activeId = useRef<string | null>(null);

  const settle = useCallback(
    (live: LiveMatch, score: [number, number], forfeit: boolean): ManagerPlayResult => {
      if (!account) return { ok: false, error: 'closed', match: null, paid: [] };
      const input = {
        ranked: live.ranked,
        opponent: live.opponent,
        rating: live.rating,
        config,
        now: new Date(),
        matchId: live.id,
        result: { score, forfeit },
      };
      const preview = playManagerMatch(account, input);
      activeId.current = null;
      if (!preview.ok) return { ok: false, error: preview.error, match: null, paid: [] };

      updateAccount((current) => {
        // A ranked match settles once: if its kick-off record is gone (settled or
        // forfeited from another tab), there is nothing left to apply.
        if (live.ranked && current.manager?.pending?.id !== live.id) return current;
        const outcome = playManagerMatch(current, input);
        return outcome.ok ? outcome.account : current;
      });
      return { ok: true, error: null, match: preview.match, paid: preview.paid };
    },
    [account, config, updateAccount],
  );

  const prepare = useCallback(
    (ranked: boolean): PrepareResult => {
      if (!account || !config.enabled) return { ok: false, error: 'closed' };
      if (rating <= 0) return { ok: false, error: 'no-squad' };

      const id = managerId('m');
      const opponent = pickOpponent(`${account.id}:${id}`, account.id, rating, entries, config);
      const entry = opponent.bot ? undefined : entries.find((row) => row.uid === opponent.id);
      const owned = indexOwned(syncOwned(account.club.players, byId));
      const home = homeLineup(account, owned);

      const live: LiveMatch = {
        id,
        ranked,
        opponent,
        rating,
        setup: {
          home: home.spots,
          away: entry
            ? entryLineup(entry)
            : botLineup(opponent, players, [
                ...home.spots.map((spot) => spot.player.name),
                ...home.bench.map((player) => player.name),
              ]),
          homeBench: home.bench,
          homeName: account.username,
          awayName: opponent.name,
          seed: `${account.id}:${id}`,
          duration: config.matchSeconds,
        },
      };

      activeId.current = id;
      if (ranked) {
        const pending = { id, at: new Date().toISOString(), opponent, rating };
        updateAccount((current) => startPending(current, pending, config, new Date()));
      }
      return { ok: true, live };
    },
    [account, config, rating, entries, byId, players, updateAccount],
  );

  const finish = useCallback(
    (live: LiveMatch, score: [number, number]) => settle(live, score, false),
    [settle],
  );

  const forfeit = useCallback(
    (live: LiveMatch): ManagerPlayResult => {
      if (!live.ranked) {
        // Nothing rides on an unranked match; leaving just ends it.
        activeId.current = null;
        return { ok: true, error: null, match: null, paid: [] };
      }
      return settle(live, [...FORFEIT_SCORE], true);
    },
    [settle],
  );

  /** A ranked match still pending when this page did not start it was abandoned. */
  const pending = account?.manager?.pending ?? null;
  useEffect(() => {
    if (!pending || pending.id === activeId.current) return;
    settle(
      { id: pending.id, ranked: true, opponent: pending.opponent, rating: pending.rating, setup: EMPTY_SETUP },
      [...FORFEIT_SCORE],
      true,
    );
  }, [pending, settle]);

  const value = useMemo<ManagerValue>(
    () => ({
      config,
      replace,
      reset,
      state,
      rating,
      leaderboardRank,
      ladder,
      refreshOpponents,
      prepare,
      finish,
      forfeit,
    }),
    [config, replace, reset, state, rating, leaderboardRank, ladder, refreshOpponents, prepare, finish, forfeit],
  );

  return <ManagerContext.Provider value={value}>{children}</ManagerContext.Provider>;
}

export function useManager(): ManagerValue {
  const value = useContext(ManagerContext);
  if (!value) throw new Error('useManager must be used inside a ManagerProvider');
  return value;
}
