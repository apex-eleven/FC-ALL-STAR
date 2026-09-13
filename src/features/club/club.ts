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

  return { players: source.players.filter(isOwnedPlayer).slice(0, CLUB_CAPACITY) };
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

  const best = [...club.players]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, SQUAD_SIZE);

  const total = best.reduce((sum, player) => sum + player.rating, 0);
  return Math.round(total / best.length);
}

export function countBySet(club: Club): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const player of club.players) {
    counts[player.set] = (counts[player.set] ?? 0) + 1;
  }
  return counts;
}
