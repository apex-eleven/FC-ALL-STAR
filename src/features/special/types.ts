/**
 * Special cards (การ์ดพิเศษ).
 *
 * An admin sets up an offer: eleven cards from the catalogue, one special card, and a
 * price in Special Point. A player who owns all eleven — any copy of each, at any plus,
 * in the lineup or not — may buy the special card with Special Point. The eleven stay
 * in the club: they are a key, not a price.
 *
 * Each offer can be bought once per account. The offer list is admin config that
 * players only read, so the one limit that can be honoured is per account.
 */

export interface SpecialOffer {
  id: string;
  enabled: boolean;
  /** Shown over the offer. Empty = the special card's own name. */
  name: string;
  /** Catalogue ids of the eleven cards a player must own. Distinct; exactly REQUIRED_CARDS to be buyable. */
  requiredIds: string[];
  /** Catalogue id of the card the offer sells. '' = not chosen yet. */
  cardId: string;
  /** Rank-up level the special card arrives at, 0..MAX_PLUS. */
  plus: number;
  /** Special Point. */
  price: number;
}

export interface SpecialConfig {
  enabled: boolean;
  /** Screen heading. */
  title: string;
  /** Small print on the screen. */
  note: string;
  offers: SpecialOffer[];
}

export type SpecialError =
  | 'closed'
  | 'disabled'
  | 'unset'
  | 'locked'
  | 'bought'
  | 'insufficient-funds'
  | 'club-full'
  | 'card-missing';

/** One offer this account has bought. */
export interface SpecialPurchase {
  at: string;
}

export interface SpecialProgress {
  /** Keyed by offer id. */
  bought: Record<string, SpecialPurchase>;
}
