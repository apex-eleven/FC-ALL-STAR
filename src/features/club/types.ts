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
}

export interface Club {
  players: OwnedPlayer[];
}
