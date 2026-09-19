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
import { displayNameOf } from '@/features/auth/constants';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { useBadges } from '@/features/badges/BadgeContext';
import { syncOwned } from '@/features/club/sync';
import { fetchLeaderboard } from '@/features/cloud/cloudLeaderboard';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { botLineup, entryLineup, homeLineup } from '@/features/manager/lineup';
import type { LiveMatch } from '@/features/manager/ManagerContext';
import type { MatchSetup } from '@/features/manager/matchEngine';
import { useMissions } from '@/features/missions/MissionContext';
import { usePlayers } from '@/features/players/PlayerContext';
import { shopStamp } from '@/features/shop/shop';
import { indexOwned } from '@/features/squad/squad';
import { useStarPass } from '@/features/starpass/StarPassContext';
import { cupId, defaultCup } from './constants';
import { currentCup, entriesLeft, tieForYou, windowOpen } from './cup';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './cupConfigStore';
import { enterCup, playCupRound, type RoundOutcome } from './play';
import type { CupConfig, CupEnterError, CupKind, CupRun, CupState } from './types';

/**
 * The cup provider.
 *
 * Sits where the league provider used to, and reads the same three things it did:
 * the account, the squad rating (through `useBadges`, so crest bonuses count), and
 * the published elevens other players have left on the leaderboard.
 *
 * The one thing it does not do is run on a timer. A cup round happens because the
 * player pressed a button, not because an hour passed — which is the whole
 * difference between this and the table it replaces.
 */

export type CupPlayResult = Omit<RoundOutcome, 'account'>;

interface CupValue {
  config: CupConfig;
  replace(next: CupConfig): SaveResult;
  reset(): SaveResult;
  /** The account's cups as of now, windows already rolled over. */
  state: CupState | null;
  /** Squad OVR of the eleven on the pitch — what a tie is played at. */
  rating: number;
  /** Entries left in the current window, per competition. */
  left: Record<CupKind, number>;
  /** Whether each competition is open right now. */
  open: Record<CupKind, boolean>;
  /** Re-reads the published elevens the brackets are drawn from. */
  refreshOpponents(): void;
  enter(kind: CupKind): { ok: true; run: CupRun } | { ok: false; error: CupEnterError };
  /** Simulates the next round outright. */
  simulate(kind: CupKind): CupPlayResult;
  /** Builds the live match for the next tie, to watch it instead. */
  prepareLive(kind: CupKind): LiveMatch | null;
  /** Settles a watched tie with the score it ended on. */
  finishLive(kind: CupKind, score: [number, number], shootout?: [number, number] | null): CupPlayResult;
}

const CupContext = createContext<CupValue | null>(null);

