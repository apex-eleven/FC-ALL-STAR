/**
 * The star-signing market (การเซ็นสัญญาดาวเด่น).
 *
 * Two directions over one currency: catalogue cards are bought with exchange points,
 * owned cards are sold back for them. What either costs is admin configuration —
 * a price by OVR band, with any single card able to override it.
 */

/**
 * One OVR band. Applies from `minRating` up to the next band's start.
 *
 * A price of 0 switches that direction off for the band: 0 to buy means not on sale,
 * 0 to sell means the card cannot be exchanged back. Nothing is ever given away.
 */
export interface PriceBand {
  minRating: number;
  buy: number;
  sell: number;
}

/**
 * A per-card override, keyed by catalogue id.
 *
 * `null` means "use the band". `hidden` takes the card out of the market without
 * touching its prices, so switching it back on restores exactly what was there.
 */
export interface CardPrice {
  buy: number | null;
  sell: number | null;
  hidden: boolean;
}

export interface TransferConfig {
  enabled: boolean;
  /** Sorted by `minRating`, lowest first. Always at least one band starting at 0. */
  bands: PriceBand[];
  overrides: Record<string, CardPrice>;
  /** How many cards one account may keep on its watch list. */
  watchLimit: number;
}

/**
 * The per-account half. Lives on the account, like `league`.
 *
 * `watch` holds catalogue ids — a watched card is one for sale, not one owned.
 * `locked` holds owned-card ids — a lock protects a specific copy from being sold.
 */
export interface TransferProgress {
  watch: string[];
  locked: string[];
}

export type BuyError =
  | 'closed'
  | 'not-listed'
  | 'club-full'
  | 'insufficient-funds'
  | 'at-cap';

export type SellError = 'closed' | 'nothing-sellable' | 'at-cap';
