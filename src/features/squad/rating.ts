import type { OwnedPlayer } from '@/features/club/types';
import { ratingWithPlus } from '@/features/rankup/plus';

/** Coarse lines. Every position the catalogue allows maps into one of these. */
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

const GROUPS: Record<PositionGroup, readonly string[]> = {
  GK: ['GK'],
  DEF: ['LB', 'CB', 'RB', 'LWB', 'RWB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'ST', 'CF'],
};

/** Unknown positions are treated as midfielders — the least wrong guess on a pitch. */
export function groupOf(position: string): PositionGroup {
  const upper = position.toUpperCase();
  for (const [group, members] of Object.entries(GROUPS)) {
    if (members.includes(upper)) return group as PositionGroup;
  }
  return 'MID';
}

const ORDER: PositionGroup[] = ['DEF', 'MID', 'ATT'];

/**
 * How much rating a player loses standing somewhere they do not play.
 *
 * Penalties are flat rather than proportional so the rule can be read off the card:
 * a winger at striker is always 3 worse, never "3 at 120 and 2 at 80". The gap
 * between lines is what actually hurts, which is why a defender at striker costs
 * five times a defender at midfield.
 *
 * Keepers are not priced here — `canPlace` refuses those placements outright, so
 * there is no number that could make one sensible.
 */
export const PENALTY = {
  /** Plays exactly there. */
  exact: 0,
  /** Same line, wrong spot — a CB at left back, a winger at striker. */
  sameLine: 3,
  /** One line away — a midfielder at centre back. */
  nextLine: 8,
  /** Defender up front, or a striker at the back. */
  farLine: 15,
} as const;

export function positionPenalty(slotPosition: string, playerPosition: string): number {
  const slot = slotPosition.toUpperCase();
  const player = playerPosition.toUpperCase();
  if (slot === player) return PENALTY.exact;

  const slotGroup = groupOf(slot);
  const playerGroup = groupOf(player);
  if (slotGroup === playerGroup) return PENALTY.sameLine;

  // A keeper anywhere else (or anyone in goal) never reaches this function in
  // practice, but if it does, the worst penalty is the honest answer.
  if (slotGroup === 'GK' || playerGroup === 'GK') return PENALTY.farLine;

  const distance = Math.abs(ORDER.indexOf(slotGroup) - ORDER.indexOf(playerGroup));
  return distance === 1 ? PENALTY.nextLine : PENALTY.farLine;
}

/**
 * What a card is worth in a given slot. Never drops below 1 — a card with a rating
 * is still a player, however badly it is being used.
 */
export function effectiveRating(player: OwnedPlayer, slotPosition: string): number {
  // The rank-up bonus is applied before the penalty, so a +8 winger played at
  // striker keeps most of what it was upgraded for rather than losing the bonus
  // twice over.
  return Math.max(1, ratingWithPlus(player) - positionPenalty(slotPosition, player.position));
}
