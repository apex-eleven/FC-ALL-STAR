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
  roundRewardsDue,
  unpaidRewards,
  windowOpen,
  withClaimed,
  withHistory,
  withTokens,
} from './cup';
import { CUP_FORFEIT_SCORE, cupId } from './constants';
import type {
  CupClaimError,
  CupConfig,
  CupEnterError,
  CupKind,
  CupPlayError,
  CupResult,
  CupRoundReward,
  CupRun,
  CupState,
  CupTie,
} from './types';

/**
 * Everything that changes an account. Pure: each function takes an account and
 * returns a new one, with the charge, the payout and the bracket all landing in the
 * same object so a reload between two of them is impossible.
 *
 * Every function here is also safe to run twice. `updateAccount` may replay a
 * mutator, and a double press replays it against an account that already moved on —
 * so each one names the run (and round) it is for, and refuses a stale one rather
 * than acting on whatever the account holds now.
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
 * Enters a cup: charges the entry, draws the bracket, files both. This is NEW CUP.
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
  const previous = state.runs[kind];
  // A run still going is the thing to finish, not a second entry to spend on — and
  // a trophy nobody has claimed must not be replaced by the next draw.
  if (previous?.status === 'running') return fail('in-progress');
  if (previous?.status === 'champion') return fail('unclaimed');
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

/** Which run and round a play call is for. Anything else on the account is stale. */
export interface RoundRef {
  kind: CupKind;
  runId: string;
  round: number;
}

export interface KickOffOutcome {
  ok: boolean;
  error: CupPlayError | null;
  account: Account;
  run: CupRun | null;
}

/**
 * Records that the player kicked off their tie live, before a ball is kicked.
 *
 * From here the tie can only be settled by the live result or by a forfeit — it can
 * no longer be simulated, and it cannot be kicked off a second time.
 */
