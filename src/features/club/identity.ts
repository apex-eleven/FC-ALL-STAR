import { cardToPlayer } from '@/features/draft/pool';
import type { PlayerCard } from '@/features/players/types';
import type { OwnedPlayer } from './types';

/**
 * "Is this owned card that catalogue card?" — one answer for every feature that asks
 * a player to hold particular cards (team crests, special-card offers, …).
 *
 * Comparing `OwnedPlayer.playerId` with a catalogue id is not enough on its own. An
 * owned card is a snapshot: when the admin deletes a card and adds it again, the new
 * entry gets a new id while every copy already pulled keeps the old one — and looks
 * exactly the same on screen. A rule that only compared ids would lock those players
 * out with a full club.
 */

/** What identifies one catalogue card. */
export interface CardRef {
  /** Card number the admin assigned (`PlayerCard.code`), '' when none yet. */
  code: string;
  name: string;
  /** Printed OVR, without rank-up. */
  rating: number;
  /** Art URL as `cardToPlayer` builds it. */
  portrait: string;
}

export function refOf(card: PlayerCard | undefined): CardRef | undefined {
  if (!card) return undefined;
  return { code: card.code, name: card.name, rating: card.rating, portrait: cardToPlayer(card).portrait };
}

/** Same identity rule the squad uses to refuse two cards of one player on the pitch. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The art file a card is drawn with, reduced to its file name so a thumb path, an
 * encoded path and a plain one compare equal. Returns '' for fallback art, which many
 * cards share and so identifies nobody.
 */
export function artKey(portrait: string): string {
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

/** An owned card reduced to what identifies it. Build once per card, compare many times. */
export interface OwnedKey {
  playerId: string;
  code: string;
  name: string;
  /** Printed OVR (`OwnedPlayer.rating` never includes the rank-up bonus). */
  rating: number;
  art: string;
}

export function keyOf(
  card: Pick<OwnedPlayer, 'playerId' | 'name' | 'rating' | 'portrait' | 'code'>,
): OwnedKey {
  return {
    playerId: card.playerId,
    code: card.code ?? '',
    name: card.name ? nameKey(card.name) : '',
    rating: card.rating,
    art: artKey(card.portrait ?? ''),
  };
}

/**
 * Whether an owned card is the catalogue card `cardId`.
 *
 * 1. Same catalogue id — always the right card.
 * 2. Both carry a card number — the number decides, and nothing else.
 * 3. Either side has no number yet (cards made or pulled before numbers existed) —
 *    the same *card*, not merely the same player: the same OVR, and the same art file
 *    (or, only when either side has no real art, the same name). A player's name alone
 *    is never enough — a MESSI 117 from fusion is not the MESSI 122 an offer asks for.
 */
export function isSameCard(cardId: string, ref: CardRef | undefined, owned: OwnedKey): boolean {
  if (owned.playerId === cardId) return true;
  if (!ref) return false;
  if (ref.code && owned.code) return ref.code === owned.code;
  if (ref.rating !== owned.rating) return false;
  const art = artKey(ref.portrait);
  if (art !== '' && owned.art !== '') return art === owned.art;
  return ref.name !== '' && owned.name === nameKey(ref.name);
}

/**
 * A key under which two catalogue entries count as one card: the number when there
 * is one, else OVR + art (or OVR + name without art), else the id itself. Mirrors
 * `isSameCard`, so two versions of one player are never folded together.
 */
export function groupKey(cardId: string, ref: CardRef | undefined): string {
  if (!ref) return `i:${cardId}`;
  if (ref.code) return `c:${ref.code}`;
  const art = artKey(ref.portrait);
  if (art) return `a:${ref.rating}:${art}`;
  if (ref.name) return `n:${ref.rating}:${nameKey(ref.name)}`;
  return `i:${cardId}`;
}
