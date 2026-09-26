import type { OwnedPlayer } from '@/features/club/types';
import { ratingWithPlus } from '@/features/rankup/plus';
import {
  BADGE_SLOTS,
  BENCH_SIZE,
  DEFAULT_FORMATION,
  FORMATIONS,
  STARTER_COUNT,
  isFormationId,
} from './constants';
import { effectiveRating } from './rating';
import type {
  Formation,
  FormationId,
  OwnedIndex,
  PlacementCheck,
  Squad,
  SquadLocation,
} from './types';

const OK: PlacementCheck = { ok: true, reason: null };

export function formationOf(squad: Squad): Formation {
  return FORMATIONS[squad.formation] ?? FORMATIONS[DEFAULT_FORMATION];
}

export function emptySquad(): Squad {
  const formation = FORMATIONS[DEFAULT_FORMATION];
  return {
    formation: DEFAULT_FORMATION,
    starters: Object.fromEntries(formation.slots.map((slot) => [slot.id, null])),
    bench: Array.from({ length: BENCH_SIZE }, () => null),
    badges: Array.from({ length: BADGE_SLOTS }, () => null),
  };
}

export function indexOwned(players: readonly OwnedPlayer[]): OwnedIndex {
  return new Map(players.map((player) => [player.id, player]));
}

/**
 * Repairs a squad read from storage.
 *
 * Cards can leave the club — the collection is capped and drops the oldest — so any
 * reference to a card that is no longer owned becomes an empty slot rather than a
 * dangling id. A card appearing twice keeps its first placement; without this a
 * hand-edited record could field the same player eleven times.
 */
