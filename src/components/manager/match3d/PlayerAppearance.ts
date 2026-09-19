import type { Side } from '@/features/manager/matchEngine';

/**
 * What a player looks like: colours, build and kit. The whole squad shares one set of
 * geometries and one joint hierarchy (see `Player3D`), dressed and proportioned
 * differently — so everything here is either a colour or a scale factor.
 *
 * The variation is seeded from the player's id the same way `squad/stats.ts` seeds
 * its derived numbers, so a given card always takes the field looking the same, and
 * nothing here is ever re-rolled while a match runs.
 */

/** Hair silhouettes the head mesh can wear. `bald` draws nothing. */
export type HairStyle = 'short' | 'buzz' | 'long' | 'bald';

export interface PlayerKit {
  /** Shirt body. */
  shirt: string;
  /** Sleeves, collar and the sock turnover — the kit's second colour. */
  trim: string;
  shorts: string;
  socks: string;
}

export interface PlayerAppearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  kit: PlayerKit;
  boots: string;
  /** Keepers wear gloves; outfield players have bare hands. */
  gloves: string | null;
  keeper: boolean;
  /** Whole-body scale. 1 is 1.80 m; the squad spans roughly 1.70–1.90. */
  stature: number;
  /** Chest and shoulder width relative to the base body. */
  build: number;
  /** Limb lengths relative to the base body — a rangy player has longer legs. */
  legLength: number;
  armLength: number;
  /** Kicking foot: −1 left, +1 right. Roughly one in four is left-footed. */
  footed: -1 | 1;
}

const SKINS = ['#f2c8a2', '#e3aa7c', '#c88a52', '#9c6237', '#6f4327', '#4a2c19'];
const HAIRS = ['#15100d', '#2b1a0e', '#573619', '#0c0c0c', '#8a6a3c', '#b89a5a'];
const HAIR_STYLES: readonly HairStyle[] = ['short', 'short', 'short', 'buzz', 'buzz', 'long', 'bald'];
const BOOTS = ['#12151b', '#f4f4f4', '#e8d24a', '#e2456a', '#2f6cff', '#ff7a1a'];

/**
 * Outfield kits, keyed to the team colours the rest of the screen already uses. The
 * trim is what keeps a shirt from reading as one flat block of colour from the
 * touchline camera.
 */
const KITS: Record<Side, PlayerKit> = {
  home: { shirt: '#c6f23a', trim: '#1c2a08', shorts: '#23300c', socks: '#c6f23a' },
  away: { shirt: '#ff5b5b', trim: '#ffffff', shorts: '#3d1216', socks: '#ff5b5b' },
};

/**
 * Keepers wear neither side's colours, so the net is readable at a glance, and each
 * end gets its own so the two keepers are never confused for each other either.
 */
const KEEPER_KITS: Record<Side, PlayerKit> = {
  home: { shirt: '#2ec4b6', trim: '#0c2b28', shorts: '#10403b', socks: '#2ec4b6' },
  away: { shirt: '#f2a93b', trim: '#3a2408', shorts: '#4a2f0a', socks: '#f2a93b' },
};

const GLOVES = ['#f4f4f4', '#101318', '#c6f23a', '#ffa64d'];

/** FNV-1a, matching the hash `squad/stats.ts` uses for its own seeded picks. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function pick<T>(list: readonly T[], seed: string, salt: string): T {
  return list[hash(`${seed}:${salt}`) % list.length]!;
}

/** A seeded number in [0, 1). */
function roll(seed: string, salt: string): number {
  return (hash(`${seed}:${salt}`) >>> 8) / 0x1000000;
}

/** A seeded number in [min, max]. */
function between(seed: string, salt: string, min: number, max: number): number {
  return min + roll(seed, salt) * (max - min);
}

export function appearanceOf(id: string, side: Side, keeper: boolean): PlayerAppearance {
  const kit = keeper ? KEEPER_KITS[side] : KITS[side];
  const stature = keeper
    ? // Keepers run tall.
      between(id, 'stature', 0.99, 1.06)
    : between(id, 'stature', 0.94, 1.05);
  return {
    skin: pick(SKINS, id, 'skin'),
    hair: pick(HAIRS, id, 'hair'),
    hairStyle: pick(HAIR_STYLES, id, 'hairStyle'),
    kit,
    boots: pick(BOOTS, id, 'boots'),
    gloves: keeper ? pick(GLOVES, id, 'gloves') : null,
    keeper,
    stature,
    build: between(id, 'build', 0.92, 1.1),
    legLength: between(id, 'legs', 0.96, 1.05),
    armLength: between(id, 'arms', 0.96, 1.05),
    footed: hash(`${id}:foot`) % 4 === 0 ? -1 : 1,
  };
}
