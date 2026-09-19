import { BADGE_SLOTS } from '@/features/squad/constants';
import { formationOf, squadRating } from '@/features/squad/squad';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import type { BadgeConfig, BadgeStatus, TeamBadge } from './types';

/**
 * Pure crest rules. Nothing here touches React or storage.
 */

/** How many of the set's players the crest asks for. */
export function requiredCount(badge: TeamBadge): number {
  const size = badge.cardIds.length;
  return badge.need <= 0 ? size : Math.min(badge.need, size);
}

/** Catalogue ids of the eleven on the pitch. Bench does not count. */
function fielded(squad: Squad, owned: OwnedIndex): Set<string> {
  const ids = new Set<string>();
  for (const slot of formationOf(squad).slots) {
    const cardId = squad.starters[slot.id];
    const card = cardId ? owned.get(cardId) : undefined;
    if (card) ids.add(card.playerId);
  }
  return ids;
}

export function statusOf(badge: TeamBadge, squad: Squad, owned: OwnedIndex): BadgeStatus {
  const onPitch = fielded(squad, owned);
  const have = badge.cardIds.filter((id) => onPitch.has(id)).length;
  const need = requiredCount(badge);
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
export function slotStatuses(squad: Squad, owned: OwnedIndex, config: BadgeConfig): (BadgeStatus | null)[] {
  return equipped(squad, config).map((badge) => (badge ? statusOf(badge, squad, owned) : null));
}

/** OVR added by the pinned crests that are active. */
export function bonusOf(squad: Squad, owned: OwnedIndex, config: BadgeConfig): number {
  return slotStatuses(squad, owned, config).reduce(
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
export function teamRating(squad: Squad, owned: OwnedIndex, config: BadgeConfig): number {
  const base = squadRating(squad, owned);
  return base > 0 ? base + bonusOf(squad, owned, config) : 0;
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
