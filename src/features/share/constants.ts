import type { ShopReward } from '@/features/shop/types';

/** `eventId` tag on the wallet entries the share reward writes — provenance only. */
export const SHARE_EVENT_ID = 'share-team';

/** Hour of the day (local time) the once-a-day share reward becomes claimable again. */
export const SHARE_RESET_HOUR = 0;

/**
 * Fixed payout for sharing the team to Facebook, once per day: 20 กุญแจกาชาปอง,
 * 100 FC Point, 3,000 Gem. Not admin-configurable (yet) — change the amounts here
 * if that changes.
 */
export const SHARE_REWARDS: ShopReward[] = [
  { kind: 'key', amount: 20 },
  { kind: 'fcpoint', amount: 100 },
  { kind: 'gem', amount: 3_000 },
];

/** The link every share posts back to. */
export const SHARE_URL = 'https://fc-all-star.vercel.app/';
