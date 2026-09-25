import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { appendEntry, debit } from '@/features/currencies/wallet';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import { REQUIRED_CARDS, SPECIAL_EVENT_ID } from './constants';
import type { SpecialConfig, SpecialError, SpecialOffer, SpecialProgress } from './types';

/**
 * Pure special-card rules. No storage, no React — the caller fixes the clock and the
 * stamp before `updateAccount`, so a mutator that runs twice lands on the same card id.
 */

export function emptyProgress(): SpecialProgress {
  return { bought: {} };
}

export function progressOf(account: Pick<Account, 'special'>): SpecialProgress {
  return account.special ?? emptyProgress();
}

export function isBought(progress: SpecialProgress, offer: SpecialOffer): boolean {
  return Boolean(progress.bought[offer.id]);
}

/** Whether the admin has finished setting the offer up: eleven cards and a card to sell. */
export function isComplete(offer: SpecialOffer): boolean {
  return offer.requiredIds.length === REQUIRED_CARDS && offer.cardId !== '';
}

/** Catalogue ids the club holds at least one copy of. */
export function ownedCatalogueIds(players: readonly OwnedPlayer[]): Set<string> {
  return new Set(players.map((card) => card.playerId));
}

/**
 * Each of the offer's eleven slots, in order: the catalogue id it asks for and the
 * club's copy that fills it (the highest plus, so the slot shows the player's best),
 * or null while the club has none.
 */
export function slotsOf(
  offer: SpecialOffer,
  players: readonly OwnedPlayer[],
): { cardId: string; owned: OwnedPlayer | null }[] {
  const best = new Map<string, OwnedPlayer>();
  for (const card of players) {
    const held = best.get(card.playerId);
    if (!held || (card.plus ?? 0) > (held.plus ?? 0)) best.set(card.playerId, card);
  }
  return offer.requiredIds.map((cardId) => ({ cardId, owned: best.get(cardId) ?? null }));
}

/** How many of the eleven the club holds. */
export function filledCount(offer: SpecialOffer, players: readonly OwnedPlayer[]): number {
  const owned = ownedCatalogueIds(players);
  return offer.requiredIds.filter((id) => owned.has(id)).length;
}

/** Why this account cannot buy the offer right now, or null when it can. */
export function refuse(
  config: SpecialConfig,
  offer: SpecialOffer,
  account: Pick<Account, 'special' | 'club' | 'wallet'>,
): SpecialError | null {
  if (!config.enabled) return 'closed';
  if (!offer.enabled) return 'disabled';
  if (!isComplete(offer)) return 'unset';
  if (isBought(progressOf(account), offer)) return 'bought';
  if (filledCount(offer, account.club.players) < REQUIRED_CARDS) return 'locked';
  if (account.wallet.special < offer.price) return 'insufficient-funds';
  return null;
}

export interface BuyInput {
  config: SpecialConfig;
  offerId: string;
  now: Date;
  lookup: CardLookup;
  stamp: ShopStamp;
}

export type BuyOutcome =
  | { ok: true; error: null; account: Account; offer: SpecialOffer; card: OwnedPlayer }
  | { ok: false; error: SpecialError; account: Account; offer: SpecialOffer | null; card: null };

function failed(account: Account, error: SpecialError, offer: SpecialOffer | null): BuyOutcome {
  return { ok: false, error, account, offer, card: null };
}

/**
 * Buys an offer: takes the Special Point, hands over the special card and files the
 * purchase — one new account, so the points are never taken without the card, nor the
 * card given without the purchase being recorded. Everything is checked before
 * anything is charged; the eleven cards are only looked at, never removed.
 */
export function buy(account: Account, input: BuyInput): BuyOutcome {
  const { config, offerId, now, lookup, stamp } = input;
  const offer = config.offers.find((entry) => entry.id === offerId) ?? null;
  if (!offer) return failed(account, 'disabled', null);

  const refused = refuse(config, offer, account);
  if (refused) return failed(account, refused, offer);
  // The card for sale must still exist in the catalogue.
  if (!lookup(offer.cardId)) return failed(account, 'card-missing', offer);

  let charged: Account = account;
  if (offer.price > 0) {
    const paid = debit(account.wallet, 'special', offer.price, { reason: 'special' });
    if (!paid.ok) return failed(account, 'insufficient-funds', offer);
    charged = { ...account, wallet: paid.wallet, ledger: appendEntry(account.ledger, paid.entry) };
  }

  const given = deliverRewards(
    charged,
    [{ kind: 'card', cardId: offer.cardId, amount: 1, plus: offer.plus }],
    lookup,
    stamp,
    'special',
    SPECIAL_EVENT_ID,
  );
  if (!given.ok) return failed(account, given.error === 'club-full' ? 'club-full' : 'card-missing', offer);
  const card = given.cards[0];
  if (!card) return failed(account, 'card-missing', offer);

  const progress = progressOf(account);
  return {
    ok: true,
    error: null,
    offer,
    card,
    account: {
      ...given.account,
      special: { bought: { ...progress.bought, [offer.id]: { at: now.toISOString() } } },
    },
  };
}
