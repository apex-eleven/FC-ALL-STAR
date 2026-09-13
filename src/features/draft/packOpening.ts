import type { PullOutcome } from './pull';
import { PLAYER_SETS, type PlayerSet } from './types';

/**
 * The pack, from landing on screen to handing over to the reveal.
 *
 * `waiting` holds until the player taps — a pack that opens itself is just a longer
 * loading screen. Everything after the tap is on a timer, because the timings have
 * to line up with CSS keyframes rather than with anything the player does.
 */
export type PackPhase = 'waiting' | 'shake' | 'tear' | 'burst';

/**
 * Milliseconds per phase, measured against the keyframes in PackOpening.module.css.
 * Changing one here means changing its animation-duration there too.
 */
export const PACK_TIMING: Record<Exclude<PackPhase, 'waiting'>, number> = {
  /** Rattle and glow build. Long enough to read as strain, short enough not to nag. */
  shake: 620,
  /** Crimp strip rips away, body splits, light pours out of the seam. */
  tear: 560,
  /** White blowout that the reveal opens inside of. */
  burst: 420,
};

/** How long the pack takes to drop in before it can be tapped. */
export const PACK_ENTRY_MS = 460;

/**
 * The best tier in the batch, used to colour the glow.
 *
 * Read before anything is revealed, which is the point: the pack should already be
 * gold when a gold card is inside it. That is a tease, not a spoiler — the player
 * still does not know who.
 */
export function bestSet(outcomes: readonly PullOutcome[]): PlayerSet {
  return outcomes.reduce<PlayerSet>(
    (top, outcome) => (PLAYER_SETS.indexOf(outcome.set) < PLAYER_SETS.indexOf(top) ? outcome.set : top),
    'D',
  );
}
