import { ASSETS } from '@/assets/assetMap';
import { playerArtUrl } from '@/features/players/artManifest';
import type { PlayerCard } from '@/features/players/types';
import type { DraftPlayer } from './types';

/** Used when a card has no art yet, so an unfinished card still renders as a card. */
const FALLBACK_PORTRAIT: Record<DraftPlayer['set'], string> = {
  A: ASSETS.draft.portraitA,
  B: ASSETS.draft.portraitB,
  C: ASSETS.draft.portraitC,
  D: ASSETS.draft.portraitD,
};

/**
 * Turns a catalogue card into the shape the pull, the walkout, and the club all
 * already speak.
 *
 * Resolution happens here, on every read, rather than at save time: the card stores
 * an art file name, so renaming the app's base path or swapping the file changes
 * nothing in storage.
 */
export function cardToPlayer(card: PlayerCard): DraftPlayer {
  return {
    id: card.id,
    name: card.name,
    rating: card.rating,
    position: card.position,
    set: card.set,
    nation: card.nation,
    club: card.club,
    portrait: playerArtUrl(card.artId) ?? FALLBACK_PORTRAIT[card.set],
  };
}
