import { clampPlus, ratingWithPlus } from '@/features/rankup/plus';
import { CLUB_CAPACITY, SQUAD_SIZE } from './constants';
import type { Club, OwnedPlayer } from './types';

export function emptyClub(): Club {
  return { players: [] };
}

function isOwnedPlayer(value: unknown): value is OwnedPlayer {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.rating === 'number' &&
    Number.isFinite(p.rating) &&
    typeof p.position === 'string' &&
    typeof p.set === 'string'
  );
}

/** Repairs a club read from storage. Anything malformed is dropped, not guessed at. */
export function normalizeClub(value: unknown): Club {
  if (typeof value !== 'object' || value === null) return emptyClub();

  const source = value as { players?: unknown };
  if (!Array.isArray(source.players)) return emptyClub();

  // `plus` is repaired here rather than trusted: it drives a rating bonus, and a
  // hand-edited 999 would hand out a bonus no ladder row ever offered.
  const players = source.players
    .filter(isOwnedPlayer)
    .slice(0, CLUB_CAPACITY)
    .map((player) => (player.plus === undefined ? player : { ...player, plus: clampPlus(player.plus) }));

  return { players };
}

/** Newest first, trimmed to CLUB_CAPACITY. */
export function addPlayers(club: Club, incoming: readonly OwnedPlayer[]): Club {
  if (incoming.length === 0) return club;
  return { players: [...incoming, ...club.players].slice(0, CLUB_CAPACITY) };
}

/**
 * Club rating: the average of the best eleven, rounded.
 *
 * A club with fewer than eleven cards averages what it has rather than padding with
 * zeroes, which would make a strong new account look worse than an empty one.
 */
export function clubRating(club: Club): number {
  if (club.players.length === 0) return 0;

  // Ranked and totalled on the upgraded rating, not the base one — a +8 card that
  // still counted as its printed rating would make the whole screen pointless.
  const best = [...club.players]
    .sort((a, b) => ratingWithPlus(b) - ratingWithPlus(a))
    .slice(0, SQUAD_SIZE);

  const total = best.reduce((sum, player) => sum + ratingWithPlus(player), 0);
  return Math.round(total / best.length);
}

export function countBySet(club: Club): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const player of club.players) {
    counts[player.set] = (counts[player.set] ?? 0) + 1;
  }
  return counts;
}
