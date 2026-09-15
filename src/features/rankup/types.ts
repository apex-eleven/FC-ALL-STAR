import type { CurrencyKind } from '@/features/currencies/types';

/**
 * What happens to the target card when a try fails.
 *
 * `keep` is the forgiving setting used for the early levels; `down` and `reset` are
 * what make the late ones a gamble. `destroy` exists because some games do it, not
 * because it is recommended — an admin who turns it on is choosing to delete a
 * player's card, and the panel says so.
 */
export type RankUpFailMode = 'keep' | 'down' | 'reset' | 'destroy';

/** One row of the ladder: what it costs to go from `level - 1` to `level`. */
export interface RankUpLevel {
  /** The plus this row produces, 1..MAX_PLUS. Also its identity in the list. */
  level: number;
  /** How many material cards one try consumes. */
  materials: number;
  /** Success chance, 0..100. */
  chance: number;
  /**
   * Rating added to a card *sitting at* this plus.
   *
   * Cumulative is deliberately not used: a flat table per level means the admin can
   * read a card's real rating off one row instead of adding eight of them up.
   */
  bonus: number;
  cost: number;
  currency: CurrencyKind;
  onFail: RankUpFailMode;
  /**
   * Catalogue card ids accepted as material at this level.
   *
   * Empty falls back to `RankUpConfig.materialIds`, so the common case is one list
   * set once and levels that need something rarer override it.
   */
  materialIds: string[];
}

export interface RankUpConfig {
  /** Off takes the screen out of the bottom bar rather than leaving a dead button. */
  enabled: boolean;
  /** Default material list, used by every level that does not name its own. */
  materialIds: string[];
  /**
   * Backdrop for the screen. A data URL, or '' for the built-in art.
   *
   * Stored with the rest of the admin config, so changing the season's theme is an
   * upload rather than a redeploy — which is the whole reason it is not an import.
   */
  background: string;
  /** Materials come back when a try fails. Off means they burn either way. */
  refundOnFail: boolean;
  /** Always MAX_PLUS entries, ordered 1..MAX_PLUS. Repaired on load. */
  levels: RankUpLevel[];
}

/** What one press of RANK UP did. */
export interface RankUpOutcome {
  success: boolean;
  /** Plus before the try. */
  from: number;
  /** Plus after it — equal to `from` when the rule was `keep`. */
  to: number;
  /** The target card was consumed by a `destroy` rule. */
  destroyed: boolean;
  /** Material ids that were burned. Empty when a failed try refunded them. */
  consumed: string[];
}
