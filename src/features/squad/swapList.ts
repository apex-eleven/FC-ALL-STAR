import type { OwnedPlayer } from '@/features/club/types';
import type { PlayerSet } from '@/features/draft/types';
import { ratingWithPlus } from '@/features/rankup/plus';
import { effectiveRating } from './rating';

/** Ordering for the swap screen's card list. */
export type SwapSort = 'position' | 'ovr' | 'set' | 'newest';

export const SWAP_SORTS: readonly { id: SwapSort; label: string }[] = [
  { id: 'position', label: 'ตำแหน่ง' },
  { id: 'ovr', label: 'OVR' },
  { id: 'set', label: 'ระดับการ์ด' },
  { id: 'newest', label: 'ได้มาล่าสุด' },
];

export interface SwapFilter {
  /** Empty = every tier. */
  sets: PlayerSet[];
  /** '' = any. */
  club: string;
  nation: string;
  /** Upgraded OVR bounds, inclusive. null = open. */
  minOvr: number | null;
  maxOvr: number | null;
}

export const EMPTY_SWAP_FILTER: SwapFilter = {
  sets: [],
  club: '',
  nation: '',
  minOvr: null,
  maxOvr: null,
};

/** How many filter groups are narrowing the list — drawn on the filter button. */
export function activeFilters(filter: SwapFilter): number {
  return (
    (filter.sets.length > 0 ? 1 : 0) +
    (filter.club ? 1 : 0) +
    (filter.nation ? 1 : 0) +
    (filter.minOvr !== null || filter.maxOvr !== null ? 1 : 0)
  );
}

export function matchesFilter(player: OwnedPlayer, filter: SwapFilter): boolean {
  if (filter.sets.length > 0 && !filter.sets.includes(player.set)) return false;
  if (filter.club && player.club !== filter.club) return false;
  if (filter.nation && player.nation !== filter.nation) return false;
  const ovr = ratingWithPlus(player);
  if (filter.minOvr !== null && ovr < filter.minOvr) return false;
  if (filter.maxOvr !== null && ovr > filter.maxOvr) return false;
  return true;
}

const SET_ORDER: Record<PlayerSet, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * `position` is best fit for the slot (the rating the card would actually play at),
 * which is what the old picker always did. A bench seat has no position, so it falls
 * back to the upgraded OVR.
 */
export function sortSwapList(
  players: readonly OwnedPlayer[],
  sort: SwapSort,
  slotPosition: string | null,
): OwnedPlayer[] {
  const fit = (player: OwnedPlayer) =>
    slotPosition ? effectiveRating(player, slotPosition) : ratingWithPlus(player);
  const byName = (a: OwnedPlayer, b: OwnedPlayer) => a.name.localeCompare(b.name);

  const compare: Record<SwapSort, (a: OwnedPlayer, b: OwnedPlayer) => number> = {
    position: (a, b) => fit(b) - fit(a) || byName(a, b),
    ovr: (a, b) => ratingWithPlus(b) - ratingWithPlus(a) || byName(a, b),
    set: (a, b) =>
      SET_ORDER[a.set] - SET_ORDER[b.set] || ratingWithPlus(b) - ratingWithPlus(a) || byName(a, b),
    newest: (a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || byName(a, b),
  };
  return [...players].sort(compare[sort]);
}
