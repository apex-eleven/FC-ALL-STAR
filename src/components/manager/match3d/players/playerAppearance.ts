import type { MatchSide } from '@/match-engine';
import { DEFAULT_MATCH_KITS, normalizeHex, resolveKit, type MatchKits, type TeamKit } from './KitSystem';

/**
 * What a player looks like — resolved ONCE per player id, for as long as they are on
 * the pitch, and handed to whichever body draws them (the realistic GLB or the
 * procedural fallback). Neither body invents a colour of its own.
 *
 * PURE and deterministic: the same inputs give the same look, every time, on every
 * machine. The varied parts (skin, hair, boots, stature) are seeded from the player's
 * id — never from an array position — with the same hash and salts the procedural
 * body has always used, so a card that took the field before keeps its look.
 *
 * All presets are generic. No preset is, or is meant to resemble, a real person.
 */

export type HairStyle = 'short' | 'buzz' | 'long' | 'curly';

export type SkinToneId = 'skin_01' | 'skin_02' | 'skin_03' | 'skin_04' | 'skin_05' | 'skin_06';

export interface PlayerLook {
  /** The player id it was resolved for. */
  id: string;
  side: MatchSide;
  /** From the engine's role. Only a keeper gets a keeper kit, gloves or long sleeves. */
  isKeeper: boolean;
  kit: TeamKit;
  /** The preset and its colour. */
  skinTone: SkinToneId;
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  boots: string;
  bootAccent: string;
  /** Keepers only. */
  gloves: string | null;
  longSleeves: boolean;
  /** 0–99. */
  shirtNumber: number;
  /** Whole-body scale around the 1.80 m base: 1.00 = 1.80 m, 1.05 = 1.89 m. */
  stature: number;
  /** A team mark to wear, when there is one. Never a real club's crest. */
  badgeId: string | null;
}

/* ── Presets ────────────────────────────────────────────────────────────────── */

export const SKIN_TONES: readonly { id: SkinToneId; color: string }[] = [
  { id: 'skin_01', color: '#f2c8a2' },
  { id: 'skin_02', color: '#e3aa7c' },
  { id: 'skin_03', color: '#c88a52' },
  { id: 'skin_04', color: '#9c6237' },
  { id: 'skin_05', color: '#6f4327' },
  { id: 'skin_06', color: '#4a2c19' },
];

export const HAIR_COLORS: readonly string[] = ['#15100d', '#2b1a0e', '#573619', '#0c0c0c', '#8a6a3c', '#b89a5a'];

/** Weighted: short is the most common. */
const HAIR_STYLES: readonly HairStyle[] = ['short', 'short', 'short', 'buzz', 'buzz', 'long', 'curly'];

/** A small palette on purpose — a handful of boot materials, not twenty-two. */
export const BOOT_COLORS: readonly { boots: string; accent: string }[] = [
  { boots: '#12151b', accent: '#f4f4f4' },
  { boots: '#f4f4f4', accent: '#12151b' },
  { boots: '#e8d24a', accent: '#12151b' },
  { boots: '#e2456a', accent: '#ffffff' },
  { boots: '#2f6cff', accent: '#ffffff' },
  { boots: '#ff7a1a', accent: '#12151b' },
];

export const GLOVE_COLORS: readonly string[] = ['#f4f4f4', '#101318', '#c6f23a', '#ffa64d'];

export const STATURE_MIN = 0.94;
export const STATURE_MAX = 1.06;

/* ── Seeding (the same FNV-1a and salts as the procedural body always used) ─── */

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function pick<T>(list: readonly T[], seed: string, salt: string): T {
  return list[hash(`${seed}:${salt}`) % list.length]!;
}

/** Seeded number in [min, max]. */
function between(seed: string, salt: string, min: number, max: number): number {
  return min + ((hash(`${seed}:${salt}`) >>> 8) / 0x1000000) * (max - min);
}

/* ── Inputs ─────────────────────────────────────────────────────────────────── */

