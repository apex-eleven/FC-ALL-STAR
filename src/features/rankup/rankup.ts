import type { OwnedPlayer } from '@/features/club/types';
import { MAX_PLUS } from './constants';
import { clampPlus } from './plus';
import type { RankUpConfig, RankUpLevel, RankUpOutcome } from './types';

export type RankUpBlock =
  | 'no-target'
  | 'maxed'
  | 'no-rule'
  | 'need-materials'
  | 'bad-material'
  | 'cannot-afford';

export interface RankUpReadiness {
  ok: boolean;
  reason: RankUpBlock | null;
  /** The rule the next try would use, or null when the card is already at +MAX. */
  rule: RankUpLevel | null;
}

/** The rule that takes a card from its current plus to the next one. */
export function nextRule(config: RankUpConfig, plus: number): RankUpLevel | null {
  const target = clampPlus(plus) + 1;
  if (target > MAX_PLUS) return null;
  return config.levels[target - 1] ?? null;
}

/**
 * Which catalogue cards this level accepts as material.
 *
 * Per-level list wins, the global list is the fallback, and both being empty means
 * "anything goes". That last case is the out-of-the-box state: a screen that refuses
 * every card until an admin has filled a list in reads as broken rather than as
 * unconfigured, and the panel says as much next to the picker.
 */
export function allowedMaterials(config: RankUpConfig, rule: RankUpLevel): Set<string> | null {
  if (rule.materialIds.length > 0) return new Set(rule.materialIds);
  if (config.materialIds.length > 0) return new Set(config.materialIds);
  return null;
}

/** True when this owned card may be fed to this level. The target is never eligible. */
export function isMaterial(
  config: RankUpConfig,
  rule: RankUpLevel,
  card: OwnedPlayer,
  targetId: string | null,
): boolean {
  if (card.id === targetId) return false;
  const allowed = allowedMaterials(config, rule);
  return allowed === null || allowed.has(card.playerId);
}

export interface ReadinessInput {
  config: RankUpConfig;
  target: OwnedPlayer | null;
  materials: readonly OwnedPlayer[];
  /** Balance of the rule's currency, so this stays free of the wallet hook. */
  balance: number;
}

export function checkReady({ config, target, materials, balance }: ReadinessInput): RankUpReadiness {
  if (!target) return { ok: false, reason: 'no-target', rule: null };

  const plus = clampPlus(target.plus);
  if (plus >= MAX_PLUS) return { ok: false, reason: 'maxed', rule: null };

  const rule = nextRule(config, plus);
  if (!rule) return { ok: false, reason: 'no-rule', rule: null };

  if (materials.length < rule.materials) {
    return { ok: false, reason: 'need-materials', rule };
  }
  if (materials.some((card) => !isMaterial(config, rule, card, target.id))) {
    return { ok: false, reason: 'bad-material', rule };
  }
  if (balance < rule.cost) return { ok: false, reason: 'cannot-afford', rule };

  return { ok: true, reason: null, rule };
}

/**
 * Rolls one try and works out what the card becomes.
 *
 * `random` is injected so the result can be replayed in a test rather than hoped at.
 * Cost and materials are the caller's to spend — this function only decides.
 */
export function attempt(
  config: RankUpConfig,
  target: OwnedPlayer,
  materials: readonly OwnedPlayer[],
  random: () => number = Math.random,
): RankUpOutcome {
  const from = clampPlus(target.plus);
  const rule = nextRule(config, from);
  const ids = materials.map((card) => card.id);

  if (!rule) {
    return { success: false, from, to: from, destroyed: false, consumed: [] };
  }

  const success = random() * 100 < rule.chance;

  if (success) {
    return { success: true, from, to: Math.min(MAX_PLUS, from + 1), destroyed: false, consumed: ids };
  }

  // A refund only ever applies to a failure — a successful try always eats its
  // material, or the currency cost would be the entire price of a card.
  const consumed = config.refundOnFail ? [] : ids;

  switch (rule.onFail) {
    case 'down':
      return { success: false, from, to: Math.max(0, from - 1), destroyed: false, consumed };
    case 'reset':
      return { success: false, from, to: 0, destroyed: false, consumed };
    case 'destroy':
      return { success: false, from, to: from, destroyed: true, consumed };
    case 'keep':
    default:
      return { success: false, from, to: from, destroyed: false, consumed };
  }
}

export const FAIL_LABEL: Record<RankUpLevel['onFail'], string> = {
  keep: 'คงระดับเดิม',
  down: 'ลดลง 1 ระดับ',
  reset: 'กลับไป +0',
  destroy: 'การ์ดหลักหายไป',
};
