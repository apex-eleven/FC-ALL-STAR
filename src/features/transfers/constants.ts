import type { CurrencyKind } from '@/features/currencies/types';
import type { PriceBand, TransferConfig } from './types';

export const TRANSFER_CONFIG_KEY = 'football-home-ui:transfer:v1';

/** Buying and selling both run on exchange points. */
export const TRANSFER_CURRENCY: CurrencyKind = 'exchange';

/** Where a bought card says it came from — `OwnedPlayer.eventId` is provenance. */
export const TRANSFER_EVENT_ID = 'transfer';

/** Guard rails for the admin inputs. Hand-edited storage is clamped to these too. */
export const MAX_PRICE = 100_000_000;
export const MAX_BANDS = 20;
export const MAX_WATCH_LIMIT = 500;
export const DEFAULT_WATCH_LIMIT = 50;

/** Market grid page size. The catalogue can run to thousands of cards. */
export const MARKET_PAGE = 60;

/**
 * Shipped price ladder.
 *
 * Selling returns a small fraction of the buy price on purpose: if a card could be
 * sold for what it cost, the market would be a free swap machine, and if it sold for
 * more it would print points.
 */
export const DEFAULT_BANDS: readonly PriceBand[] = [
  { minRating: 0, buy: 1_000, sell: 50 },
  { minRating: 100, buy: 3_000, sell: 150 },
  { minRating: 110, buy: 8_000, sell: 300 },
  { minRating: 115, buy: 20_000, sell: 800 },
  { minRating: 120, buy: 50_000, sell: 2_250 },
  { minRating: 125, buy: 90_000, sell: 5_000 },
];

export const DEFAULT_TRANSFER: TransferConfig = {
  enabled: true,
  bands: DEFAULT_BANDS.map((band) => ({ ...band })),
  overrides: {},
  watchLimit: DEFAULT_WATCH_LIMIT,
};

export type MarketSort = 'ovr-desc' | 'ovr-asc' | 'price-desc' | 'price-asc';
export type OwnedSort = MarketSort | 'newest';

export const MARKET_SORTS: readonly { id: MarketSort; label: string }[] = [
  { id: 'ovr-desc', label: 'OVR↓' },
  { id: 'ovr-asc', label: 'OVR↑' },
  { id: 'price-desc', label: 'ราคา↓' },
  { id: 'price-asc', label: 'ราคา↑' },
];

export const OWNED_SORTS: readonly { id: OwnedSort; label: string }[] = [
  ...MARKET_SORTS,
  { id: 'newest', label: 'ล่าสุด' },
];
