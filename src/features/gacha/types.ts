import type { ShopReward } from '@/features/shop/types';

/**
 * Gachapon (กาชาปอง) — the roulette behind the home rail's "กิจกรรม" tile.
 *
 * A spin costs keys, rolls one prize against admin-set percentages, and pays the
 * prize as a reward line (currency, catalogue card, or bag item — the shop's shape,
 * so anything the game hands out can be a prize).
 */

/** Colour band under a prize card, as the reference draws it. */
export type GachaRarity = 'common' | 'rare' | 'epic' | 'legend' | 'mythic';
export const GACHA_RARITIES: readonly GachaRarity[] = ['common', 'rare', 'epic', 'legend', 'mythic'];

export interface GachaPrize {
  id: string;
  enabled: boolean;
  /** Overrides the reward's own name on the card. '' = the reward's name. */
  name: string;
  reward: ShopReward;
  /** Relative chance, as the admin types it (a percentage when the list sums to 100). */
  chance: number;
  rarity: GachaRarity;
  /** Announce this win to everyone in the winners feed. */
  announce: boolean;
}

export interface GachaConfig {
  enabled: boolean;
  /** Screen title, drawn big. */
  title: string;
  /** Name across the case art. */
  caseName: string;
  subtitle: string;
  /** Keys one spin costs. */
  keyCost: number;
  /** Uploaded case art, or '' for the drawn crate. */
  caseImage: string;
  prizes: GachaPrize[];
}

/** Stored on the account: what this player has won lately. */
export interface GachaWin {
  id: string;
  at: string;
  prizeId: string;
  /** Name as it was shown, so history still reads after an admin edit. */
  name: string;
  rarity: GachaRarity;
}

export interface GachaState {
  spins: number;
  /** Newest first, capped. */
  history: GachaWin[];
}

export type GachaError =
  | 'closed'
  | 'empty'
  | 'no-keys'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';
