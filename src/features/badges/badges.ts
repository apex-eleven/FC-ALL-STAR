import { BADGE_SLOTS } from '@/features/squad/constants';
import { formationOf, squadRating } from '@/features/squad/squad';
import type { OwnedIndex, Squad } from '@/features/squad/types';
import type { BadgeConfig, BadgeStatus, TeamBadge } from './types';

/**
 * Pure crest rules. Nothing here touches React or storage.
 */

/** What a crest needs to know about one catalogue card to recognise it on the pitch. */
export interface SetMember {
  /** Card number the admin assigned (`PlayerCard.code`), '' when none yet. */
  code: string;
  name: string;
  /** Art URL as `cardToPlayer` builds it. */
  portrait: string;
}

/**
 * Resolves a catalogue id to that card, or undefined when the card is no longer in
 * the catalogue.
 */
export type MemberLookup = (cardId: string) => SetMember | undefined;

const noLookup: MemberLookup = () => undefined;

/** Same identity rule the squad uses to refuse two cards of one player on the pitch. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The art file a card is drawn with, reduced to its file name so a thumb path, an
 * encoded path and a plain one compare equal. Returns '' for fallback art, which many
 * cards share and so identifies nobody.
 */
function artKey(portrait: string): string {
  if (!portrait) return '';
  if (portrait.startsWith('data:')) return portrait.startsWith('data:image/') ? portrait : '';
  const path = portrait.split(/[?#]/)[0];
  const file = path.slice(path.lastIndexOf('/') + 1);
  let decoded = file;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    // Malformed escape: compare the raw name.
  }
  // Fallback portraits come from the bundle and carry no player identity.
  if (!path.includes('/players/')) return '';
  return decoded.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

/** One card of the starting eleven, reduced to what identifies it. */
interface FieldedCard {
  playerId: string;
  code: string;
  name: string;
  art: string;
}

/** The eleven on the pitch. Bench does not count. */
export type Fielded = FieldedCard[];

export function fielded(squad: Squad, owned: OwnedIndex): Fielded {
  const cards: FieldedCard[] = [];
  for (const slot of formationOf(squad).slots) {
    const cardId = squad.starters[slot.id];
    const card = cardId ? owned.get(cardId) : undefined;
    if (!card) continue;
    cards.push({
      playerId: card.playerId,
      code: card.code ?? '',
      name: card.name ? nameKey(card.name) : '',
      art: artKey(card.portrait ?? ''),
    });
  }
  return cards;
}

/**
 * Whether one card on the pitch is this member of the set.
 *
 * 1. Same catalogue id — always the right card.
 * 2. Both carry a card number — the number decides, and nothing else. This is what
 *    tells two cards of one player apart (a 90 and a 122 MBAPPE are different cards).
 * 3. Either side has no number yet (cards made or pulled before numbers existed) —
 *    fall back to the same player name or the same art file, so those clubs keep
 *    working until the admin has numbered the catalogue.
 */
function matches(cardId: string, member: SetMember | undefined, card: FieldedCard): boolean {
  if (card.playerId === cardId) return true;
  if (!member) return false;
  if (member.code && card.code) return member.code === card.code;
  if (member.name && card.name === nameKey(member.name)) return true;
  const art = artKey(member.portrait);
  return art !== '' && card.art === art;
}

/** Whether one member of a set is on the pitch. */
export function isFielded(cardId: string, onPitch: Fielded, lookup: MemberLookup = noLookup): boolean {
  const member = lookup(cardId);
  return onPitch.some((card) => matches(cardId, member, card));
}

/**
 * The set as distinct cards. Two catalogue entries sharing a number — or, without
 * numbers, sharing a name — are one member, otherwise a single card on the pitch
 * would tick two boxes.
 */
function members(badge: TeamBadge, lookup: MemberLookup): string[][] {
  const groups = new Map<string, string[]>();
  for (const id of badge.cardIds) {
    const member = lookup(id);
    const key = member?.code
      ? `c:${member.code}`
      : member?.name
        ? `n:${nameKey(member.name)}`
        : `i:${id}`;
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