/** What the engine knows about a player — all the look needs. */
export interface PlayerLookInput {
  id: string;
  side: MatchSide;
  isKeeper: boolean;
  /** The engine's shirt number (its slot order, 1–11 for starters). */
  shirtNumber: number;
  /** The engine's slot id: `bench-N` marks a substitute. */
  slotId?: string;
}

/**
 * Per-player choices from outside the match — a card's cosmetics, a player profile,
 * a club's squad numbers — whatever supplies them later. Every field optional and
 * every value validated; nothing here can hand an outfield player keeper gear.
 */
export interface PlayerLookOverrides {
  skinTone?: SkinToneId;
  hairStyle?: HairStyle;
  hairColor?: string;
  boots?: string;
  bootAccent?: string;
  stature?: number;
  shirtNumber?: number;
  badgeId?: string | null;
}

/** Where the look can draw on data from outside the engine. All optional. */
export interface PlayerLookSources {
  /** The match's kits. Defaults to FC ALL-STAR's. */
  kits?: MatchKits;
  /** Each side's team mark. */
  badges?: Partial<Record<MatchSide, string | null>>;
  /** Per-player choices, looked up by player id. */
  overrides?: (id: string) => PlayerLookOverrides | null | undefined;
}

/**
 * The shirt number a player wears: the engine's for a starter; a substitute's bench
 * slot counts on from 12, the way squad numbers do, so a substitute never takes the
 * number of the keeper or anyone else in the starting eleven.
 */
export function shirtNumberFor(input: PlayerLookInput): number {
  const bench = /^bench-(\d+)$/.exec(input.slotId ?? '');
  const number = bench ? 12 + Number(bench[1]) : input.shirtNumber;
  return Math.max(0, Math.min(99, Math.round(Number.isFinite(number) ? number : 0)));
}

const SKIN_IDS = new Set(SKIN_TONES.map((tone) => tone.id));
const STYLES = new Set<HairStyle>(['short', 'buzz', 'long', 'curly']);

/**
 * Resolves a player's look. Call once per player lifecycle — the result is a plain
 * object to keep, not to recompute per frame.
 */
export function resolvePlayerLook(input: PlayerLookInput, sources: PlayerLookSources = {}): PlayerLook {
  const { id, side, isKeeper } = input;
  const kit = resolveKit(side, isKeeper, sources.kits ?? DEFAULT_MATCH_KITS);
  const over = sources.overrides?.(id) ?? {};

  const tone =
    (over.skinTone && SKIN_IDS.has(over.skinTone) && SKIN_TONES.find((entry) => entry.id === over.skinTone)) ||
    pick(SKIN_TONES, id, 'skin');
  const boots = pick(BOOT_COLORS, id, 'boots');
  const stature = isKeeper
    ? // Keepers run tall.
      between(id, 'stature', 0.99, STATURE_MAX)
    : between(id, 'stature', STATURE_MIN, 1.05);

  return {
    id,
    side,
    isKeeper,
    kit,
    skinTone: tone.id,
    skin: tone.color,
    hairStyle: over.hairStyle && STYLES.has(over.hairStyle) ? over.hairStyle : pick(HAIR_STYLES, id, 'hairStyle'),
    hairColor: normalizeHex(over.hairColor) ?? pick(HAIR_COLORS, id, 'hair'),
    boots: normalizeHex(over.boots) ?? boots.boots,
    bootAccent: normalizeHex(over.bootAccent) ?? boots.accent,
    // Keeper gear follows the engine's keeper flag and nothing else.
    gloves: isKeeper ? pick(GLOVE_COLORS, id, 'gloves') : null,
    longSleeves: isKeeper,
    shirtNumber: over.shirtNumber !== undefined ? shirtNumberFor({ ...input, slotId: undefined, shirtNumber: over.shirtNumber }) : shirtNumberFor(input),
    stature:
      over.stature !== undefined && Number.isFinite(over.stature)
        ? Math.max(STATURE_MIN, Math.min(STATURE_MAX, over.stature))
        : stature,
    badgeId: over.badgeId !== undefined ? over.badgeId : (sources.badges?.[side] ?? null),
  };
}