export function CupProvider({ children }: { children: ReactNode }) {
  // useAuth, not useAccount: this sits above the sign-in gate.
  const { account, updateAccount } = useAuth();
  const { byId, players } = usePlayers();
  const { note } = useMissions();
  const { awardMatch } = useStarPass();
  const [config, setConfig] = useState<CupConfig>(loadConfig);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  // Re-read once a minute so a window closing is noticed on an open screen.
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

  const refreshOpponents = useCallback(() => {
    void fetchLeaderboard().then(setEntries);
  }, []);

  const { ratingOf } = useBadges();
  const rating = useMemo(() => {
    if (!account) return 0;
    const owned = indexOwned(syncOwned(account.club.players, byId));
    return ratingOf(account.squad, owned);
  }, [account, byId, ratingOf]);

  const state = useMemo(
    () => (account ? currentCup(account.cup, config, new Date(clock)) : null),
    [account, config, clock],
  );

  const left = useMemo<Record<CupKind, number>>(
    () => ({
      daily: state ? entriesLeft(state, 'daily', config.daily) : 0,
      weekend: state ? entriesLeft(state, 'weekend', config.weekend) : 0,
    }),
    [state, config],
  );

  const open = useMemo<Record<CupKind, boolean>>(() => {
    const now = new Date(clock);
    return {
      daily: windowOpen(now, config, config.daily),
      weekend: windowOpen(now, config, config.weekend),
    };
  }, [config, clock]);

  const replace = useCallback((next: CupConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const reset = useCallback(() => replace(defaultCup()), [replace]);

  const self = useMemo(
    () =>
      account
        ? { name: displayNameOf(account), rating, avatarId: account.avatarId }
        : { name: '', rating: 0, avatarId: '' },
    [account, rating],
  );

  const enter = useCallback(
    (kind: CupKind): { ok: true; run: CupRun } | { ok: false; error: CupEnterError } => {
      if (!account) return { ok: false, error: 'closed' };

      // Fixed here, before the mutator: `updateAccount` may run it more than once,
      // and a second run must draw the same bracket rather than a new one.
      const runId = cupId('cup');
      const now = new Date();
      const input = { kind, config, self, entries, now, runId };

      const preview = enterCup(account, input);
      if (!preview.ok || !preview.run) return { ok: false, error: preview.error ?? 'closed' };

      updateAccount((current) => {
        const applied = enterCup(current, input);
        return applied.ok ? applied.account : current;
      });

      return { ok: true, run: preview.run };
    },
    [account, config, self, entries, updateAccount],
  );

  /**
   * Plays the next round, with or without a live score.
   *
   * The preview decides what happened; the mutator replays the same inputs against
   * whatever the account is by then. Both runs land on the same bracket because the
   * ties are seeded off the run id, which is already saved.
   */
  const settle = useCallback(
    (kind: CupKind, result?: { score: [number, number]; shootout?: [number, number] | null }): CupPlayResult => {
      const empty: CupPlayResult = {
        ok: false,
        error: 'no-run',
        tie: null,
        through: false,
        run: null,
        paid: [],
        cards: [],
        result: null,
      };
      if (!account) return empty;

      const now = new Date();
      const stamp = shopStamp();
      const input = { kind, config, now, result, lookup: byId, stamp };

      const preview = playCupRound(account, input);
      if (!preview.ok) return { ...empty, error: preview.error };

      updateAccount((current) => {
        const applied = playCupRound(current, input);
        if (!applied.ok || !applied.tie) return current;

        // Counted here rather than in the preview so a mutator that runs twice does
        // not count the tie twice — `note` folds into the same account it returns.
        const goals = applied.tie.score;
        const seat = applied.run?.teams.findIndex((team) => team.you) ?? -1;
        const mine = applied.run && seat >= 0 && applied.tie.a === seat ? goals[0] : goals[1];

        const played = note(applied.account, 'cup-play', 1);
        const won = note(played, 'cup-win', applied.through ? 1 : 0);
        const scored = note(won, 'cup-goal', mine);
        return awardMatch(scored, applied.through ? 'win' : 'loss');
      });

      return {
        ok: true,
        error: null,
        tie: preview.tie,
        through: preview.through,
        run: preview.run,
        paid: preview.paid,
        cards: preview.cards,
        result: preview.result,
      };
    },
    [account, config, byId, updateAccount, note, awardMatch],
  );

  const simulate = useCallback((kind: CupKind) => settle(kind), [settle]);

  const finishLive = useCallback(
    (kind: CupKind, score: [number, number], shootout?: [number, number] | null) =>
      settle(kind, { score, shootout: shootout ?? null }),
    [settle],
  );

  /**
   * Builds the live match for the tie the player is about to watch.
   *
   * The opponent's eleven comes from the leaderboard entry they published when it
   * is still there, and from the catalogue when it is not — a seat drawn two rounds
   * ago against someone who has since changed their squad still has to field
   * eleven players.
   */
  const prepareLive = useCallback(
    (kind: CupKind): LiveMatch | null => {
      if (!account || !state) return null;
      const run = state.runs[kind];
      if (!run || run.status !== 'running') return null;

      const tie = tieForYou(run);
      if (!tie) return null;

      const seat = run.teams.findIndex((team) => team.you);
      const opponentSeat = tie.a === seat ? tie.b : tie.a;
      const opponent = run.teams[opponentSeat];
      if (!opponent) return null;

      const owned = indexOwned(syncOwned(account.club.players, byId));
      const home = homeLineup(account, owned);
      const entry = opponent.bot ? undefined : entries.find((row) => row.uid === opponent.id);

      const setup: MatchSetup = {
        home: home.spots,
        away: entry
          ? entryLineup(entry)
          : botLineup({ ...opponent, bot: true }, players, [
              ...home.spots.map((spot) => spot.player.name),
              ...home.bench.map((player) => player.name),
            ]),
        homeBench: home.bench,
        homeName: displayNameOf(account),
        awayName: opponent.name,
        // Seeded off the run and the round, so watching a tie and simulating it are
        // the same fixture — not two different draws that happen to share a name.
        seed: `${run.id}:r${run.round}`,
        duration: config.matchSeconds,
      };

      return {
        id: `${run.id}:r${run.round}`,
        // Not "ranked" in manager mode's sense — there is no ladder here. It is set
        // so the live screen's leave button warns that quitting settles the tie.
        ranked: true,
        opponent: {
          id: opponent.id,
          name: opponent.name,
          rating: opponent.rating,
          avatarId: opponent.avatarId,
          bot: opponent.bot,
        },
        rating,
        setup,
      };
    },
    [account, state, byId, entries, players, rating, config.matchSeconds],
  );

  const value = useMemo<CupValue>(
    () => ({
      config,
      replace,
      reset,
      state,
      rating,
      left,
      open,
      refreshOpponents,
      enter,
      simulate,
      prepareLive,
      finishLive,
    }),
    [config, replace, reset, state, rating, left, open, refreshOpponents, enter, simulate, prepareLive, finishLive],
  );

  return <CupContext.Provider value={value}>{children}</CupContext.Provider>;
}

export function useCup(): CupValue {
  const value = useContext(CupContext);
  if (!value) throw new Error('useCup must be used inside a CupProvider');
  return value;
}
