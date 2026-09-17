import type { Account } from '@/features/auth/types';
import type { OwnedIndex } from '@/features/squad/types';
import { cardToPlayer } from '@/features/draft/pool';
import { seeded } from '@/features/league/season';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import type { PlayerCard } from '@/features/players/types';
import { ratingWithPlus } from '@/features/rankup/plus';
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
 * Formation spots in the side's own attacking frame: x metres from their own goal,
 * y metres from the left touchline as they face the opponent's goal. Keyed by the
 * squad's slot ids, so a published leaderboard eleven lands the same way.
 */
const SPOTS: Record<string, [number, number]> = {
  gk: [5, 34],
  lb: [22, 8],
  'cb-l': [20, 25],
  'cb-r': [20, 43],
  rb: [22, 60],
  'cm-l': [42, 18],
  cam: [50, 34],
  'cm-r': [42, 50],
  lw: [72, 10],
  st: [76, 34],
  rw: [72, 58],
};

const SLOT_ORDER = ['gk', 'lb', 'cb-l', 'cb-r', 'rb', 'cm-l', 'cam', 'cm-r', 'lw', 'st', 'rw'];

/** A slot's position, for bots and fillers. */
const SLOT_POSITION: Record<string, string> = {
  gk: 'GK',
  lb: 'LB',
  'cb-l': 'CB',
  'cb-r': 'CB',
  rb: 'RB',
  'cm-l': 'CM',
  cam: 'CAM',
  'cm-r': 'CM',
  lw: 'LW',
  st: 'ST',
  rw: 'RW',
};

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

function spot(slotId: string, player: MatchPlayer): LineupSpot {
  const [anchorX, anchorY] = SPOTS[slotId] ?? [45, 34];
  return { player, anchorX, anchorY, keeper: slotId === 'gk' };
}

/** A stand-in for a slot nobody fills, so a side always fields eleven. */
function filler(slotId: string, rating: number, tag: string): MatchPlayer {
  return toMatchPlayer({
    id: `${tag}:fill:${slotId}`,
    seed: `${tag}:fill:${slotId}`,
    name: 'ตัวแทน',
    portrait: '',
    position: SLOT_POSITION[slotId] ?? 'CM',
    rating: Math.max(20, Math.round(rating * 0.6)),
  });
}

/** The account's own starting eleven and bench. */
export function homeLineup(account: Account, owned: OwnedIndex): { spots: LineupSpot[]; bench: MatchPlayer[] } {
  const formation = formationOf(account.squad);
  const spots = formation.slots.map((slot) => {
    const id = account.squad.starters[slot.id];
    const card = id ? owned.get(id) : undefined;
    if (!card) return spot(slot.id, filler(slot.id, 60, 'home'));
    return spot(
      slot.id,
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

/** Another player's published eleven. */
export function entryLineup(entry: LeaderboardEntry): LineupSpot[] {
  const bySlot = new Map(entry.cards.map((card) => [card.slotId, card]));
  return SLOT_ORDER.map((slotId) => {
    const card = bySlot.get(slotId);
    if (!card) return spot(slotId, filler(slotId, entry.rating, entry.uid));
    return spot(
      slotId,
      toMatchPlayer({
        id: `${entry.uid}:${slotId}`,
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
  return SLOT_ORDER.map((slotId, index) => {
    const position = SLOT_POSITION[slotId] ?? 'CM';
    const group = groupOf(position);
    const seed = `${opponent.id}:${slotId}`;
    const pool = catalogue.filter((card) => groupOf(card.position) === group && !used.has(card.name));
    const fallback = catalogue.filter((card) => !used.has(card.name) && groupOf(card.position) !== 'GK');
    const source = pool.length > 0 ? pool : group === 'GK' ? [] : fallback;
    const card = source.length > 0 ? source[Math.floor(seeded(`${seed}:card`) * source.length) % source.length] : undefined;
    if (card) used.add(card.name);

    const jitter = Math.round((seeded(`${seed}:ovr`) * 2 - 1) * 3);
    return spot(
      slotId,
      toMatchPlayer({
        id: `bot:${slotId}:${index}`,
        seed,
        name: card?.name ?? `ผู้เล่น ${index + 1}`,
        portrait: card ? cardToPlayer(card).portrait : '',
        position: card?.position ?? position,
        rating: Math.max(1, opponent.rating + jitter),
      }),
    );
  });
}
