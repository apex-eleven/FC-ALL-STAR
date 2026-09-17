import type { CurrencyKind } from '@/features/currencies/types';

/**
 * Bag items (กระเป๋า).
 *
 * An admin defines each item — name, art, and what it does — and the game hands out
 * copies through any reward list (shop, missions, Star Pass) or the admin panel. The
 * account keeps a count per item id; using an item spends one.
 */

export type ItemEffect =
  /**
   * Unlocks a profile avatar and puts it on. `avatarId` '' = the item's own picture
   * becomes a new avatar (named `avatarName`); otherwise a catalogue avatar is
   * unlocked regardless of level.
   */
  | { type: 'avatar'; avatarId: string; avatarName: string }
  /** Switched on in manager mode: a ranked loss keeps its stars and spends one. */
  | { type: 'shield' }
  /** A random catalogue card rated ovrMin..ovrMax, arriving at plusMin..plusMax. */
  | { type: 'pack'; ovrMin: number; ovrMax: number; plusMin: number; plusMax: number }
  /** Changes the name shown in game. The login ID stays the same. */
  | { type: 'rename' }
  /** Raises one owned card to this plus level. */
  | { type: 'plus'; plus: number }
  /** A random amount min..max of one currency. */
  | { type: 'box'; currency: CurrencyKind; min: number; max: number }
  /** The player picks any catalogue card rated ovrMin..ovrMax. */
  | { type: 'pick'; ovrMin: number; ovrMax: number }
  /** Opens the Star Pass premium line for the current season. */
  | { type: 'premium' };

export type ItemType = ItemEffect['type'];

export interface ItemDef {
  id: string;
  enabled: boolean;
  name: string;
  description: string;
  /** Uploaded data URL, or '' for the default art of the item's type. */
  image: string;
  effect: ItemEffect;
}

export interface ItemsConfig {
  items: ItemDef[];
}

/** Stored on the account. Absent until the first item arrives. */
export interface Inventory {
  /** Copies held, by item id. Zero counts are dropped. */
  counts: Record<string, number>;
  /** Avatar ids unlocked by items, on top of the level unlocks. */
  avatars: string[];
  /** Whether a manager-mode star shield is switched on for ranked matches. */
  shieldArmed: boolean;
}

export type ItemUseError =
  | 'unknown'
  | 'disabled'
  | 'none-left'
  | 'wrong-type'
  | 'owned'
  | 'bad-name'
  | 'no-card'
  | 'not-eligible'
  | 'club-full'
  | 'at-cap'
  | 'closed';
