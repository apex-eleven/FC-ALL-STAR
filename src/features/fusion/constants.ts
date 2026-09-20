import type { FusionConfig, FusionPrize, FusionRarity } from './types';

export const FUSION_CONFIG_KEY = 'football-home-ui:fusion:v1';

export const MAX_PRIZES = 40;
export const MAX_CHANCE = 100_000;
export const NAME_MAX = 40;
export const HISTORY_LIMIT = 10;

/** How many cards one fusion may eat. */
export const MIN_MATERIALS = 1;
export const MAX_MATERIALS = 11;
/** How many prizes may be dealt. Five is the brief; the range is there to tune it. */
export const MIN_DRAWS = 2;
export const MAX_DRAWS = 8;

/** Ceiling on each id list, so a hand-edited config cannot blow the settings doc. */
export const MAX_ID_LIST = 2_000;

/** `eventId` on cards won at the bench — provenance only. */
export const FUSION_EVENT_ID = 'fusion';

/** Rail icon shares the 1 MiB settings document, so it is kept small. */
export const ICON_IMAGE = { maxWidth: 320, maxHeight: 320, maxBytes: 60_000 };

export const RARITY_LABEL: Record<FusionRarity, string> = {
  common: 'ทั่วไป',
  rare: 'หายาก',
  epic: 'มหากาพย์',
  legend: 'ตำนาน',
  mythic: 'พิเศษสุด',
};

export const RARITY_COLOR: Record<FusionRarity, string> = {
  common: '#e2c552',
  rare: '#4ade80',
  epic: '#a855f7',
  legend: '#38bdf8',
  mythic: '#ef4444',
};

export function fusionId(prefix = 'fp'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function prize(
  id: string,
  chance: number,
  rarity: FusionRarity,
  reward: FusionPrize['reward'],
): FusionPrize {
  return { id, enabled: true, name: '', reward, chance, rarity };
}

/**
 * The out-of-the-box bench.
 *
 * Deliberately all currency and items: a default that named catalogue cards would
 * break the first time an admin renamed or removed one, and a prize pointing at a
 * missing card is dropped on load — which reads as the feature being broken.
 */
export function defaultFusion(): FusionConfig {
  return {
    enabled: true,
    title: 'ผสมการ์ด',
    subtitle: 'ลุ้นการ์ด +0 ถึง +8',
    icon: '',
    materials: 3,
    draws: 5,
    materialIds: [],
    lockedIds: [],
    prizes: [
      prize('fu-exchange', 34, 'common', { kind: 'exchange', amount: 1_000 }),
      prize('fu-gem', 26, 'common', { kind: 'gem', amount: 100 }),
      prize('fu-ticket', 18, 'rare', { kind: 'ticket', amount: 2 }),
      prize('fu-box', 12, 'rare', { kind: 'item', itemId: 'it-box-fcpoint', amount: 1 }),
      prize('fu-pack', 7, 'epic', { kind: 'item', itemId: 'it-pack', amount: 1 }),
      prize('fu-plus7', 2, 'legend', { kind: 'item', itemId: 'it-plus-7', amount: 1 }),
      prize('fu-plus8', 1, 'mythic', { kind: 'item', itemId: 'it-plus-8', amount: 1 }),
    ],
  };
}
