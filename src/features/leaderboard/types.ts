import type { FormationId } from '@/features/squad/types';

/**
 * One starter as published to the leaderboard — enough to redraw the card
 * (`DisplayCard`) and to know which pitch slot it stood in.
 *
 * `position` is the card's own position, not the slot's: that mismatch is exactly
 * what drives the penalty badge when someone is fielded out of position, the same
 * way it does on the owner's own club screen.
 */
export interface LeaderboardCard {
  slotId: string;
  position: string;
  name: string;
  rating: number;
  plus: number;
  portrait: string;
  /** 1 OF 1 levels, when the card holds any — so other players see the plate too. */
  oneOfOne?: number[];
}

/**
 * One account's standing on the OVR leaderboard.
 *
 * Published by the owner whenever their starting eleven changes — see
 * `ClubScreen`'s publish effect — and read by everyone else. Independent of the
 * cup brackets: this one never resets and only ever reflects the strongest
 * eleven an account has fielded lately, not whether they entered a cup
 * today.
 */
export interface LeaderboardEntry {
  uid: string;
  username: string;
  avatarId: string;
  /** Squad OVR at publish time — see `squadRating`. */
  rating: number;
  formation: FormationId;
  /** The starters actually on the pitch. Empty slots are simply absent. */
  cards: LeaderboardCard[];
  updatedAt: string;
}
