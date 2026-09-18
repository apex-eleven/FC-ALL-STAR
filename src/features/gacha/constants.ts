import type { GachaConfig, GachaPrize, GachaRarity } from './types';

export const GACHA_CONFIG_KEY = 'football-home-ui:gacha:v1';

export const MAX_PRIZES = 40;
export const MAX_CHANCE = 100_000;
export const MAX_KEY_COST = 999;
export const NAME_MAX = 40;
export const HISTORY_LIMIT = 10;
/** How many spins one press can buy. */
export const SPIN_COUNTS: readonly number[] = [1, 5, 10];
/** `eventId` on cards won from the roulette — provenance only. */
export const GACHA_EVENT_ID = 'gacha';
/** Case art shares the 1 MiB settings document. */
export const CASE_IMAGE = { maxWidth: 900, maxHeight: 420, maxBytes: 90_000 };

export const RARITY_LABEL: Record<GachaRarity, string> = {
  common: 'ทั่วไป',
  rare: 'หายาก',
  epic: 'มหากาพย์',
  legend: 'ตำนาน',
  mythic: 'พิเศษสุด',
};

/** Band colour under a prize card, matching the reference's strip. */
export const RARITY_COLOR: Record<GachaRarity, string> = {
  common: '#e2c552',
  rare: '#4ade80',
  epic: '#a855f7',
  legend: '#38bdf8',
  mythic: '#ef4444',
};

export function gachaId(prefix = 'gp'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function prize(
  id: string,
  name: string,
  chance: number,
  rarity: GachaRarity,
  reward: GachaPrize['reward'],
  announce = false,
): GachaPrize {
  return { id, enabled: true, name, reward, chance, rarity, announce };
}

export function defaultGacha(): GachaConfig {
  return {
    enabled: true,
    title: 'GACHAPON',
    caseName: 'FC ALL-STAR CORE',
    subtitle: 'ระบบสุ่มรางวัล',
    keyCost: 1,
    caseImage: '',
    prizes: [
      prize('gp-exchange', '', 30, 'common', { kind: 'exchange', amount: 1_000 }),
      prize('gp-gem', '', 24, 'common', { kind: 'gem', amount: 100 }),
      prize('gp-ticket', '', 18, 'rare', { kind: 'ticket', amount: 2 }),
      prize('gp-box', '', 12, 'rare', { kind: 'item', itemId: 'it-box-fcpoint', amount: 1 }),
      prize('gp-pack', '', 8, 'epic', { kind: 'item', itemId: 'it-pack', amount: 1 }, true),
      prize('gp-shield', '', 5, 'epic', { kind: 'item', itemId: 'it-shield', amount: 1 }, true),
      prize('gp-plus7', '', 2, 'legend', { kind: 'item', itemId: 'it-plus-7', amount: 1 }, true),
      prize('gp-plus8', '', 1, 'mythic', { kind: 'item', itemId: 'it-plus-8', amount: 1 }, true),
    ],
  };
}
