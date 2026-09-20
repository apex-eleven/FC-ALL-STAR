import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { isInSquad } from '@/features/squad/squad';
import { deliverRewards, isCardReward, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import { progressOf } from '@/features/transfers/transfer';
import { FUSION_EVENT_ID, HISTORY_LIMIT } from './constants';
import type {
  FusionConfig,
  FusionError,
  FusionOffer,
  FusionPick,
  FusionPrize,
  FusionState,
} from './types';

/**
 * Pure bench rules.
 *
 * Every roll arrives as a number in [0, 1) fixed by the caller before
 * `updateAccount`, so a mutator that runs twice deals the same hand — the same
 * reason the gachapon takes its rolls from outside.
 *
 * A fusion is two steps on purpose. `deal` eats the cards and puts a hand on the
 * table; `claim` pays one of them out. Between them the hand lives on the account,
 * so a player whose tab dies after paying still has their hand waiting.
 */

export function emptyState(): FusionState {
  return { fusions: 0, pending: null, history: [] };
}

export function stateOf(saved: FusionState | undefined): FusionState {
  return saved ?? emptyState();
}

/* ── prize pool ─────────────────────────────────────────── */

/** True when this prize hands over a catalogue card the admin has locked out. */
function isLockedOut(prize: FusionPrize, locked: ReadonlySet<string>): boolean {
  return isCardReward(prize.reward) && locked.has(prize.reward.cardId);
}

/** Prizes a deal can land on: switched on, above zero, and not locked out. */
export function livePrizes(config: FusionConfig): FusionPrize[] {
  const locked = new Set(config.lockedIds);
  return config.prizes.filter(
    (prize) => prize.enabled && prize.chance > 0 && !isLockedOut(prize, locked),
  );
}

export function chanceTotal(config: FusionConfig): number {
  return livePrizes(config).reduce((sum, prize) => sum + prize.chance, 0);
}

/** A prize's real chance as a percentage of the pool, 0 when it cannot be dealt. */
export function percentOf(config: FusionConfig, prize: FusionPrize): number {
  const total = chanceTotal(config);
  if (total <= 0) return 0;
  if (!livePrizes(config).some((live) => live.id === prize.id)) return 0;
  return (prize.chance / total) * 100;
}

/** The prize a roll in [0, 1) lands on. */
export function prizeFor(config: FusionConfig, roll: number): FusionPrize | null {
  const prizes = livePrizes(config);
  const total = chanceTotal(config);
  if (prizes.length === 0 || total <= 0) return null;
  let ticket = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const prize of prizes) {
    ticket -= prize.chance;
    if (ticket < 0) return prize;
  }
  return prizes[prizes.length - 1] ?? null;
}

export function prizeName(prize: FusionPrize, rewardName: string): string {
  return prize.name.trim() || rewardName;
}

/* ── material rules ─────────────────────────────────────── */

export type MaterialBlock = 'lineup' | 'locked' | 'not-accepted' | null;

/**
 * Why an owned card cannot go on the bench, or null when it can.
 *
 * The lock checked here is the player's own — the same list that already stops a
 * card being sold. A card someone locked is not fusion fodder either, and making
 * them keep two lists would eventually eat a card they meant to keep.
 *
 * A card in the starting eleven or on the bench is refused outright, like selling:
 * burning it would quietly empty a slot they set up on purpose.
 */
export function materialBlock(
  card: OwnedPlayer,
  account: Pick<Account, 'squad' | 'transfer'>,
  config: FusionConfig,
): MaterialBlock {
  if (isInSquad(account.squad, card.id)) return 'lineup';
  if (progressOf(account).locked.includes(card.id)) return 'locked';
  if (config.materialIds.length > 0 && !config.materialIds.includes(card.playerId)) {
    return 'not-accepted';
  }
  return null;
}

/** Everything the player owns that this bench would take right now. */
export function usableMaterials(
  account: Pick<Account, 'club' | 'squad' | 'transfer'>,
  config: FusionConfig,
): OwnedPlayer[] {
  return account.club.players.filter((card) => materialBlock(card, account, config) === null);
}

export interface FusionReadiness {
  ok: boolean;
  reason: FusionError | null;
  /** Cards still to be picked before the button lights up. */
  missing: number;
}

export function checkReady(
  account: Pick<Account, 'club' | 'squad' | 'transfer' | 'fusion'>,
  config: FusionConfig,
  chosen: readonly string[],
): FusionReadiness {
  const need = Math.max(1, Math.floor(config.materials));
  if (!config.enabled) return { ok: false, reason: 'closed', missing: need };
  if (stateOf(account.fusion).pending) return { ok: false, reason: 'pending', missing: 0 };
  if (livePrizes(config).length === 0) return { ok: false, reason: 'empty', missing: need };

  const picked = new Set(chosen);
  const cards = account.club.players.filter((card) => picked.has(card.id));
  if (cards.length < need) return { ok: false, reason: 'need-materials', missing: need - cards.length };

  const blocked = cards.slice(0, need).find((card) => materialBlock(card, account, config) !== null);
  if (blocked) {
    const why = materialBlock(blocked, account, config);
    return { ok: false, reason: why === 'locked' ? 'locked-material' : 'bad-material', missing: 0 };
  }
  return { ok: true, reason: null, missing: 0 };
}

