import type { MatchSide } from '@/match-engine';

/**
 * Team kits as data. Nothing that draws a player holds a team colour: the colours
 * live in a `MatchKits` value, and `resolveKit` hands each player the kit they wear.
 *
 * PURE: no React, no three. Replacing a side's kit — a club's colours, an away strip,
 * a cosmetic — is building a different `MatchKits` and passing it in; nothing else in
 * the renderer changes.
 */

export type KitPattern = 'plain' | 'stripes' | 'hoops';

export interface TeamKit {
  /** Shirt body. */
  shirt: string;
  /** Collar, cuffs, and the second colour of a striped or hooped shirt. */
  trim: string;
  shorts: string;
  socks: string;
  /** The sock turnover band. */
  sockTrim: string;
  /** Shirt number, drawn over the shirt. */
  number: string;
  pattern?: KitPattern;
}

/** Everything one match needs: both sides, and each side's goalkeeper. */
export interface MatchKits {
  home: TeamKit;
  away: TeamKit;
  homeKeeper: TeamKit;
  awayKeeper: TeamKit;
}

/**
 * FC ALL-STAR's defaults — the colours the match has always used, now as data.
 * Keepers wear neither side's colours, and each end its own, so the two keepers are
 * never confused with each other or with the outfield.
 */
export const DEFAULT_MATCH_KITS: Readonly<MatchKits> = {
  home: { shirt: '#c6f23a', trim: '#1c2a08', shorts: '#23300c', socks: '#c6f23a', sockTrim: '#1c2a08', number: '#1c2a08', pattern: 'plain' },
  away: { shirt: '#ff5b5b', trim: '#ffffff', shorts: '#3d1216', socks: '#ff5b5b', sockTrim: '#ffffff', number: '#ffffff', pattern: 'plain' },
  homeKeeper: { shirt: '#2ec4b6', trim: '#0c2b28', shorts: '#10403b', socks: '#2ec4b6', sockTrim: '#0c2b28', number: '#0c2b28', pattern: 'plain' },
  awayKeeper: { shirt: '#f2a93b', trim: '#3a2408', shorts: '#4a2f0a', socks: '#f2a93b', sockTrim: '#3a2408', number: '#3a2408', pattern: 'plain' },
};

const HEX = /^#[0-9a-f]{6}$/;
const PATTERNS: readonly KitPattern[] = ['plain', 'stripes', 'hoops'];
const KIT_FIELDS = ['shirt', 'trim', 'shorts', 'socks', 'sockTrim', 'number'] as const;

/** '#ABC' / '#AABBCC' / 'aabbcc' → '#aabbcc'; anything else → null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let hex = value.trim().toLowerCase();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return HEX.test(hex) ? hex : null;
}

/**
 * A kit from untrusted data (a team document, a club setting): every colour
 * repaired against `fallback`, the pattern checked. Never throws.
 */
export function normalizeKit(raw: Partial<TeamKit> | null | undefined, fallback: TeamKit): TeamKit {
  const kit = { ...fallback };
  if (raw) {
    for (const field of KIT_FIELDS) kit[field] = normalizeHex(raw[field]) ?? fallback[field];
    kit.pattern = raw.pattern && PATTERNS.includes(raw.pattern) ? raw.pattern : (fallback.pattern ?? 'plain');
  }
  return kit;
}

/** How far apart two colours are, 0..~441 (RGB distance). */
function distance(a: string, b: string): number {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  let sum = 0;
  for (const at of [1, 3, 5]) sum += (channel(a, at) - channel(b, at)) ** 2;
  return Math.sqrt(sum);
}

/** Closer than this and two shirts read as the same team from the broadcast camera. */
const CLASH = 60;

/**
 * A full match's kits from partial or untrusted input, filled from the defaults.
 * A keeper kit that could be mistaken for either outfield shirt is replaced with the
 * default keeper kit for that end — an outfield player and a keeper must never look
 * alike. `problems` says what was repaired.
 */
export function normalizeMatchKits(raw: Partial<Record<keyof MatchKits, Partial<TeamKit>>> = {}): {
  kits: MatchKits;
  problems: string[];
} {
  const problems: string[] = [];
  const kits: MatchKits = {
    home: normalizeKit(raw.home, DEFAULT_MATCH_KITS.home),
    away: normalizeKit(raw.away, DEFAULT_MATCH_KITS.away),
    homeKeeper: normalizeKit(raw.homeKeeper, DEFAULT_MATCH_KITS.homeKeeper),
    awayKeeper: normalizeKit(raw.awayKeeper, DEFAULT_MATCH_KITS.awayKeeper),
  };
  if (distance(kits.home.shirt, kits.away.shirt) < CLASH) {
    problems.push('home and away shirts clash; away uses its default kit');
    kits.away = { ...DEFAULT_MATCH_KITS.away };
  }
  for (const [keeper, fallback] of [['homeKeeper', DEFAULT_MATCH_KITS.homeKeeper], ['awayKeeper', DEFAULT_MATCH_KITS.awayKeeper]] as const) {
    const shirt = kits[keeper].shirt;
    if (distance(shirt, kits.home.shirt) < CLASH || distance(shirt, kits.away.shirt) < CLASH) {
      problems.push(`${keeper} shirt matches an outfield shirt; using the default keeper kit`);
      kits[keeper] = { ...fallback };
    }
  }
  return { kits, problems };
}

/**
 * The kit a player wears. The only place a side and a keeper flag turn into colours —
 * a keeper kit reaches a player only when the ENGINE says they are the keeper.
 */
export function resolveKit(side: MatchSide, isKeeper: boolean, kits: MatchKits = DEFAULT_MATCH_KITS): TeamKit {
  if (isKeeper) return side === 'home' ? kits.homeKeeper : kits.awayKeeper;
  return side === 'home' ? kits.home : kits.away;
}
