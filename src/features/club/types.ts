import type { Entity } from '@/types/common';
import type { PlayerSet } from '@/features/draft/types';

/**
 * A card an account owns.
 *
 * Deliberately a snapshot rather than a reference into the draft catalogue: an admin
 * can rename, retune, or delete a pool entry, and a card somebody already pulled must
 * not change or disappear because of it. `playerId` and `eventId` are kept for
 * provenance, not for lookup.
 */
export interface OwnedPlayer extends Entity {
  playerId: string;
  eventId: string;
  name: string;
  rating: number;
  position: string;
  set: PlayerSet;
  nation: string;
  club: string;
  portrait: string;
  acquiredAt: string;
  /**
   * Rank-up level, 0..MAX_PLUS. Absent on cards pulled before the system existed,
   * which reads as +0 everywhere.
   *
   * This is the one field on an owned card that is genuinely its own rather than a
   * snapshot: `syncOwned` rewrites name, rating, and position from the catalogue on
   * every read, so a bonus baked into `rating` would be erased the next time an
   * admin touched the card. The level is stored and the rating is derived — see
   * features/rankup/plus.ts.
   */
  plus?: number;
}

export interface Club {
  players: OwnedPlayer[];
}

/**
 * The minimal shape a card needs to be drawn — by `SquadCard`, positioned by
 * `PitchSlot`, and rated by `effectiveRating`.
 *
 * `OwnedPlayer` satisfies this structurally, so every real card already works with
 * no change. It exists so those same components can also draw a card that came back
 * from someone else's published leaderboard entry, which is a snapshot with no
 * `id`, `set`, or `acquiredAt` of its own.
 */
export interface DisplayCard {
  name: string;
  rating: number;
  position: string;
  portrait: string;
  plus?: number;
}