export function kickOffTie(
  account: Account,
  input: RoundRef & { config: CupConfig; now: Date },
): KickOffOutcome {
  const { config, kind, now } = input;
  const fail = (error: CupPlayError): KickOffOutcome => ({ ok: false, error, account, run: null });

  if (!config.enabled || !config[kind].enabled) return fail('closed');

  const state = currentCup(account.cup, config, now);
  const run = state.runs[kind];
  if (!run) return fail('no-run');
  if (run.status !== 'running') return fail('finished');
  if (run.id !== input.runId || run.round !== input.round) return fail('stale');
  if (run.pending !== null) return fail('in-play');

  const next: CupRun = { ...run, pending: run.round };
  return {
    ok: true,
    error: null,
    run: next,
    account: { ...account, cup: { ...state, runs: { ...state.runs, [kind]: next } } },
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
  /** Cup Tokens this round paid, already credited. */
  tokens: number;
  cards: OwnedPlayer[];
  /** Set on the round that ended the run. */
  result: CupResult | null;
}

/**
 * How the tie is decided.
 *
 * - `simulate`  the quick simulation, the same one every other tie in the round uses.
 * - `live`      the score the live match ended on, from the account's point of view.
 * - `forfeit`   the player left a live tie, or abandoned it by closing the tab.
 */
export type RoundMode =
  | { kind: 'simulate' }
  | { kind: 'live'; score: [number, number]; shootout?: [number, number] | null }
  | { kind: 'forfeit' };

export interface RoundInput extends RoundRef {
  config: CupConfig;
  now: Date;
  mode: RoundMode;
  lookup: CardLookup;
  stamp: ShopStamp;
}

function goals(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;
}

/**
 * A live score that can be filed, or null.
 *
 * The engine only ever produces whole, non-negative goals; anything else means the
 * result was lost or mangled on the way here. Null sends the tie to the quick
 * simulation — the one rule that already exists for deciding a tie nobody watched —
 * rather than to a retry, which is what a dropped result must never turn into.
 */
export function validLiveScore(
  score: unknown,
  shootout: unknown,
): { score: [number, number]; shootout: [number, number] | null } | null {
  if (!Array.isArray(score) || score.length !== 2 || !goals(score[0]) || !goals(score[1])) return null;
  let pens: [number, number] | null = null;
  if (Array.isArray(shootout)) {
    if (shootout.length !== 2 || !goals(shootout[0]) || !goals(shootout[1])) return null;
    if (shootout[0] === shootout[1]) return null;
    pens = [shootout[0], shootout[1]];
  }
  return { score: [score[0], score[1]], shootout: pens };
}

interface Payout {
  ok: boolean;
  account: Account;
  state: CupState;
  run: CupRun;
  paid: ShopReward[];
  tokens: number;
  cards: OwnedPlayer[];
  error: 'club-full' | 'card-missing' | 'at-cap' | null;
}

/**
 * Pays reward bands through the game's one reward path (`deliverRewards`, reason
 * `'cup'`), adds their Cup Tokens, and marks them claimed — all or nothing.
 *
 * A delivery the account has no room for pays nothing and claims nothing, so the
 * bands stay owed and a later call can pay them.
 */
function payBands(
  account: Account,
  state: CupState,
  run: CupRun,
  bands: readonly CupRoundReward[],
  lookup: CardLookup,
  stamp: ShopStamp,
): Payout {
  const unpaid: Payout = { ok: true, account, state, run, paid: [], tokens: 0, cards: [], error: null };
  if (bands.length === 0) return unpaid;

  const lines = bands.flatMap((band) => band.rewards);
  const tokens = bands.reduce((sum, band) => sum + band.tokens, 0);

  let paidAccount = account;
  let cards: OwnedPlayer[] = [];
  if (lines.length > 0) {
    const delivery = deliverRewards(account, lines, lookup, stamp, 'cup', CUP_EVENT_ID);
    if (!delivery.ok) return { ...unpaid, ok: false, error: delivery.error };
    paidAccount = delivery.account;
    cards = delivery.cards;
  }

  return {
    ok: true,
    account: paidAccount,
    state: withTokens(state, tokens),
    run: withClaimed(run, bands),
    paid: lines,
    tokens,
    cards,
    error: null,
  };
}

/**
 * Plays the account's current round and pays whatever reaching it earned — except
 * the title, which waits for `claimCupReward`.
 *
 * The bracket and the payout are one write. A player who closes the tab between the
 * two would otherwise come back to a round they had won and no prize for it, and
 * there is no way to tell that apart from a prize already taken.
 *
 * A payout the account has no room for (a full club, a wallet at its cap) refuses
 * **the payout**, not the round: the tie is still played and filed, and the reward
 * stays unclaimed so the next round, or the champion claim, pays it. Losing a
 * bracket because the club is full would be a far worse trade than a late prize.
 */
export function playCupRound(account: Account, input: RoundInput): RoundOutcome {
  const { config, kind, now, mode } = input;
  const competition = config[kind];
  const fail = (error: CupPlayError): RoundOutcome => ({
    ok: false,
    error,
    account,
    tie: null,
    through: false,
    run: null,
    paid: [],
    tokens: 0,
    cards: [],
    result: null,
  });

  // A tie already kicked off is settled even if the cup was switched off meanwhile —
  // otherwise it would sit pending until someone switched it back on.
  if (mode.kind === 'simulate' && (!config.enabled || !competition.enabled)) return fail('closed');

  const state = currentCup(account.cup, config, now);
  const run = state.runs[kind];
  if (!run) return fail('no-run');
  if (run.status !== 'running') return fail('finished');
  if (run.id !== input.runId || run.round !== input.round) return fail('stale');

  let result: Parameters<typeof playRound>[1]['result'];
  if (mode.kind === 'simulate') {
    // Kicked off live means watched to the end or forfeited — not re-rolled.
    if (run.pending !== null) return fail('in-play');
    result = undefined;
  } else {
    if (run.pending !== run.round) return fail('not-live');
    if (mode.kind === 'forfeit') {
      result = { score: [CUP_FORFEIT_SCORE[0], CUP_FORFEIT_SCORE[1]], shootout: null, youWon: false };
    } else {
      result = validLiveScore(mode.score, mode.shootout ?? null) ?? undefined;
    }
  }

  const played = playRound(run, { result, now });
  const payout = payBands(
    account,
    state,
    played.run,
    roundRewardsDue(played.run, competition),
    input.lookup,
    input.stamp,
  );

  let cupState: CupState = { ...payout.state, runs: { ...payout.state.runs, [kind]: payout.run } };
  if (played.result) cupState = withHistory(cupState, played.result);

  return {
    ok: true,
    error: null,
    tie: played.tie,
    through: played.through,
    run: payout.run,
    paid: payout.paid,
    tokens: payout.tokens,
    cards: payout.cards,
    result: played.result,
    account: { ...payout.account, cup: cupState },
  };
}

export interface ClaimInput {
  kind: CupKind;
  runId: string;
  config: CupConfig;
  now: Date;
  lookup: CardLookup;
  stamp: ShopStamp;
}

export interface ClaimOutcome {
  ok: boolean;
  error: CupClaimError | null;
  account: Account;
  run: CupRun | null;
  paid: ShopReward[];
  tokens: number;
  cards: OwnedPlayer[];
}

/**
 * CLAIM REWARD: pays everything the champion is still owed and completes the run.
 *
 * "Everything" is the title bands plus any earlier band a full club refused at the
 * time, so a champion never walks away owed. The run moves to `completed` in the
 * same write, which is what makes a second press — or a replayed mutator — find
 * nothing to pay. It does not start a new cup: that stays NEW CUP's job.
 */
export function claimCupReward(account: Account, input: ClaimInput): ClaimOutcome {
  const { config, kind, now } = input;
  const fail = (error: CupClaimError): ClaimOutcome => ({
    ok: false,
    error,
    account,
    run: null,
    paid: [],
    tokens: 0,
    cards: [],
  });

  const state = currentCup(account.cup, config, now);
  const run = state.runs[kind];
  if (!run || run.id !== input.runId) return fail('no-run');
  if (run.status === 'completed') return fail('already-claimed');
  if (run.status !== 'champion') return fail('not-champion');

  const payout = payBands(account, state, run, unpaidRewards(run, config[kind]), input.lookup, input.stamp);
  if (!payout.ok) return fail(payout.error ?? 'at-cap');

  const completed: CupRun = { ...payout.run, status: 'completed' };
  return {
    ok: true,
    error: null,
    run: completed,
    paid: payout.paid,
    tokens: payout.tokens,
    cards: payout.cards,
    account: {
      ...payout.account,
      cup: { ...payout.state, runs: { ...payout.state.runs, [kind]: completed } },
    },
  };
}
