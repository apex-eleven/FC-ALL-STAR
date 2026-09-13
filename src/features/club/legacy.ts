import type { OwnedPlayer } from './types';

/**
 * Id prefixes of the generated placeholders that used to ship in the draft pools —
 * "ผู้เล่นระดับตำนาน A1", "แชมเปี้ยน B2", and the rest, all drawn with the same four
 * stand-in portraits.
 *
 * They existed so the draft screen had something to pull before the card catalogue
 * was built. Now they are indistinguishable from real cards at a glance while being
 * unowned by any real pack, so they are cleared out of every club on load.
 */
const LEGACY_PREFIXES = ['w-', 'n4-', 'n10-'] as const;

export function isLegacyCard(player: OwnedPlayer): boolean {
  return LEGACY_PREFIXES.some((prefix) => player.playerId.startsWith(prefix));
}

/**
 * Drops the placeholders from a list of owned cards.
 *
 * Squad slots pointing at a removed card are cleaned up by the squad normaliser,
 * which already repairs against what is actually owned — so this only has to remove
 * the cards themselves.
 */
export function withoutLegacy(players: readonly OwnedPlayer[]): OwnedPlayer[] {
  return players.filter((player) => !isLegacyCard(player));
}
