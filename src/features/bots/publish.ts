import type { Account } from '@/features/auth/types';
import { displayNameOf } from '@/features/auth/constants';
import { syncOwned } from '@/features/club/sync';
import type { LeaderboardCard, LeaderboardEntry } from '@/features/leaderboard/types';
import type { CardLookup } from '@/features/shop/shop';
import { formationOf, indexOwned } from '@/features/squad/squad';
import type { OwnedIndex, Squad } from '@/features/squad/types';

/** Short FNV-1a fingerprint, so the profile stores a few bytes instead of the whole row. */
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * The leaderboard row a bot publishes — built field for field the way ClubScreen's
 * publish effect builds a real player's, so the two cannot be told apart in the
 * collection. Returns null for a squad with nothing worth showing, the same rule
 * the club screen applies before it writes.
 */
export function leaderboardEntryOf(
  account: Account,
  byId: CardLookup,
  ratingOf: (squad: Squad, owned: OwnedIndex) => number,
  now: Date,
): { entry: LeaderboardEntry; signature: string } | null {
  const players = syncOwned(account.club.players, byId);
  const owned = indexOwned(players);
  const squad = account.squad;
  const formation = formationOf(squad);
  const rating = ratingOf(squad, owned);
  if (rating <= 0) return null;

  const cards: LeaderboardCard[] = formation.slots.flatMap((slot) => {
    const cardId = squad.starters[slot.id];
    const player = cardId ? owned.get(cardId) : undefined;
    if (!player) return [];
    return [
      {
        slotId: slot.id,
        position: player.position,
        name: player.name,
        rating: player.rating,
        plus: player.plus ?? 0,
        portrait: player.portrait,
        ...(player.oneOfOne?.length ? { oneOfOne: player.oneOfOne } : {}),
      },
    ];
  });

  const snapshot = {
    uid: account.id,
    username: displayNameOf(account),
    avatarId: account.avatarId,
    rating,
    formation: squad.formation,
    cards,
  };
  return {
    signature: fingerprint(JSON.stringify(snapshot)),
    entry: { ...snapshot, updatedAt: now.toISOString() },
  };
}