/* ── dealing ────────────────────────────────────────────── */

export interface DealInput {
  config: FusionConfig;
  /** Owned card ids to burn. Extra ones past `materials` are left alone. */
  chosen: readonly string[];
  /** One roll per dealt card, fixed by the caller. */
  rolls: readonly number[];
  now: Date;
  /** Fixed by the caller so both runs of a mutator file the same hand. */
  offerId: string;
  /** Names a reward — the caller has the catalogues, this file does not. */
  label: (prize: FusionPrize) => string;
}

export interface DealOutcome {
  ok: boolean;
  error: FusionError | null;
  account: Account;
  offer: FusionOffer | null;
}

function failedDeal(account: Account, error: FusionError): DealOutcome {
  return { ok: false, error, account, offer: null };
}

/**
 * Burns the materials and puts a hand face down on the table.
 *
 * Nothing is paid out here. The player has spent their cards and now owns a choice,
 * which is the thing that gets stored — see `FusionOffer`.
 */
export function deal(account: Account, input: DealInput): DealOutcome {
  const { config, chosen, rolls, now, offerId, label } = input;

  const ready = checkReady(account, config, chosen);
  if (!ready.ok) return failedDeal(account, ready.reason ?? 'need-materials');

  const need = Math.max(1, Math.floor(config.materials));
  const picked = new Set(chosen);
  const spent = account.club.players
    .filter((card) => picked.has(card.id))
    .slice(0, need)
    .map((card) => card.id);
  const gone = new Set(spent);

  const draws = Math.max(1, Math.floor(config.draws));
  const picks: FusionPick[] = [];
  for (let index = 0; index < draws; index += 1) {
    const prize = prizeFor(config, rolls[index] ?? 0);
    if (!prize) return failedDeal(account, 'empty');
    picks.push({
      prizeId: prize.id,
      name: prizeName(prize, label(prize)),
      rarity: prize.rarity,
      reward: prize.reward,
    });
  }

  const offer: FusionOffer = { id: offerId, at: now.toISOString(), spent, picks };
  const progress = progressOf(account);
  const state = stateOf(account.fusion);

  return {
    ok: true,
    error: null,
    offer,
    account: {
      ...account,
      club: { players: account.club.players.filter((card) => !gone.has(card.id)) },
      // A burned card cannot stay on the sell-lock list; nothing would ever clear it.
      transfer: { ...progress, locked: progress.locked.filter((id) => !gone.has(id)) },
      fusion: { ...state, pending: offer },
    },
  };
}

/* ── claiming ───────────────────────────────────────────── */

export interface ClaimInput {
  /** Which card of the hand was turned over, 0-based. */
  index: number;
  now: Date;
  winId: string;
  lookup: CardLookup;
  stamp: ShopStamp;
}

export interface ClaimOutcome {
  ok: boolean;
  error: FusionError | null;
  account: Account;
  pick: FusionPick | null;
  /** The card the prize handed over, when it was a card. */
  card: OwnedPlayer | null;
}

function failedClaim(account: Account, error: FusionError): ClaimOutcome {
  return { ok: false, error, account, pick: null, card: null };
}

/**
 * Turns one card of the hand over and pays it out. The rest are torn up.
 *
 * The reward paid is the snapshot taken when the hand was dealt, not whatever the
 * config says now — an admin editing a prize mid-hand must not change a promise the
 * player already paid cards for.
 */
export function claim(account: Account, input: ClaimInput): ClaimOutcome {
  const { index, now, winId, lookup, stamp } = input;

  const state = stateOf(account.fusion);
  const offer = state.pending;
  if (!offer) return failedClaim(account, 'no-offer');

  const pick = offer.picks[index];
  if (!pick) return failedClaim(account, 'bad-pick');

  const paidOut = deliverRewards(account, [pick.reward], lookup, stamp, 'fusion', FUSION_EVENT_ID);
  if (!paidOut.ok) return failedClaim(account, paidOut.error);

  const win = {
    id: winId,
    at: now.toISOString(),
    prizeId: pick.prizeId,
    name: pick.name,
    rarity: pick.rarity,
  };

  return {
    ok: true,
    error: null,
    pick,
    card: paidOut.cards[0] ?? null,
    account: {
      ...paidOut.account,
      fusion: {
        fusions: state.fusions + 1,
        pending: null,
        history: [win, ...state.history].slice(0, HISTORY_LIMIT),
      },
    },
  };
}

/** Throws the hand away without taking anything. Used when a hand can never be paid. */
export function discard(account: Account): Account {
  const state = stateOf(account.fusion);
  if (!state.pending) return account;
  return { ...account, fusion: { ...state, pending: null } };
}
