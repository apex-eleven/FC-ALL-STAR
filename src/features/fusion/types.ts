import type { ShopReward } from '@/features/shop/types';

/**
 * ผสมการ์ด — the fusion bench under STAR PASS on the home rail.
 *
 * A fusion eats cards the player owns and rolls a hand of prizes face down. The
 * player turns one over and keeps it; the rest are torn up. Prizes are admin-set
 * reward lines, so a prize is a card at a fixed plus ("เมสซี่ +5"), a bag item, or
 * currency — the shop's shape, like the gachapon's.
 *
 * Two locks guard it, and they are different things:
 *   - the admin's `lockedIds` keeps a catalogue card out of the prize pool
 *   - the player's own lock (`account.transfer.locked`, the one that already stops a
 *     card being sold) keeps a card off the fusion bench
 * Reusing the sell lock is deliberate. A player who locked a card meant "this one is
 * not going anywhere", and a second list they had to tick again would be a trap.
 */

/** Colour band under a prize card. Same ladder the gachapon draws. */
export type FusionRarity = 'common' | 'rare' | 'epic' | 'legend' | 'mythic';
export const FUSION_RARITIES: readonly FusionRarity[] = [
  'common',
  'rare',
  'epic',
  'legend',
  'mythic',
];

export interface FusionPrize {
  id: string;
  enabled: boolean;
  /** Overrides the reward's own name on the card. '' = the reward's name. */
  name: string;
  reward: ShopReward;
  /** Relative chance, as the admin types it (a percentage when the list sums to 100). */
  chance: number;
  rarity: FusionRarity;
  /** Shout this one to the whole game's winners feed when a player keeps it. */
  announce: boolean;
}

export interface FusionConfig {
  enabled: boolean;
  /** Screen title, drawn big. */
  title: string;
  subtitle: string;
  /**
   * Rail tile artwork, as an uploaded data URL. '' falls back to the built-in art.
   *
   * The other rail tiles are files in `public/brand/`; this one is config so the icon
   * can be swapped from the panel without touching the deploy.
   */
  icon: string;
  /** How many owned cards one fusion eats. */
  materials: number;
  /** How many prizes are dealt face down for the player to choose from. */
  draws: number;
  /**
   * Catalogue card ids accepted as material. Empty = anything the player owns.
   * Mirrors the rank-up bench, where an empty list also means "anything goes".
   */
  materialIds: string[];
  /**
   * Catalogue card ids that may never be dealt, whatever the prize list says.
   *
   * A separate list rather than deleting the prize: a card pulled for one season
   * usually comes back, and an admin who had to rebuild the row each time would end
   * up leaving it in.
   */
  lockedIds: string[];
  prizes: FusionPrize[];
}

/** One face-down card in a dealt hand — a snapshot, not a pointer at the config. */
export interface FusionPick {
  prizeId: string;
  /** Name as it was dealt, so an admin edit cannot change what was promised. */
  name: string;
  rarity: FusionRarity;
  /** The reward exactly as it was rolled, paid out untouched when this one is chosen. */
  reward: ShopReward;
  /** Copied from the prize when dealt, so the feed does not re-read a changed config. */
  announce: boolean;
}

/**
 * A dealt hand waiting to be chosen from.
 *
 * Stored on the account rather than held in the screen: the materials are already
 * gone by the time the hand appears, so a closed tab between dealing and choosing
 * would otherwise cost the player their cards for nothing.
 */
export interface FusionOffer {
  id: string;
  at: string;
  /** Ids of the cards this hand cost, for the receipt line. */
  spent: string[];
  picks: FusionPick[];
}

export interface FusionWin {
  id: string;
  at: string;
  prizeId: string;
  name: string;
  rarity: FusionRarity;
}

export interface FusionState {
  /** Completed fusions. */
  fusions: number;
  /** The hand on the table, or null when there is nothing to choose. */
  pending: FusionOffer | null;
  /** Newest first, capped. */
  history: FusionWin[];
}

export type FusionError =
  | 'closed'
  | 'empty'
  | 'pending'
  | 'need-materials'
  | 'bad-material'
  | 'locked-material'
  | 'no-offer'
  | 'bad-pick'
  | 'club-full'
  | 'card-missing'
  | 'at-cap';
