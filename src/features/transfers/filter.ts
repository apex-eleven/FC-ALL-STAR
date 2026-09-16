import { groupOf, type PositionGroup } from '@/features/squad/rating';

/** What the search / filter dialog narrows both grids by. */
export interface CardFilter {
  query: string;
  group: PositionGroup | 'all';
  minOvr: number | null;
  maxOvr: number | null;
}

export const EMPTY_FILTER: CardFilter = { query: '', group: 'all', minOvr: null, maxOvr: null };

export const GROUP_LABELS: readonly { id: CardFilter['group']; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'GK', label: 'ผู้รักษาประตู' },
  { id: 'DEF', label: 'กองหลัง' },
  { id: 'MID', label: 'กองกลาง' },
  { id: 'ATT', label: 'กองหน้า' },
];

export function isEmptyFilter(filter: CardFilter): boolean {
  return (
    filter.query.trim() === '' &&
    filter.group === 'all' &&
    filter.minOvr === null &&
    filter.maxOvr === null
  );
}

/** Lower-cased with accents stripped, so typing "zulj" finds "Žulj". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function matchesFilter(
  card: { name: string; position: string },
  rating: number,
  filter: CardFilter,
): boolean {
  const needle = fold(filter.query.trim());
  if (needle && !fold(card.name).includes(needle)) return false;
  if (filter.group !== 'all' && groupOf(card.position) !== filter.group) return false;
  if (filter.minOvr !== null && rating < filter.minOvr) return false;
  if (filter.maxOvr !== null && rating > filter.maxOvr) return false;
  return true;
}
