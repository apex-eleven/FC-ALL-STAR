import { BADGE_SLOTS } from '@/features/squad/constants';
import { formationOf, squadRating } from '@/features/squad/squad';
import { groupKey, isSameCard, keyOf, type CardRef, type OwnedKey } from '@/features/club/identity';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import type { BadgeConfig, BadgeStatus, TeamBadge } from './types';

/**
 * Pure crest rules. Nothing here touches React or storage.
 */

/** What a crest needs to know about one catalogue card. See features/club/identity. */
export type SetMember = CardRef;

/**
 * Resolves a catalogue id to that card, or undefined when the card is no longer in
 * the catalogue.
 */
export type MemberLookup = (cardId: string) => SetMember | undefined;

const noLookup: MemberLookup = () => undefined;

/** The eleven on the pitch. Bench does not count. */
export type Fielded = OwnedKey[];

export function fielded(squad: Squad, owned: OwnedIndex): Fielded {
  const cards: OwnedKey[] = [];
  for (const slot of formationOf(squad).slots) {
    const cardId = squad.starters[slot.id];
    const card = cardId ? owned.get(cardId) : undefined;
    if (card) cards.push(keyOf(card));
  }
  return cards;
}

/** Whether one member of a set is on the pitch — same rule as `isSameCard`. */
export function isFielded(cardId: string, onPitch: Fielded, lookup: MemberLookup = noLookup): boolean {
  const member = lookup(cardId);
  return onPitch.some((card) => isSameCard(cardId, member, card));
}

/**
 * The set as distinct cards. Two catalogue entries sharing a number — or, without
 * numbers, sharing a name — are one member, otherwise a single card on the pitch
 * would tick two boxes.
 */
function members(badge: TeamBadge, lookup: MemberLookup): string[][] {
  const groups = new Map<string, string[]>();
  for (const id of badge.cardIds) {
    const key = groupKey(id, lookup(id));
    const group = groups.get(key);
    if (group) group.push(id);
    else groups.set(key, [id]);
  }
  return [...groups.values()];
}

/** How many of the set's players the crest asks for. */
export function requiredCount(badge: TeamBadge, lookup: MemberLookup = noLookup): number {
  const size = members(badge, lookup).length;
  return badge.need <= 0 ? size : Math.min(badge.need, size);
}

export function statusOf(
  badge: TeamBadge,
  squad: Squad,
  owned: OwnedIndex,
  lookup: MemberLookup = noLookup,
): BadgeStatus {
  const onPitch = fielded(squad, owned);
  const have = members(badge, lookup).filter((group) =>
    group.some((id) => isFielded(id, onPitch, lookup)),
  ).length;
  const need = requiredCount(badge, lookup);
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
  lookup: MemberLookup = noLookup,
): (BadgeStatus | null)[] {
  return equipped(squad, config).map((badge) => (badge ? statusOf(badge, squad, owned, lookup) : null));
}

/** OVR added by the pinned crests that are active. */
export function bonusOf(
  squad: Squad,
  owned: OwnedIndex,
  config: BadgeConfig,
  lookup: MemberLookup = noLookup,
): number {
  return slotStatuses(squad, owned, config, lookup).reduce(
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
  lookup: MemberLookup = noLookup,
): number {
  const base = squadRating(squad, owned);
  return base > 0 ? base + bonusOf(squad, owned, config, lookup) : 0;
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
