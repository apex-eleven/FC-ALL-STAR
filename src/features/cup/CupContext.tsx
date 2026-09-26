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
import type { Account } from '@/features/auth/types';
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
import { currentCup, entriesLeft, opponentIn, tieForYou, windowOpen } from './cup';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './cupConfigStore';
import {
  claimCupReward,
  enterCup,
  kickOffTie,
  playCupRound,
  type ClaimOutcome,
  type RoundMode,
  type RoundOutcome,
  type RoundRef,
} from './play';
import {
  CUP_KINDS,
  type CupConfig,
  type CupEnterError,
  type CupKind,
  type CupPlayError,
  type CupRun,
  type CupState,
} from './types';

/**
 * The cup provider — the tournament layer between the cup screen and the game's
 * existing systems:
 *
 * ```
 * CupScreen ─▶ useCup() ─▶ play.ts (pure rules) ─▶ updateAccount (the save)
 *                  │
 *                  └─ PLAY MATCH ─▶ manager mode's LiveMatch + MatchEngine
 *                                   (built here, drawn by ManagerLiveMatch)
 * ```
 *
 * Nothing happens on a clock. A round is played because the player pressed PLAY
 * MATCH (watched live in the existing match engine) or SIM (the quick simulation
 * every other tie uses). The minute tick below only notices a window closing on an
 * open screen.
 */

export type CupPlayResult = Omit<RoundOutcome, 'account'>;
export type CupClaimResult = Omit<ClaimOutcome, 'account'>;

export type KickOffResult = { ok: true; live: LiveMatch } | { ok: false; error: CupPlayError };

/** A live tie found kicked off on load that this page never started — settled as a forfeit. */
export interface AbandonedTie {
  kind: CupKind;
  outcome: CupPlayResult;
}

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
  /** NEW CUP: charges the entry and draws a bracket. */
  enter(kind: CupKind): { ok: true; run: CupRun } | { ok: false; error: CupEnterError };
  /** Settles the current round with the quick simulation. */
  simulate(kind: CupKind): CupPlayResult;
  /** PLAY MATCH: records the kick-off and builds the live match for the current tie. */
  kickOff(kind: CupKind): KickOffResult;
  /** Settles a watched tie with the score it ended on. */
  finishLive(kind: CupKind, live: LiveMatch, score: [number, number]): CupPlayResult;
  /** Leaves a watched tie early: a 0-3 loss. */
  forfeitLive(kind: CupKind, live: LiveMatch): CupPlayResult;
  /** CLAIM REWARD on a champion run. */
  claim(kind: CupKind): CupClaimResult;
  /** An abandoned live tie this load settled, waiting to be shown once. */
  abandoned: AbandonedTie | null;
  clearAbandoned(): void;
}

const CupContext = createContext<CupValue | null>(null);

/** The live tie this page kicked off, per competition. */
interface ActiveLive {
  id: string;
  runId: string;
  round: number;
}

const NO_RESULT: CupPlayResult = {
  ok: false,
  error: 'no-run',
  tie: null,
  through: false,
  run: null,
  paid: [],
  tokens: 0,
  cards: [],
  result: null,
};