export function normalizeSquad(value: unknown, owned: OwnedIndex): Squad {
  const base = emptySquad();
  if (typeof value !== 'object' || value === null) return base;

  const source = value as Partial<Squad>;
  const formation = isFormationId(source.formation) ? source.formation : DEFAULT_FORMATION;

  const seen = new Set<string>();
  const take = (id: unknown): string | null => {
    if (typeof id !== 'string' || !owned.has(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  };

  const starters: Record<string, string | null> = {};
  for (const slot of FORMATIONS[formation].slots) {
    starters[slot.id] = take((source.starters as Record<string, unknown>)?.[slot.id]);
  }

  const benchSource = Array.isArray(source.bench) ? source.bench : [];
  const bench = Array.from({ length: BENCH_SIZE }, (_, index) => take(benchSource[index]));

  // Crest ids are checked against the crest config where they are read, not here —
  // this repair only knows about cards. A crest in two slots keeps the first.
  const badgeSource = Array.isArray(source.badges) ? source.badges : [];
  const seenBadges = new Set<string>();
  const badges = Array.from({ length: BADGE_SLOTS }, (_, index) => {
    const id = badgeSource[index];
    if (typeof id !== 'string' || id === '' || seenBadges.has(id)) return null;
    seenBadges.add(id);
    return id.slice(0, 40);
  });

  return { formation, starters, bench, badges };
}

/**
 * Keepers and outfield slots do not mix, in either direction.
 *
 * The brief only asked that nothing but a GK can fill the GK slot. The reverse is
 * enforced too: a keeper standing at striker is the same category of mistake, and
 * allowing it would let auto-build waste the only GK the account owns.
 */
export function canPlace(slotPosition: string, player: OwnedPlayer): PlacementCheck {
  const slotIsGk = slotPosition === 'GK';
  const playerIsGk = player.position === 'GK';

  if (slotIsGk && !playerIsGk) return { ok: false, reason: 'gk-slot-needs-gk' };
  if (!slotIsGk && playerIsGk) return { ok: false, reason: 'gk-cannot-play-outfield' };
  return OK;
}

/** Names are compared case- and space-insensitively; "KUYT " and "Kuyt" are one man. */
function nameKey(player: OwnedPlayer): string {
  return player.name.trim().toLowerCase();
}

/**
 * The same footballer cannot be in the squad twice.
 *
 * Duplicate *cards* are ordinary — pull the same pack ten times and ten copies of one
 * player land in the club, each with its own id. Fielding all of them was legal,
 * because the rules only ever compared ids, and a lineup of eleven identical strikers
 * is not a team.
 *
 * Checked against starters and bench together: a duplicate on the bench is the same
 * player waiting to come on for himself.
 */
export function duplicateOf(
  squad: Squad,
  owned: OwnedIndex,
  cardId: string,
): OwnedPlayer | null {
  const player = owned.get(cardId);
  if (!player) return null;

  const key = nameKey(player);
  const seated = [...Object.values(squad.starters), ...squad.bench];

  for (const id of seated) {
    if (!id || id === cardId) continue;
    const other = owned.get(id);
    if (other && nameKey(other) === key) return other;
  }

  return null;
}

function locationOf(squad: Squad, cardId: string): SquadLocation {
  for (const [slotId, id] of Object.entries(squad.starters)) {
    if (id === cardId) return { kind: 'starter', slotId };
  }
  const index = squad.bench.indexOf(cardId);
  if (index >= 0) return { kind: 'bench', index };
  return { kind: 'collection' };
}

function clear(squad: Squad, cardId: string): Squad {
  const starters = { ...squad.starters };
  for (const [slotId, id] of Object.entries(starters)) {
    if (id === cardId) starters[slotId] = null;
  }
  return { ...squad, starters, bench: squad.bench.map((id) => (id === cardId ? null : id)) };
}

export interface MoveResult {
  squad: Squad;
  check: PlacementCheck;
}

/**
 * Puts a card in a starting slot.
 *
 * If the slot is taken, the two cards swap when the occupant is legal where the
 * dragged card came from, and the occupant is benched otherwise. Dropping a keeper
 * onto an outfield slot is refused outright rather than half-applied.
 */
export function placeInSlot(
  squad: Squad,
  owned: OwnedIndex,
  slotId: string,
  cardId: string,
): MoveResult {
  const formation = formationOf(squad);
  const slot = formation.slots.find((candidate) => candidate.id === slotId);
  const player = owned.get(cardId);
  if (!slot || !player) return { squad, check: OK };

  const check = canPlace(slot.position, player);
  if (!check.ok) return { squad, check };

  // Refused before anything moves, so a rejected placement leaves the squad exactly
  // as it was rather than half-applied.
  if (duplicateOf(squad, owned, cardId)) {
    return { squad, check: { ok: false, reason: 'duplicate-name' } };
  }

  const from = locationOf(squad, cardId);
  const occupant = squad.starters[slotId] ?? null;

  let next = clear(squad, cardId);
  next = { ...next, starters: { ...next.starters, [slotId]: cardId } };

  if (occupant && occupant !== cardId) {
    const displaced = owned.get(occupant);
    const canSwapBack =
      from.kind === 'starter' &&
      displaced !== undefined &&
      canPlace(
        formation.slots.find((candidate) => candidate.id === from.slotId)?.position ?? '',
        displaced,
      ).ok;

    if (canSwapBack && from.kind === 'starter') {
      next = { ...next, starters: { ...next.starters, [from.slotId]: occupant } };
    } else if (from.kind === 'bench') {
      const bench = [...next.bench];
      bench[from.index] = occupant;
      next = { ...next, bench };
    } else {
      next = benchOrDrop(next, occupant);
    }
  }

  return { squad: next, check: OK };
}

/** Puts a card on the bench, swapping with whoever was in that seat. */
export function placeOnBench(
  squad: Squad,
  owned: OwnedIndex,
  cardId: string,
  index: number,
): MoveResult {
  if (index < 0 || index >= BENCH_SIZE) return { squad, check: OK };

  if (duplicateOf(squad, owned, cardId)) {
    return { squad, check: { ok: false, reason: 'duplicate-name' } };
  }

  const from = locationOf(squad, cardId);
  const occupant = squad.bench[index] ?? null;

  let next = clear(squad, cardId);
  const bench = [...next.bench];
  bench[index] = cardId;
  next = { ...next, bench };

  if (occupant && occupant !== cardId) {
    if (from.kind === 'bench') {
      const swapped = [...next.bench];
      swapped[from.index] = occupant;
      next = { ...next, bench: swapped };
    } else if (from.kind === 'starter') {
      next = { ...next, starters: { ...next.starters, [from.slotId]: occupant } };
    }
    // From the collection there is nowhere to put the displaced card, so it simply
    // leaves the squad and stays in the club.
  }

  return { squad: next, check: OK };
}

/** Takes a card out of the squad entirely. */
export function removeFromSquad(squad: Squad, cardId: string): Squad {
  return clear(squad, cardId);
}

function benchOrDrop(squad: Squad, cardId: string): Squad {
  const free = squad.bench.indexOf(null);
  if (free < 0) return squad;
  const bench = [...squad.bench];
  bench[free] = cardId;
  return { ...squad, bench };
}

/**
 * Fills every slot with the best available card.
 *
 * Two passes: first the highest rated player who actually plays that position, then
 * the highest rated player left over for whatever is still empty. The GK slot only
 * ever takes a keeper, so an account with no keeper is left with an empty net rather
 * than a striker in gloves.
 */
export function autoBuild(squad: Squad, players: readonly OwnedPlayer[]): Squad {
  const formation = formationOf(squad);
  const byRating = [...players].sort((a, b) => ratingWithPlus(b) - ratingWithPlus(a));
  const used = new Set<string>();
  // Names, not ids: ten copies of the same card are ten ids and one footballer.
  const names = new Set<string>();

  const starters: Record<string, string | null> = Object.fromEntries(
    formation.slots.map((slot) => [slot.id, null]),
  );

  const claim = (slotPosition: string, exactOnly: boolean): string | null => {
    // Second pass ranks by what each player is actually worth in that slot, so a
    // 110 midfielder beats a 112 striker when filling a centre back.
    const ranked = exactOnly
      ? byRating
      : [...byRating].sort(
          (a, b) => effectiveRating(b, slotPosition) - effectiveRating(a, slotPosition),
        );

    for (const player of ranked) {
      if (used.has(player.id) || names.has(nameKey(player))) continue;
      if (!canPlace(slotPosition, player).ok) continue;
      if (exactOnly && player.position !== slotPosition) continue;
      used.add(player.id);
      names.add(nameKey(player));
      return player.id;
    }
    return null;
  };

  for (const slot of formation.slots) starters[slot.id] = claim(slot.position, true);
  for (const slot of formation.slots) {
    if (!starters[slot.id]) starters[slot.id] = claim(slot.position, false);
  }

  const bench: (string | null)[] = Array.from({ length: BENCH_SIZE }, () => null);
  let seat = 0;
  for (const player of byRating) {
    if (seat >= BENCH_SIZE) break;
    if (used.has(player.id) || names.has(nameKey(player))) continue;
    used.add(player.id);
    names.add(nameKey(player));
    bench[seat] = player.id;
    seat += 1;
  }

  return { ...squad, starters, bench };
}

/**
 * Squad rating: add up the eleven starters and divide, rounding up.
 *
 * The ratings added are the **effective** ones, so a striker filling in at centre
 * back drags the team number down by exactly the penalty shown on his card. Rounding
 * is up, not to nearest: 108.1 is a team that has an eleventh player, and showing 108
 * for it made an improvement look like nothing happened.
 *
 * Empty slots are skipped rather than counted as zero. A part-built squad showing a
 * rating far below its own players would read as a bug, not as a warning — swap
 * `ratings.length` for STARTER_COUNT below if empty slots should cost.
 */
export function squadRating(squad: Squad, owned: OwnedIndex): number {
  const formation = formationOf(squad);

  const ratings = formation.slots
    .map((slot) => {
      const id = squad.starters[slot.id];
      const player = id ? owned.get(id) : undefined;
      return player ? effectiveRating(player, slot.position) : undefined;
    })
    .filter((rating): rating is number => typeof rating === 'number');

  if (ratings.length === 0) return 0;
  return Math.ceil(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
}

/** Kept exported so the panel can say "8 / 11" without recounting slots itself. */
export const FULL_SQUAD = STARTER_COUNT;

/** Rough market value, shown under the formation name. */
export function squadValue(squad: Squad, owned: OwnedIndex): number {
  const ids = [...Object.values(squad.starters), ...squad.bench].filter(
    (id): id is string => typeof id === 'string',
  );

  return ids.reduce((total, id) => {
    const card = owned.get(id);
    const rating = card ? ratingWithPlus(card) : 0;
    // Steeply superlinear, so one great card is worth more than several ordinary
    // ones — which is what makes the number interesting to look at.
    return total + Math.round(rating ** 4 / 10);
  }, 0);
}

export function isInSquad(squad: Squad, cardId: string): boolean {
  return (
    Object.values(squad.starters).includes(cardId) || squad.bench.includes(cardId)
  );
}

/**
 * Maximum-weight assignment of rows to columns (Hungarian algorithm, O(n³)).
 *
 * `score` is square. Returns, for each row, the column it gets. Eleven slots is far
 * too many to try every arrangement (10! for the outfield alone), and a greedy pass
 * drifts: once it parks a midfielder at right back it keeps him there on every later
 * switch. This finds the arrangement the whole eleven is best in, every time.
 */
function bestAssignment(score: number[][]): number[] {
  const n = score.length;
  const max = Math.max(0, ...score.flat());
  // Minimise cost = max - score; potentials u/v, 1-indexed as in the textbook form.
  const cost = (i: number, j: number) => max - score[i - 1]![j - 1]!;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const match = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    match[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = match[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const current = cost(i0, j) - u[i0]! - v[j]!;
        if (current < minv[j]!) {
          minv[j] = current;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[match[j]!] = u[match[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (match[j0] !== 0);
    do {
      const j1 = way[j0]!;
      match[j0] = match[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j += 1) {
    if (match[j]! > 0) result[match[j]! - 1] = j - 1;
  }
  return result;
}

/** Score for a placement the rules refuse (a keeper outfield, anyone else in goal). */
const REFUSED = -1_000_000;

/**
 * Switches formation and keeps the eleven.
 *
 * Nobody is dropped: every formation has one keeper and ten outfield slots, so the
 * same eleven always fits. They are arranged so the team is as strong as it can be
 * in the new shape — the arrangement with the highest total effective rating, which
 * puts every player in a slot of his own position wherever the formation has one.
 * Between arrangements that are equally strong, a player who can keep the same slot
 * id (left back to left back, left CM to left CM) does, so switching away and back
 * returns the squad as it was.
 *
 * Pure and deterministic, so the preview and the saved squad agree. The bench and
 * the crests are untouched.
 */
export function changeFormation(squad: Squad, next: FormationId, owned: OwnedIndex): Squad {
  if (!isFormationId(next) || next === squad.formation) return squad;
  const target = FORMATIONS[next];

  const eleven = formationOf(squad)
    .slots.map((slot) => ({ from: slot.id, x: slot.x, id: squad.starters[slot.id] ?? null }))
    .filter((entry): entry is { from: string; x: number; id: string } => entry.id !== null && owned.has(entry.id));

  // Rows: the players, padded with empty rows up to the slot count. Ratings are
  // scaled by 1000 so the tie-break below can never outweigh a single point of OVR:
  // the same slot id first, then the slot nearest across the pitch to where he stood,
  // which keeps a left-sided player on the left through formations that rename slots.
  const score = target.slots.map((_, row) =>
    target.slots.map((slot) => {
      const entry = eleven[row];
      if (!entry) return 0;
      const player = owned.get(entry.id)!;
      if (!canPlace(slot.position, player).ok) return REFUSED;
      const sameSlot = entry.from === slot.id ? 600 : 0;
      const nearby = 300 - Math.min(300, Math.round(Math.abs(entry.x - slot.x) / 4));
      return effectiveRating(player, slot.position) * 1000 + sameSlot + nearby;
    }),
  );
  const assigned = bestAssignment(score);

  const starters: Record<string, string | null> = Object.fromEntries(
    target.slots.map((slot) => [slot.id, null]),
  );
  const bench = [...squad.bench];
  eleven.forEach((entry, row) => {
    const column = assigned[row] ?? -1;
    if (column >= 0 && score[row]![column]! > REFUSED) {
      starters[target.slots[column]!.id] = entry.id;
      return;
    }
    // Only a squad that broke the keeper rule before it was saved gets here: the
    // player goes to a free bench seat rather than vanish.
    const seat = bench.indexOf(null);
    if (seat >= 0) bench[seat] = entry.id;
  });

  return { ...squad, formation: next, starters, bench };
}
