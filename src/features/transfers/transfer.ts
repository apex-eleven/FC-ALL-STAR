import type { Account } from '@/features/auth/types';
import { addPlayers } from '@/features/club/club';
import { CLUB_CAPACITY } from '@/features/club/constants';
import type { OwnedPlayer } from '@/features/club/types';
import { appendEntry, credit, debit } from '@/features/currencies/wallet';
import { cardToPlayer } from '@/features/draft/pool';
import type { PlayerCard } from '@/features/players/types';
import { isInSquad } from '@/features/squad/squad';
import { TRANSFER_CURRENCY, TRANSFER_EVENT_ID } from './constants';
import type {
  BuyError,
  PriceBand,
  SellError,
  TransferConfig,
  TransferProgress,
} from './types';

/**
 * Pure market rules. Nothing here touches React or storage.
 *
 * Every function that changes an account takes the account and returns a new one,
 * so the context can run it inside `updateAccount` against the latest save rather
 * than the one captured when the button rendered.
 */

export function emptyProgress(): TransferProgress {
  return { watch: [], locked: [] };
}

export function progressOf(account: Pick<Account, 'transfer'>): TransferProgress {
  return account.transfer ?? emptyProgress();
}

/** The band a rating falls in: the last one whose start the rating has reached. */
export function bandFor(rating: number, bands: readonly PriceBand[]): PriceBand | null {
  let found: PriceBand | null = null;
  for (const band of bands) if (rating >= band.minRating) found = band;
  return found;
}

/** What a catalogue card costs. 0 means it is not on sale. */
export function buyPrice(card: Pick<PlayerCard, 'id' | 'rating'>, config: TransferConfig): number {
  const override = config.overrides[card.id];
  if (override?.buy !== null && override?.buy !== undefined) return override.buy;
  return bandFor(card.rating, config.bands)?.buy ?? 0;
}

/**
 * What an owned card sells for. 0 means it cannot be sold.
 *
 * Priced off the catalogue card it came from and its base rating — a rank-up bonus
 * does not raise it. Upgrading a card to sell it would otherwise turn the rank-up
 * screen into a way to mint points.
 */
export function sellPrice(
  card: Pick<OwnedPlayer, 'playerId' | 'rating'>,
  config: TransferConfig,
): number {
  const override = config.overrides[card.playerId];
  if (override?.sell !== null && override?.sell !== undefined) return override.sell;
  return bandFor(card.rating, config.bands)?.sell ?? 0;
}

/** On the market tab: not hidden by the admin and priced above zero. */
export function isListed(card: Pick<PlayerCard, 'id' | 'rating'>, config: TransferConfig): boolean {
  if (config.overrides[card.id]?.hidden) return false;
  return buyPrice(card, config) > 0;
}

export type SellBlock = 'lineup' | 'locked' | 'no-price' | null;

/**
 * Why an owned card cannot be sold, or null when it can.
 *
 * A card in the lineup — starting eleven or bench — is refused outright: selling it
 * would silently empty a slot the player set up on purpose.
 */
export function sellBlock(
  card: OwnedPlayer,
  account: Pick<Account, 'squad' | 'transfer'>,
  config: TransferConfig,
): SellBlock {
  if (isInSquad(account.squad, card.id)) return 'lineup';
  if (progressOf(account).locked.includes(card.id)) return 'locked';
  if (sellPrice(card, config) <= 0) return 'no-price';
  return null;
}

export function ownedId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Identity for the copy being bought, fixed by the caller.
 *
 * `updateAccount` may run its mutator more than once, and a fresh id per run would
 * mean the card shown to the player is not the card that was saved.
 */
export interface BuyStamp {
  id: string;
  at: string;
}

export interface BuyOutcome {
  ok: boolean;
  error: BuyError | null;
  account: Account;
  card: OwnedPlayer | null;
}

/**
 * Buys one copy of a catalogue card.
 *
 * Validated before anything is charged — a full club is refused up front, because
 * `addPlayers` trims to capacity and would otherwise quietly drop a card the player
 * just paid for.
 */
