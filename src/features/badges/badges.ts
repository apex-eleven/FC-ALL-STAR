import { BADGE_SLOTS } from '@/features/squad/constants';
import { formationOf, squadRating } from '@/features/squad/squad';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import type { BadgeConfig, BadgeStatus, TeamBadge } from './types';

/**
 * Pure crest rules. Nothing here touches React or storage.
 */

/**
 * Resolves a catalogue id to that card's player name, or undefined when the card is
 * no longer in the catalogue. Lets a crest recognise the *player*, not one catalogue
 * entry: a card pulled before the admin re-imported or duplicated a player keeps its
 * old catalogue id, and must still count for a set built from the new entry.
 */
export type NameLookup = (cardId: string) => string | undefined;

const noNames: NameLookup = () => undefined;

/** Same identity rule the squad uses to refuse two cards of one player on the pitch. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** The eleven on the pitch, by catalogue id and by player name. Bench does not count. */
export interface Fielded {
  ids: Set<string>;
  names: Set<string>;
}

export function fielded(squad: Squad, owned: OwnedIndex): Fielded {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const slot of formationOf(squad).slots) {
    const cardId = squad.starters[slot.id];
    const card = cardId ? owned.get(cardId) : undefined;
    if (!card) continue;
    ids.add(card.playerId);
    if (card.name) names.add(nameKey(card.name));
  }
  return { ids, names };
}

/** Whether one member of a set is on the pitch — the exact card, or the same player. */
export function isFielded(cardId: string, onPitch: Fielded, nameOf: NameLookup = noNames): boolean {
  if (onPitch.ids.has(cardId)) return true;
  const name = nameOf(cardId);
  return name !== undefined && name !== '' && onPitch.names.has(nameKey(name));
}

/**
 * The set as distinct players. Two catalogue versions of one player in a set are one
 * member — otherwise a single card on the pitch would tick two boxes.
 */
function members(badge: TeamBadge, nameOf: NameLookup): string[][] {
  const groups = new Map<string, string[]>();
  for (const id of badge.cardIds) {
    const name = nameOf(id);
    const key = name ? `n:${nameKey(name)}` : `i:${id}`;
    const group = groups.get(key);
    if (group) group.push(id);
    else groups.set(key, [id]);
  }
  return [...groups.values()];
}

/** How many of the set's players the crest asks for. */
export function requiredCount(badge: TeamBadge, nameOf: NameLookup = noNames): number {
  const size = members(badge, nameOf).length;
  return badge.need <= 0 ? size : Math.min(badge.need, size);
}

export function statusOf(
  badge: TeamBadge,
  squad: Squad,
  owned: OwnedIndex,
  nameOf: NameLookup = noNames,
): BadgeStatus {
  const onPitch = fielded(squad, owned);
  const have = members(badge, nameOf).filter((group) =>
    group.some((id) => isFielded(id, onPitch, nameOf)),
  ).length;
  const need = requiredCount(badge, nameOf);
  // A crest with no players in it can never be active — otherwise a half-made
  // crest would hand out its bonus for free.
  return { badge, have, need, active: need > 0 && have >= need };
}

/** Crests a player may pin: enabled, and the system is on. */
export function availableBadges(config: BadgeConfig): TeamBadge[] {
  return config.enabled ? config.badges.filter((badge) => badge.enabled) : [];
}

/** The crest in each slot, resolved against config. Unknown or disabled = empty. */
export function equipped(squad: Squad, config: BadgeConfig): (TeamBadge | null)[] {
  const available = availableBadges(config);
  return Array.from({ length: BADGE_SLOTS }, (_, index) => {
    const id = squad.badges[index];
    return id ? (available.find((badge) => badge.id === id) ?? null) : null;
  });
}

/** Status of each slot's crest against the current eleven. */
export function slotStatuses(
  squad: Squad,
  owned: OwnedIndex,
  config: BadgeConfig,
  nameOf: NameLookup = noNames,
): (BadgeStatus | null)[] {
  return equipped(squad, config).map((badge) => (badge ? statusOf(badge, squad, owned, nameOf) : null));
}

/** OVR added by the pinned crests that are active. */
export function bonusOf(
  squad: Squad,
  owned: OwnedIndex,
  config: BadgeConfig,
  nameOf: NameLookup = noNames,
): number {
  return slotStatuses(squad, owned, config, nameOf).reduce(
    (sum, status) => sum + (status?.active ? status.badge.bonus : 0),
    0,
  );
}

/**
 * The team rating everyone shows: the eleven's own number plus crest bonuses.
 *
 * An empty squad stays at 0 — a bonus with nobody on the pitch would put a number
 * on the home tile for a club that has not fielded anyone.
 */
export function teamRating(
  squad: Squad,
  owned: OwnedIndex,
  config: BadgeConfig,
  nameOf: NameLookup = noNames,
): number {
  const base = squadRating(squad, owned);
  return base > 0 ? base + bonusOf(squad, owned, config, nameOf) : 0;
}

/** Which slot a crest is pinned in, or -1. */
export function slotOf(squad: Squad, badgeId: string): number {
  return squad.badges.indexOf(badgeId);
}

/**
 * Pins a crest in a slot, or clears it with null. A crest already pinned elsewhere
 * moves rather than doubling up — the same crest twice would count its bonus twice.
 */
export function equip(squad: Squad, slot: number, badgeId: string | null): Squad {
  if (slot < 0 || slot >= BADGE_SLOTS) return squad;
  const badges = squad.badges.map((id) => (badgeId !== null && id === badgeId ? null : id));
  badges[slot] = badgeId;
  return { ...squad, badges };
}
