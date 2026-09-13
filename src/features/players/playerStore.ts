import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import {
  MAX_PLAYERS,
  PLAYERS_KEY,
  PLAYER_CLUB_MAX,
  PLAYER_NAME_MAX,
  PLAYER_NATION_MAX,
  PLAYER_POSITION_MAX,
  RATING_MAX,
  RATING_MIN,
} from './constants';
import type { PlayerCard } from './types';

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' | 'too-many' };

function text(value: unknown, max: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, max);
}

/**
 * Repairs one card read from storage.
 *
 * Records can be hand-edited in DevTools, and a rating of 9999 or a set of "S" would
 * either break the odds roll or render a card nobody can ever pull. Returns null for
 * anything too broken to show — a card with no name is not a card.
 */
export function normalizeCard(value: unknown): PlayerCard | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;

  const id = text(source.id, 64);
  const name = text(source.name, PLAYER_NAME_MAX);
  if (!id || !name) return null;

  const rating = Number(source.rating);
  const set = PLAYER_SETS.includes(source.set as PlayerSet) ? (source.set as PlayerSet) : 'D';

  return {
    id,
    name,
    rating: Number.isFinite(rating)
      ? Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(rating)))
      : RATING_MIN,
    position: text(source.position, PLAYER_POSITION_MAX, 'ST').toUpperCase(),
    set,
    nation: text(source.nation, PLAYER_NATION_MAX, '—').toUpperCase(),
    club: text(source.club, PLAYER_CLUB_MAX, '—'),
    artId: typeof source.artId === 'string' && source.artId ? source.artId : null,
    createdAt: text(source.createdAt, 32) || new Date(0).toISOString(),
  };
}

export function normalizeCatalogue(value: unknown): PlayerCard[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const cards: PlayerCard[] = [];

  for (const entry of value) {
    const card = normalizeCard(entry);
    // A duplicate id would make every pack referencing it ambiguous, so the first
    // one wins rather than both surviving.
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
    if (cards.length >= MAX_PLAYERS) break;
  }

  return cards;
}

export function loadCatalogue(): PlayerCard[] {
  try {
    const raw = window.localStorage.getItem(PLAYERS_KEY);
    return raw ? normalizeCatalogue(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveCatalogue(cards: readonly PlayerCard[]): SaveResult {
  if (cards.length > MAX_PLAYERS) return { ok: false, reason: 'too-many' };

  try {
    window.localStorage.setItem(PLAYERS_KEY, JSON.stringify(cards));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}
