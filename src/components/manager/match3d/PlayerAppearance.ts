import type { HairStyle, PlayerLook } from './players/playerAppearance';

/**
 * What the procedural `Player3D` needs to draw a player: the player's resolved
 * `PlayerLook` — kit, skin, hair, boots, gloves, sleeves, stature, all decided by
 * `resolvePlayerLook` and shared with the realistic body — plus the proportions only
 * this primitive body uses.
 *
 * No colour is decided here any more. Team kits live in `players/KitSystem.ts`; this
 * file only adds limb proportions and the kicking foot, seeded from the player's id
 * exactly as before, so a given card still takes the field built the same way.
 */

export type { HairStyle };

export interface PlayerAppearance extends PlayerLook {
  /** Chest and shoulder width relative to the base body. */
  build: number;
  /** Limb lengths relative to the base body — a rangy player has longer legs. */
  legLength: number;
  armLength: number;
  /** Kicking foot: −1 left, +1 right. Roughly one in four is left-footed. */
  footed: -1 | 1;
}

/** FNV-1a, matching the look's own seeding. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** A seeded number in [min, max]. */
function between(seed: string, salt: string, min: number, max: number): number {
  return min + ((hash(`${seed}:${salt}`) >>> 8) / 0x1000000) * (max - min);
}

/**
 * A player's kicking foot, from their id: −1 left, +1 right, roughly one in four
 * left-footed. Shared by both bodies, so a player strikes with the same foot whichever
 * one draws them.
 */
export function footedOf(id: string): -1 | 1 {
  return hash(`${id}:foot`) % 4 === 0 ? -1 : 1;
}

/** The procedural body for a resolved look. Called once per player lifecycle. */
export function proceduralAppearance(look: PlayerLook): PlayerAppearance {
  const id = look.id;
  return {
    ...look,
    build: between(id, 'build', 0.92, 1.1),
    legLength: between(id, 'legs', 0.96, 1.05),
    armLength: between(id, 'arms', 0.96, 1.05),
    footed: footedOf(id),
  };
}
