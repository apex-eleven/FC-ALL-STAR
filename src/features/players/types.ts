import type { Entity } from '@/types/common';
import type { PlayerSet } from '@/features/draft/types';

/**
 * One card in the catalogue.
 *
 * The catalogue is the collection; packs hold ids into it. Editing a card here
 * changes what future pulls produce and never touches a copy somebody already owns —
 * cards in a club are snapshots taken at pull time.
 */
export interface PlayerCard extends Entity {
  name: string;
  /** 1..199, shown in the corner of the card. */
  rating: number;
  /** GK, CB, CM, ST … free text, but the editor offers the usual list. */
  position: string;
  /** Rarity tier. A is best, D is filler. Drives the odds every pack rolls on. */
  set: PlayerSet;
  /** Short nation code, e.g. THA. */
  nation: string;
  club: string;
  /**
   * File name under `public/players/`, e.g. `p021.webp` — never a full URL.
   *
   * A stored URL would break the moment the file is renamed or the app moves to a
   * different base path, and the art is far too large to live in storage as a data
   * URL the way banner images do.
   */
  artId: string | null;
  createdAt: string;
}

export type PlayerCatalogue = readonly PlayerCard[];

/** What the editor submits. Everything else is filled in on save. */
export type PlayerCardDraft = Omit<PlayerCard, 'createdAt'>;
