import type { OwnedPlayer } from '@/features/club/types';
import { MAX_PLUS } from './constants';

/**
 * 1 OF 1 — the first copy of a card anywhere on the server to be ranked up to +9,
 * and the first to +10, each carry a gold "1 OF 1" plate for good.
 *
 * "A card" is the catalogue card, told apart by its card number (`code`) when it has
 * one — the identity the admin types in, which survives the entry being deleted and
 * re-added — and by its catalogue id otherwise. Two copies of the same Messi are the
 * same card; Messi and Ronaldo are two titles to win.
 *
 * The title is a record of a moment, so it is never taken back: a 1 OF 1 card that
 * later fails down to +8 is still the one that got there first.
 */

/** The levels that carry a title. */
export const ONE_OF_ONE_LEVELS: readonly number[] = [9, 10];

export function isOneOfOneLevel(level: number): boolean {
  return ONE_OF_ONE_LEVELS.includes(level);
}

/** Firestore ids cannot contain '/', and should stay short and plain. */
function clean(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

/** Which title a rank-up would win: one per card, per level. */
export function oneOfOneKey(card: Pick<OwnedPlayer, 'playerId' | 'code'>, level: number): string {
  const identity = card.code ? `n-${clean(card.code)}` : `p-${clean(card.playerId)}`;
  return `${identity}_${level}`;
}

export function hasOneOfOne(card: { oneOfOne?: number[] }): boolean {
  return (card.oneOfOne?.length ?? 0) > 0;
}

/** Repairs the field read back from a save: title levels only, each once, in order. */
export function normalizeOneOfOne(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const levels = [...new Set(value)]
    .filter((level): level is number => typeof level === 'number' && isOneOfOneLevel(level) && level <= MAX_PLUS)
    .sort((a, b) => a - b);
  return levels.length > 0 ? levels : undefined;
}

/** Marks one owned copy with a title it won. A card no longer owned is left alone. */
export function withOneOfOne(players: readonly OwnedPlayer[], cardId: string, level: number): OwnedPlayer[] {
  return players.map((card) =>
    card.id === cardId
      ? { ...card, oneOfOne: normalizeOneOfOne([...(card.oneOfOne ?? []), level]) }
      : card,
  );
}

/** What is written where the title is claimed — enough to say who holds it. */
export interface OneOfOneRecord {
  key: string;
  level: number;
  uid: string;
  username: string;
  /** The owned copy that won it. */
  cardId: string;
  playerId: string;
  code: string;
  name: string;
  at: string;
}

export type OneOfOneResult = 'won' | 'taken' | 'error';
