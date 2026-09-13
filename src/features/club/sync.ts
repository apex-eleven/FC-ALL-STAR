import { cardToPlayer } from '@/features/draft/pool';
import type { PlayerCard } from '@/features/players/types';
import type { OwnedPlayer } from './types';

/**
 * Refreshes owned cards from the catalogue.
 *
 * `OwnedPlayer` was written as a pure snapshot so a pulled card could not change
 * under the player. That is right for a live game with a remote operator — and wrong
 * for this one, where the admin panel is the same person playing: editing a card to
 * GK and then finding it still refuses the keeper slot reads as a broken game, not as
 * a guarantee being honoured.
 *
 * So: a card whose catalogue entry still exists follows it. A card whose entry was
 * deleted keeps its snapshot and stays exactly as it was pulled — nothing an admin
 * removes can take a card out of somebody's club.
 *
 * Identity is untouched. `id`, `acquiredAt`, `playerId`, and `eventId` describe the
 * pull that happened; only what the card *is* comes from the catalogue.
 */
export function syncOwned(
  players: readonly OwnedPlayer[],
  byId: (id: string) => PlayerCard | undefined,
): OwnedPlayer[] {
  return players.map((owned) => {
    const card = byId(owned.playerId);
    if (!card) return owned;

    const live = cardToPlayer(card);
    return {
      ...owned,
      name: live.name,
      rating: live.rating,
      position: live.position,
      set: live.set,
      nation: live.nation,
      club: live.club,
      portrait: live.portrait,
    };
  });
}
