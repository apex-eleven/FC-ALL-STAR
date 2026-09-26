import { normalizeOneOfOne } from '@/features/rankup/oneOfOne';
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
    .map((player) => (player.plus === undefined ? player : { ...player, plus: clampPlus(player.plus) }))
    // The 1 OF 1 title is a claim on a shared register; a hand-edited one is dropped
    // down to levels that can carry a title, and dropped entirely if none are left.
    .map((player) => {
      if (player.oneOfOne === undefined) return player;
      const { oneOfOne, ...rest } = player;
      const levels = normalizeOneOfOne(oneOfOne);
      return levels ? { ...rest, oneOfOne: levels } : rest;
    });

  return { players };
}

/** Newest first, trimmed to CLUB_CAPACITY. */
export function addPlayers(club: Club, incoming: readonly OwnedPlayer[]): Club {
  if (incoming.length === 0) return club;
  return { players: [...incoming, ...club.players].slice(0, CLUB_CAPACITY) };
}

/**
 * Club rating: the average of the best eleven cards owned, rounded.
 *
 * Deliberately not the same question as `squadRating`, which grades the eleven
 * actually picked and docks a card for playing out of position. This one is "how
 * strong is the collection", so upgrading a card moves it whether or not that card
 * is in the lineup. Not currently shown anywhere — the home tile and the club panel
 * both show `squadRating` instead, since a collection number was reading as if it
 * were the fielded team's OVR.
 *
 * Ranked and totalled on the upgraded rating: a +8 card still counted at its printed
 * number would make rank-up invisible here.
 *
 * A club with fewer than eleven cards averages what it has rather than padding with
 * zeroes, which would make a strong new account look worse than an empty one.
 */
export function clubRating(club: Club): number {
  if (club.players.length === 0) return 0;

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
