import { roundCount } from './constants';
import type { CupTie } from './types';

/**
 * The bracket: seeding, the empty tie board, and how a winner moves up it.
 *
 * All pure, and all in terms of **seat indexes** into `CupRun.teams`. A tie never
 * holds a team, only the seat it is waiting on, which is what lets the whole board
 * exist from the moment the player enters instead of being grown a round at a time.
 */

/**
 * Standard knockout seeding for `size` seats.
 *
 * Seat 0 is the top seed. The order returned is the order the first round pairs off
 * in — neighbours meet — so the top seed and the second seed can only meet in the
 * final, the way a real draw protects them.
 *
 * Built by doubling: [0,1] becomes [0,3,1,2] becomes [0,7,3,4,1,6,2,5]. At each step
 * every seat s is followed by its mirror (n-1-s), which is the property the whole
 * thing rests on.
 */
export function seedOrder(size: number): number[] {
  let order = [0, 1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const seat of order) {
      next.push(seat, n - 1 - seat);
    }
    order = next;
  }
  return order.slice(0, size);
}

/**
 * An empty board: every round's ties, with the first round already paired and the
 * rest waiting on -1.
 */
export function emptyBoard(size: number): CupTie[][] {
  const rounds = roundCount(size);
  const order = seedOrder(size);

  const board: CupTie[][] = [];
  for (let round = 0; round < rounds; round += 1) {
    const ties = size >> (round + 1);
    board.push(
      Array.from({ length: ties }, (_, index): CupTie => {
        const first = round === 0;
        return {
          a: first ? (order[index * 2] ?? -1) : -1,
          b: first ? (order[index * 2 + 1] ?? -1) : -1,
          played: false,
          score: [0, 0],
          shootout: null,
          winner: -1,
          live: false,
        };
      }),
    );
  }
  return board;
}

/**
 * Where a tie's winner goes next.
 *
 * Tie `index` of a round feeds slot `index >> 1` of the next, taking side `a` when
 * its index is even and `b` when it is odd. That is the same halving the seeding was
 * built by, so a bracket drawn on screen and the one that plays out are the same
 * shape.
 */
export function advanceSlot(index: number): { tie: number; side: 'a' | 'b' } {
  return { tie: index >> 1, side: index % 2 === 0 ? 'a' : 'b' };
}

/** The tie the given seat is in this round, or -1. */
export function tieOf(ties: readonly CupTie[], seat: number): number {
  return ties.findIndex((tie) => tie.a === seat || tie.b === seat);
}

/** True when `seat` is the home side of that tie — it matters for the scoreline. */
export function isHome(tie: CupTie, seat: number): boolean {
  return tie.a === seat;
}
