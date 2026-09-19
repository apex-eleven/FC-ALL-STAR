import type { MatchOutcome } from './types';

/**
 * The quick simulation: a match decided from two ratings and a seed, with no engine
 * and no clock.
 *
 * Every mode that has to resolve a match nobody is watching goes through here — the
 * cup's other ties, a manager match settled without being played. The engine in
 * `src/match-engine/` is the other half: it plays a match out in front of someone.
 * Both must be able to produce the same kind of answer, which is why the score and
 * the outcome are separate steps — the engine supplies its own score, and the rules
 * that read a result never care which of the two produced it.
 */

/**
 * Deterministic 0..1 from a string.
 *
 * Seeded rather than random so the same inputs always produce the same match. A
 * player who reloads mid-bracket gets the tie they already played, not a re-roll —
 * and a restored save rebuilds the identical run.
 */
export function seeded(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // FNV alone is uniform across millions of inputs but clumpy across a handful of
  // near-identical ones — and near-identical is exactly what this gets: the same run
  // with the round and seat numbers ticking up. Measured over the first 400
  // sequential seeds it produced 0.75% draws where 20% was expected. The avalanche
  // step below (murmur3's finalizer) spreads those neighbours apart; the same
  // measurement then lands at 19%.
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;

  // >>> 0 keeps it unsigned; the divisor is 2^32.
  return (hash >>> 0) / 4294967296;
}

/**
 * Resolves one fixture.
 *
 * Rating decides the odds, not the result: a 20-point gap is heavy odds, not a
 * guarantee, and an empty squad still gets to play rather than auto-losing. Draws
 * take the middle band, which is why the loss threshold is not simply 1 - winChance.
 */
export function playMatch(seed: string, rating: number, opponentRating: number): MatchOutcome {
  const gap = rating - opponentRating;
  // 0.5 at parity, saturating either side so no match is ever a certainty.
  const winChance = Math.min(0.85, Math.max(0.1, 0.5 + gap * 0.02));
  const drawChance = 0.2;

  const roll = seeded(seed);
  if (roll < winChance) return 'win';
  if (roll < winChance + drawChance) return 'draw';
  return 'loss';
}

/**
 * A scoreline that agrees with the result.
 *
 * A result needs a score behind it — but the score must never contradict the outcome
 * the odds already decided. Winners get 1-3, draws are level, and the loser's tally
 * is derived from the winner's rather than rolled separately.
 */
export function scoreFor(seed: string, outcome: MatchOutcome): [number, number] {
  const roll = seeded(`${seed}:score`);

  if (outcome === 'draw') {
    // 0-0, 1-1, 2-2 — weighted toward the low, dull ones, as draws are.
    const level = roll < 0.45 ? 0 : roll < 0.85 ? 1 : 2;
    return [level, level];
  }

  const winner = 1 + Math.floor(roll * 3);
  const loser = Math.max(0, winner - 1 - Math.floor(seeded(`${seed}:margin`) * 2));
  return outcome === 'win' ? [winner, loser] : [loser, winner];
}

/**
 * A knockout tie.
 *
 * **Not** `playMatch` with the draw removed, which is what this was first written
 * as. `playMatch` saturates its win chance at 0.85 and then spends a flat 0.2 on
 * draws, so a side 25 or more points clear has a loss chance of *exactly zero* —
 * measured over 2,000 ties, a +30 favourite went through 94.5% of the time and
 * could not be beaten inside 90 minutes at all. In a league table that hardly shows;
 * in a cup it removes the only thing a cup is for. Nobody enters a bracket to watch
 * the seeding come true.
 *
 * So a tie gets its own curve: the draw takes a fixed share, and the rest is split
 * between the two sides by rating with a floor under the underdog. A +30 favourite
 * now goes through about 83% of ties and loses in normal time about 1 time in 10.
 *
 * `playMatch` is deliberately left alone — manager mode's numbers were measured
 * against it, and retuning a shared function to fix a different mode is how two
 * modes end up sharing a compromise that suits neither.
 */

/** The draw's share of a tie, before penalties. */
const TIE_DRAW_CHANCE = 0.22;

/**
 * How the non-draw share splits. Floored at 0.12 either way, so no tie is ever
 * decided before it is played — the floor is the upset.
 */
export function tieOdds(
  rating: number,
  opponentRating: number,
): { win: number; draw: number; loss: number } {
  const share = Math.min(0.88, Math.max(0.12, 0.5 + (rating - opponentRating) * 0.02));
  const decisive = 1 - TIE_DRAW_CHANCE;
  const win = decisive * share;
  return { win, draw: TIE_DRAW_CHANCE, loss: decisive - win };
}

export interface TieResult {
  score: [number, number];
  /** Penalties, when the 90 minutes finished level. */
  shootout: [number, number] | null;
  /** True when the home side went through. */
  homeWon: boolean;
}

export function playTie(seed: string, rating: number, opponentRating: number): TieResult {
  const odds = tieOdds(rating, opponentRating);
  const roll = seeded(seed);
  const outcome: MatchOutcome =
    roll < odds.win ? 'win' : roll < odds.win + odds.draw ? 'draw' : 'loss';
  const score = scoreFor(seed, outcome);

  if (outcome !== 'draw') {
    return { score, shootout: null, homeWon: outcome === 'win' };
  }

  // A shootout is close to a coin toss whatever the two sides are rated — that is
  // what makes cup football worth watching. The rating gap is worth a nudge, not a
  // verdict.
  const gap = rating - opponentRating;
  const homeChance = Math.min(0.65, Math.max(0.35, 0.5 + gap * 0.005));
  const homeWon = seeded(`${seed}:pens`) < homeChance;

  const winnerPens = 3 + Math.floor(seeded(`${seed}:pens:count`) * 3); // 3..5
  const loserPens = Math.max(0, winnerPens - 1 - Math.floor(seeded(`${seed}:pens:margin`) * 2));
  return {
    score,
    shootout: homeWon ? [winnerPens, loserPens] : [loserPens, winnerPens],
    homeWon,
  };
}

/**
 * The shootout a live match needs when it ends level.
 *
 * The engine plays the 90 minutes and hands back a score; if that score is level the
 * tie still has to produce a winner, and it produces it the same way an unwatched
 * tie does rather than by a second, different rule.
 */
export function shootoutFor(
  seed: string,
  rating: number,
  opponentRating: number,
): { shootout: [number, number]; homeWon: boolean } {
  const gap = rating - opponentRating;
  const homeChance = Math.min(0.65, Math.max(0.35, 0.5 + gap * 0.005));
  const homeWon = seeded(`${seed}:pens`) < homeChance;
  const winnerPens = 3 + Math.floor(seeded(`${seed}:pens:count`) * 3);
  const loserPens = Math.max(0, winnerPens - 1 - Math.floor(seeded(`${seed}:pens:margin`) * 2));
  return {
    shootout: homeWon ? [winnerPens, loserPens] : [loserPens, winnerPens],
    homeWon,
  };
}
