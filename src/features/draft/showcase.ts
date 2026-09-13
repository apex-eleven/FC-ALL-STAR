import type { PlayerCard } from '@/features/players/types';
import { cardToPlayer } from './pool';
import { showcasePlayers } from './pull';
import type { DraftPlayer, ShowcaseSlot } from './types';

/**
 * Works out which card each banner slot shows.
 *
 * Two sources, in order:
 *
 * 1. A card an admin pinned to the slot. Looked up in the catalogue, **not** in the
 *    pack — the banner is a poster, and a pack may want to lead with a card while its
 *    pool is still being built, or show a face that is not in this pack at all.
 * 2. Whatever is left: the pack's highest-rated cards, in order, skipping any already
 *    pinned so the same player never appears twice on one banner.
 *
 * A pinned id whose card has been deleted falls back to the automatic fill rather
 * than leaving a hole, which is the same rule every other read in this codebase
 * follows: repair against what actually exists.
 */
export function resolveShowcase(
  slots: readonly ShowcaseSlot[],
  pool: readonly DraftPlayer[],
  byId: (id: string) => PlayerCard | undefined,
): (DraftPlayer | null)[] {
  const pinned = slots.map((slot) => {
    if (!slot.cardId) return null;
    const card = byId(slot.cardId);
    return card ? cardToPlayer(card) : null;
  });

  const taken = new Set(pinned.filter((player): player is DraftPlayer => player !== null).map((p) => p.id));

  // Ask for enough that skipping the pinned ones still fills every empty slot.
  const automatic = showcasePlayers(pool, slots.length + taken.size).filter(
    (player) => !taken.has(player.id),
  );

  let next = 0;
  return pinned.map((player) => player ?? automatic[next++] ?? null);
}