export function buy(
  account: Account,
  card: PlayerCard,
  config: TransferConfig,
  stamp: BuyStamp = { id: ownedId(), at: new Date().toISOString() },
): BuyOutcome {
  const fail = (error: BuyError): BuyOutcome => ({ ok: false, error, account, card: null });

  if (!config.enabled) return fail('closed');
  if (!isListed(card, config)) return fail('not-listed');
  if (account.club.players.length >= CLUB_CAPACITY) return fail('club-full');

  const cost = buyPrice(card, config);
  const paid = debit(account.wallet, TRANSFER_CURRENCY, cost, { reason: 'purchase' });
  if (!paid.ok || !paid.entry) {
    return fail(paid.error === 'insufficient-funds' ? 'insufficient-funds' : 'at-cap');
  }

  const resolved = cardToPlayer(card);
  const owned: OwnedPlayer = {
    id: stamp.id,
    playerId: card.id,
    eventId: TRANSFER_EVENT_ID,
    name: resolved.name,
    rating: resolved.rating,
    position: resolved.position,
    set: resolved.set,
    nation: resolved.nation,
    club: resolved.club,
    portrait: resolved.portrait,
    ...(resolved.code ? { code: resolved.code } : {}),
    acquiredAt: stamp.at,
  };

  return {
    ok: true,
    error: null,
    card: owned,
    account: {
      ...account,
      wallet: paid.wallet,
      ledger: appendEntry(account.ledger, paid.entry),
      club: addPlayers(account.club, [owned]),
    },
  };
}

export interface SellOutcome {
  ok: boolean;
  error: SellError | null;
  account: Account;
  sold: number;
  earned: number;
}

/**
 * Sells every card in `cardIds` that is allowed to go, in one payment.
 *
 * Cards that are blocked are skipped rather than failing the batch — the selection
 * can go stale between tapping and confirming (a lock set in another tab, a card
 * moved into the lineup), and the rest of the sale is still what the player asked for.
 */
export function sell(
  account: Account,
  cardIds: readonly string[],
  config: TransferConfig,
  /**
   * Brings stored cards up to date with the catalogue before pricing — the price the
   * player saw was worked out from the refreshed card, so the payment must be too.
   */
  refresh: (cards: readonly OwnedPlayer[]) => OwnedPlayer[] = (cards) => [...cards],
): SellOutcome {
  const fail = (error: SellError): SellOutcome => ({ ok: false, error, account, sold: 0, earned: 0 });
  if (!config.enabled) return fail('closed');

  const wanted = new Set(cardIds);
  const going = refresh(account.club.players).filter(
    (card) => wanted.has(card.id) && sellBlock(card, account, config) === null,
  );
  if (going.length === 0) return fail('nothing-sellable');

  const earned = going.reduce((total, card) => total + sellPrice(card, config), 0);
  const paid = credit(account.wallet, TRANSFER_CURRENCY, earned, { reason: 'sale' });
  if (!paid.ok || !paid.entry) return fail('at-cap');

  const gone = new Set(going.map((card) => card.id));
  const progress = progressOf(account);

  return {
    ok: true,
    error: null,
    sold: going.length,
    earned,
    account: {
      ...account,
      wallet: paid.wallet,
      ledger: appendEntry(account.ledger, paid.entry),
      club: { players: account.club.players.filter((card) => !gone.has(card.id)) },
      transfer: { ...progress, locked: progress.locked.filter((id) => !gone.has(id)) },
    },
  };
}

/** Adds or removes a watched catalogue card. Refuses to go past the limit. */
export function toggleWatch(
  account: Account,
  cardId: string,
  limit: number,
): { ok: boolean; account: Account } {
  const progress = progressOf(account);
  if (progress.watch.includes(cardId)) {
    return {
      ok: true,
      account: {
        ...account,
        transfer: { ...progress, watch: progress.watch.filter((id) => id !== cardId) },
      },
    };
  }
  if (progress.watch.length >= limit) return { ok: false, account };
  return {
    ok: true,
    account: { ...account, transfer: { ...progress, watch: [...progress.watch, cardId] } },
  };
}

/** Locks or unlocks one owned card. */
export function toggleLock(account: Account, ownedCardId: string): Account {
  const progress = progressOf(account);
  const locked = progress.locked.includes(ownedCardId)
    ? progress.locked.filter((id) => id !== ownedCardId)
    : [...progress.locked, ownedCardId];
  return { ...account, transfer: { ...progress, locked } };
}
