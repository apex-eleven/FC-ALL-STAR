import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { appendEntry, debit } from '@/features/currencies/wallet';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import {
  buildRun,
  currentCup,
  entriesLeft,
  playRound,
  roundDue,
  unpaidRewards,
  windowOpen,
  withClaimed,
  withHistory,
} from './cup';
import { cupId } from './constants';
import type {
  CupConfig,
  CupEnterError,
  CupKind,
  CupPlayError,
  CupResult,
  CupRun,
  CupTie,
} from './types';

/**
 * Everything that changes an account. Pure: each function takes an account and
 * returns a new one, with the charge, the payout and the bracket all landing in the
 * same object so a reload between two of them is impossible.
 *
 * `eventId` on cards from a cup round — provenance only.
 */
export const CUP_EVENT_ID = 'cup';

export interface EnterOutcome {
  ok: boolean;
  error: CupEnterError | null;
  account: Account;
  run: CupRun | null;
}

export interface EnterInput {
  kind: CupKind;
  config: CupConfig;
  /** The account's squad OVR and how it appears to the other seats. */
  self: { name: string; rating: number; avatarId: string };
  entries: readonly LeaderboardEntry[];
  now: Date;
  /** Fixed by the caller, so a re-run of the mutator draws the identical bracket. */
  runId?: string;
}

/**
 * Enters a cup: charges the entry, draws the bracket, files both.
 *
 * Charged before the draw, never refunded — a refund is two ledger lines for a
 * transaction that did not happen (CLAUDE.md). Everything that could refuse comes
 * first, so by the time the wallet is touched the run is certain to exist.
 */
export function enterCup(account: Account, input: EnterInput): EnterOutcome {
  const { config, kind, now } = input;
  const competition = config[kind];
  const fail = (error: CupEnterError): EnterOutcome => ({ ok: false, error, account, run: null });

  if (!config.enabled || !competition.enabled) return fail('closed');
  if (!windowOpen(now, config, competition)) return fail('not-open');
  if (input.self.rating <= 0) return fail('no-squad');

  const state = currentCup(account.cup, config, now);
  const running = state.runs[kind];
  // A run still going is the thing to finish, not a second entry to spend on.
  if (running && running.status === 'running') return fail('in-progress');
  if (entriesLeft(state, kind, competition) <= 0) return fail('no-entries');

  let wallet = account.wallet;
  let ledger = account.ledger;
  if (competition.entryCost > 0) {
    const charged = debit(wallet, competition.entryCurrency, competition.entryCost, { reason: 'cup' });
    if (!charged.ok || !charged.entry) return fail('cannot-afford');
    wallet = charged.wallet;
    ledger = appendEntry(ledger, charged.entry);
  }

  const run = buildRun({
    id: input.runId ?? cupId('cup'),
    kind,
    periodKey: state.periodKey[kind],
    competition,
    self: { id: account.id, ...input.self },
    entries: input.entries,
    now,
  });

  return {
    ok: true,
    error: null,
    run,
    account: {
      ...account,
      wallet,
      ledger,
      cup: {
        ...state,
        used: { ...state.used, [kind]: (state.used[kind] ?? 0) + 1 },
        runs: { ...state.runs, [kind]: run },
      },
    },
  };
}

export interface RoundOutcome {
  ok: boolean;
  error: CupPlayError | null;
  account: Account;
  /** The account's own tie, as it finished. */
  tie: CupTie | null;
  through: boolean;
  run: CupRun | null;
  /** Reward lines this round paid, already credited. */
  paid: ShopReward[];
  cards: OwnedPlayer[];
  /** Set on the round that ended the run. */
  result: CupResult | null;
}

export interface RoundInput {
  kind: CupKind;
  config: CupConfig;
  now: Date;
  /**
   * The live match's score, from the account's point of view. Absent, the tie is
   * simulated like every other one in the round.
   */
  result?: { score: [number, number]; shootout?: [number, number] | null; youWon?: boolean };
  lookup: CardLookup;
  stamp: ShopStamp;
}

/**
 * Plays the account's next round and pays whatever reaching it earned.
 *
 * The bracket and the payout are one write. A player who closes the tab between the
 * two would otherwise come back to a round they had won and no prize for it, and
 * there is no way to tell that apart from a prize already taken.
 *
 * A payout the account has no room for (a full club, a wallet at its cap) refuses
 * **the payout**, not the round: the tie is still played and filed, and the reward
 * stays unclaimed so it can be paid on the next round or by the admin. Losing a
 * bracket because the club is full would be a far worse trade than a late prize.
 */
export function playCupRound(account: Account, input: RoundInput): RoundOutcome {
  const { config, kind, now } = input;
  const competition = config[kind];
  const fail = (error: CupPlayError): RoundOutcome => ({
    ok: false,
    error,
    account,
    tie: null,
    through: false,
    run: null,
    paid: [],
    cards: [],
    result: null,
  });

  if (!config.enabled || !competition.enabled) return fail('closed');

  const state = currentCup(account.cup, config, now);
  const run = state.runs[kind];
  if (!run) return fail('no-run');
  if (run.status !== 'running') return fail('finished');
  // The clock is the only gate on a round now: the bracket is drawn at entry and each
  // round plays itself once its kickoff time comes round.
  if (!roundDue(run, now)) return fail('too-early');

  const played = playRound(run, { result: input.result, now });

  let next = played.run;
  const owed = unpaidRewards(next, competition);
  const lines = owed.flatMap((band) => band.rewards);

  let paidAccount = account;
  let cards: OwnedPlayer[] = [];
  let paid: ShopReward[] = [];

  if (lines.length > 0) {
    const delivery = deliverRewards(account, lines, input.lookup, input.stamp, 'cup', CUP_EVENT_ID);
    if (delivery.ok) {
      paidAccount = delivery.account;
      cards = delivery.cards;
      paid = lines;
      next = withClaimed(next, owed);
    }
  }

  let cupState = {
    ...state,
    runs: { ...state.runs, [kind]: next },
  };
  if (played.result) cupState = withHistory(cupState, played.result);

  return {
    ok: true,
    error: null,
    tie: played.tie,
    through: played.through,
    run: next,
    paid,
    cards,
    result: played.result,
    account: { ...paidAccount, cup: cupState },
  };
}
