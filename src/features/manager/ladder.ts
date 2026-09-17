import type { ManagerLadderRow } from '@/features/cloud/cloudManagerLadder';
import { currentState } from './manager';
import type { ManagerConfig, ManagerTier } from './types';

/** A ladder row as shown: the rank brought up to date with the current season. */
export interface LadderView {
  uid: string;
  username: string;
  avatarId: string;
  rating: number;
  tierIndex: number;
  tier: ManagerTier | undefined;
  stars: number;
}

/**
 * Orders published ranks the way the game would today.
 *
 * A row published last season still carries last season's tier; it is dropped by the
 * same rule an account's own ladder uses before it is compared. A tier the admin has
 * since moved is found by id; one since deleted falls back to the stored position.
 */
export function resolveLadder(
  rows: readonly ManagerLadderRow[],
  config: ManagerConfig,
  now: Date,
): LadderView[] {
  const top = config.tiers.length - 1;
  return rows
    .map((row) => {
      const byId = config.tiers.findIndex((tier) => tier.id === row.tierId);
      const index = byId >= 0 ? byId : Math.min(row.tier, top);
      const state = currentState(
        {
          season: row.season,
          tier: index,
          stars: row.stars,
          week: '',
          weekWins: 0,
          claimed: [],
          played: 0,
          history: [],
        },
        config,
        now,
      );
      return {
        uid: row.uid,
        username: row.username,
        avatarId: row.avatarId,
        rating: row.rating,
        tierIndex: state.tier,
        tier: config.tiers[state.tier],
        stars: state.stars,
        updatedAt: row.updatedAt,
      };
    })
    .sort(
      (a, b) =>
        b.tierIndex - a.tierIndex ||
        b.stars - a.stars ||
        // Level on rank: whoever got there first stays ahead.
        a.updatedAt.localeCompare(b.updatedAt),
    )
    .map(({ updatedAt: _updatedAt, ...view }) => view);
}
