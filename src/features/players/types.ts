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
  /**
   * Card number the admin types in — the card's own identity, independent of `id`.
   *
   * `id` is generated, so deleting a card and adding it again makes a new one; the
   * code is what the admin decides, and survives that. Team crests match on it. Shown
   * only in the admin panel. '' = not assigned yet (cards made before codes existed).
   *
   * Hidden from players in the UI, not secret: the catalogue is shared config, so
   * anyone who opens DevTools can read it. Don't put anything private in it.
   */
  code: string;
  createdAt: string;
}

export type PlayerCatalogue = readonly PlayerCard[];

/** What the editor submits. Everything else is filled in on save. */
export type PlayerCardDraft = Omit<PlayerCard, 'createdAt' | 'code'> & { code?: string };
