import type { Account } from '@/features/auth/types';
import type { FormationSlot, OwnedIndex } from '@/features/squad/types';
import { cardToPlayer } from '@/features/draft/pool';
import { seeded } from '@/features/sim/seeded';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import type { PlayerCard } from '@/features/players/types';
import { ratingWithPlus } from '@/features/rankup/plus';
import { DEFAULT_FORMATION, FORMATIONS, isFormationId } from '@/features/squad/constants';
import { formationOf } from '@/features/squad/squad';
import { effectiveRating, groupOf } from '@/features/squad/rating';
import { cardStats } from '@/features/squad/stats';
import type { LineupSpot, MatchPlayer } from './matchEngine';
import type { ManagerOpponent } from './types';

/**
 * Turns squads into what the match engine plays with: eleven players, each on a
 * pitch spot, with skills from the same derived stats the swap screen shows.
 */

/**
 * Engine spots and positions come from the formation itself (`FormationSlot.pitch`),
 * so every formation on the club screen plays as it is drawn. Bots still line up in
 * the default formation.
 */
const LINE_ORDER = ['GK', 'DEF', 'MID', 'ATT'];

/**
 * Keeper first, then each line left to right — the order published elevens and bots
 * have always been built in (for 4-3-3 Attack it is exactly the old fixed list), so a
 * seeded bot side comes out the same as it did before formations existed.
 */
function engineOrder(slots: readonly FormationSlot[]): FormationSlot[] {
  return [...slots].sort(
    (a, b) =>
      LINE_ORDER.indexOf(groupOf(a.position)) - LINE_ORDER.indexOf(groupOf(b.position)) || a.x - b.x,
  );
}

const DEFAULT_SLOTS = engineOrder(FORMATIONS[DEFAULT_FORMATION].slots);

/** A slot's spot in the side's own attacking frame, metres. */
function spotOf(slot: FormationSlot | undefined): [number, number] {
  return slot ? slot.pitch : [45, 34];
}

/** Face stats land around 130..220 for real cards; this maps them onto 0..1. */
function skill(stat: number): number {
  return Math.max(0.05, Math.min(1, (stat - 40) / 200));
}

export function toMatchPlayer(input: {
  id: string;
  seed: string;
  name: string;
  portrait: string;
  position: string;
  rating: number;
}): MatchPlayer {
  const stats = cardStats({
    playerId: input.seed,
    name: input.name,
    rating: input.rating,
    position: input.position,
  });
  return {
    id: input.id,
    name: input.name,
    portrait: input.portrait,
    position: input.position,
    rating: input.rating,
    pace: skill((stats.acceleration + stats.sprintSpeed) / 2),
    shooting: skill(stats.face.shooting),
    passing: skill(stats.face.passing),
    dribbling: skill(stats.face.dribbling),
    defending: skill(stats.face.defending),
    physical: skill(stats.face.physical),
  };
}

function spot(slot: FormationSlot, player: MatchPlayer): LineupSpot {
  const [anchorX, anchorY] = spotOf(slot);
  return { player, anchorX, anchorY, keeper: slot.position === 'GK' };
}

/** A stand-in for a slot nobody fills, so a side always fields eleven. */
function filler(slot: FormationSlot, rating: number, tag: string): MatchPlayer {
  return toMatchPlayer({
    id: `${tag}:fill:${slot.id}`,
    seed: `${tag}:fill:${slot.id}`,
    name: 'ตัวแทน',
    portrait: '',
    position: slot.position,
    rating: Math.max(20, Math.round(rating * 0.6)),
  });
}

/** The account's own starting eleven and bench. */
export function homeLineup(account: Account, owned: OwnedIndex): { spots: LineupSpot[]; bench: MatchPlayer[] } {
  const formation = formationOf(account.squad);
  const spots = formation.slots.map((slot) => {
    const id = account.squad.starters[slot.id];
    const card = id ? owned.get(id) : undefined;
    if (!card) return spot(slot, filler(slot, 60, 'home'));
    return spot(
      slot,
      toMatchPlayer({
        id: card.id,
        seed: card.playerId,
        name: card.name,
        portrait: card.portrait,
        position: card.position,
        // The out-of-position penalty and the rank-up bonus both apply, as on the
        // club screen.
        rating: effectiveRating(card, slot.position),
      }),
    );
  });

  const bench = account.squad.bench
    .map((id) => (id ? owned.get(id) : undefined))
    .filter((card): card is NonNullable<typeof card> => card !== undefined)
    .map((card) =>
      toMatchPlayer({
        id: card.id,
        seed: card.playerId,
        name: card.name,
        portrait: card.portrait,
        position: card.position,
        rating: ratingWithPlus(card),
      }),
    );

  return { spots, bench };
}

/**
 * Another player's published eleven, in the formation they published it in. An
 * entry written by an older build, or naming a formation this one does not know,
 * plays in the default one.
 */
export function entryLineup(entry: LeaderboardEntry): LineupSpot[] {
  const bySlot = new Map(entry.cards.map((card) => [card.slotId, card]));
  const slots = isFormationId(entry.formation) ? engineOrder(FORMATIONS[entry.formation].slots) : DEFAULT_SLOTS;
  return slots.map((slot) => {
    const card = bySlot.get(slot.id);
    if (!card) return spot(slot, filler(slot, entry.rating, entry.uid));
    return spot(
      slot,
      toMatchPlayer({
        id: `${entry.uid}:${slot.id}`,
        seed: `${card.name}:${card.position}`,
        name: card.name,
        portrait: card.portrait,
        position: card.position,
        rating: ratingWithPlus({ rating: card.rating, plus: card.plus }),
      }),
    );
  });
}

/**
 * A generated side around `rating`: catalogue cards for faces and names where the
 * catalogue has them, each rated near the opponent's OVR rather than at the card's
 * own number, so the side plays at the strength matchmaking promised.
 *
 * Never borrows a name already playing for the home side — the same legend on both
 * teams reads as a bug. With the catalogue used up, the bot fields unnamed players.
 */
export function botLineup(
  opponent: ManagerOpponent,
  catalogue: readonly PlayerCard[],
  homeNames: readonly string[],
): LineupSpot[] {
  const used = new Set<string>(homeNames);
  return DEFAULT_SLOTS.map((slot, index) => {
    const position = slot.position;
    const group = groupOf(position);
    const seed = `${opponent.id}:${slot.id}`;
    const pool = catalogue.filter((card) => groupOf(card.position) === group && !used.has(card.name));
    const fallback = catalogue.filter((card) => !used.has(card.name) && groupOf(card.position) !== 'GK');
    const source = pool.length > 0 ? pool : group === 'GK' ? [] : fallback;
    const card = source.length > 0 ? source[Math.floor(seeded(`${seed}:card`) * source.length) % source.length] : undefined;
    if (card) used.add(card.name);

    const jitter = Math.round((seeded(`${seed}:ovr`) * 2 - 1) * 3);
    return spot(
      slot,
      toMatchPlayer({
        id: `bot:${slot.id}:${index}`,
        seed,
        name: card?.name ?? `ผู้เล่น ${index + 1}`,
        portrait: card ? cardToPlayer(card).portrait : '',
        position: card?.position ?? position,
        rating: Math.max(1, opponent.rating + jitter),
      }),
    );
  });
}