function withoutAccount<T extends { account: Account }>(outcome: T): Omit<T, 'account'> {
  const { account: _account, ...rest } = outcome;
  return rest;
}

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
  const [abandoned, setAbandoned] = useState<AbandonedTie | null>(null);
  const active = useRef<Record<CupKind, ActiveLive | null>>({ daily: null, weekend: null });

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
   * Settles one round, however it was decided.
   *
   * The preview decides what happened; the mutator replays the same inputs against
   * whatever the account is by then. Both land on the same bracket because every
   * roll is seeded off the run id — and a mutator that finds the run has already
   * moved past `ref.round` (a double press) refuses rather than playing the next
   * round by mistake.
   */
  const settle = useCallback(
    (ref: RoundRef, mode: RoundMode): CupPlayResult => {
      if (!account) return NO_RESULT;

      const input = { ...ref, config, now: new Date(), mode, lookup: byId, stamp: shopStamp() };
      const preview = playCupRound(account, input);
      if (!preview.ok) return { ...NO_RESULT, error: preview.error };

      updateAccount((current) => {
        const applied = playCupRound(current, input);
        if (!applied.ok || !applied.tie || !applied.run) return current;
        // A forfeit is a result, not a match played — it counts toward no mission,
        // the same as manager mode's.
        if (mode.kind === 'forfeit') return applied.account;

        // Counted here rather than in the preview so a mutator that runs twice does
        // not count the tie twice — `note` folds into the same account it returns.
        const seat = applied.run.teams.findIndex((team) => team.you);
        const mine = applied.tie.a === seat ? applied.tie.score[0] : applied.tie.score[1];
        const played = note(applied.account, 'cup-play', 1);
        const won = note(played, 'cup-win', applied.through ? 1 : 0);
        const scored = note(won, 'cup-goal', mine);
        return awardMatch(scored, applied.through ? 'win' : 'loss');
      });

      return withoutAccount(preview);
    },
    [account, config, byId, updateAccount, note, awardMatch],
  );

  const refOf = useCallback(
    (kind: CupKind): RoundRef | null => {
      const run = state?.runs[kind];
      return run && run.status === 'running' ? { kind, runId: run.id, round: run.round } : null;
    },
    [state],
  );

  const simulate = useCallback(
    (kind: CupKind): CupPlayResult => {
      const ref = refOf(kind);
      return ref ? settle(ref, { kind: 'simulate' }) : NO_RESULT;
    },
    [refOf, settle],
  );

  /**
   * PLAY MATCH: records the kick-off, then builds the live match for the tie.
   *
   * The opponent's eleven comes from the leaderboard entry they published when it
   * is still there, and from the catalogue when it is not — a seat drawn two rounds
   * ago against someone who has since changed their squad still has to field
   * eleven players. Either way it is manager mode's `LiveMatch`, played by the
   * existing engine and drawn by the existing live screen.
   */
  const kickOff = useCallback(
    (kind: CupKind): KickOffResult => {
      if (!account || !state) return { ok: false, error: 'no-run' };
      const run = state.runs[kind];
      if (!run) return { ok: false, error: 'no-run' };

      const tie = tieForYou(run);
      const opponent = tie ? opponentIn(run, tie) : undefined;
      if (!tie || !opponent) return { ok: false, error: 'finished' };

      const ref: RoundRef = { kind, runId: run.id, round: run.round };
      const input = { ...ref, config, now: new Date() };
      const preview = kickOffTie(account, input);
      if (!preview.ok) return { ok: false, error: preview.error ?? 'no-run' };

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

      const id = `${run.id}:r${run.round}`;
      // Set before the write, so the abandoned-tie check below never mistakes the
      // tie this page just kicked off for one somebody walked away from.
      active.current[kind] = { id, runId: run.id, round: run.round };
      updateAccount((current) => {
        const applied = kickOffTie(current, input);
        return applied.ok ? applied.account : current;
      });

      return {
        ok: true,
        live: {
          id,
          // Not "ranked" in manager mode's sense — there is no ladder here. It is set
          // so the live screen's leave button asks first: leaving settles the tie.
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
        },
      };
    },
    [account, state, config, byId, entries, players, rating, updateAccount],
  );

  /** Settles the live tie this page kicked off, by score or by forfeit. */
  const endLive = useCallback(
    (kind: CupKind, live: LiveMatch, mode: RoundMode): CupPlayResult => {
      const current = active.current[kind];
      if (!current || current.id !== live.id) return { ...NO_RESULT, error: 'not-live' };
      active.current[kind] = null;
      return settle({ kind, runId: current.runId, round: current.round }, mode);
    },
    [settle],
  );

  const finishLive = useCallback(
    (kind: CupKind, live: LiveMatch, score: [number, number]) =>
      endLive(kind, live, { kind: 'live', score }),
    [endLive],
  );

  const forfeitLive = useCallback(
    (kind: CupKind, live: LiveMatch) => endLive(kind, live, { kind: 'forfeit' }),
    [endLive],
  );

  /**
   * A kicked-off tie this page did not start was abandoned — the tab was closed or
   * reloaded mid-match. It settles as the forfeit leaving through the button would
   * have been, so a reload is never a free retry. Manager mode's ranked matches
   * follow the same rule.
   */
  useEffect(() => {
    if (!state) return;
    for (const kind of CUP_KINDS) {
      const run = state.runs[kind];
      if (!run || run.status !== 'running' || run.pending === null) continue;
      const mine = active.current[kind];
      if (mine && mine.runId === run.id && mine.round === run.pending) continue;
      const outcome = settle({ kind, runId: run.id, round: run.pending }, { kind: 'forfeit' });
      if (outcome.ok) setAbandoned({ kind, outcome });
    }
  }, [state, settle]);

  const clearAbandoned = useCallback(() => setAbandoned(null), []);

  const claim = useCallback(
    (kind: CupKind): CupClaimResult => {
      const run = state?.runs[kind];
      if (!account || !run) {
        return { ok: false, error: 'no-run', run: null, paid: [], tokens: 0, cards: [] };
      }

      const input = { kind, runId: run.id, config, now: new Date(), lookup: byId, stamp: shopStamp() };
      const preview = claimCupReward(account, input);
      if (!preview.ok) return withoutAccount(preview);

      updateAccount((current) => {
        const applied = claimCupReward(current, input);
        return applied.ok ? applied.account : current;
      });
      return withoutAccount(preview);
    },
    [account, state, config, byId, updateAccount],
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
      kickOff,
      finishLive,
      forfeitLive,
      claim,
      abandoned,
      clearAbandoned,
    }),
    [
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
      kickOff,
      finishLive,
      forfeitLive,
      claim,
      abandoned,
      clearAbandoned,
    ],
  );

  return <CupContext.Provider value={value}>{children}</CupContext.Provider>;
}

export function useCup(): CupValue {
  const value = useContext(CupContext);
  if (!value) throw new Error('useCup must be used inside a CupProvider');
  return value;
}
