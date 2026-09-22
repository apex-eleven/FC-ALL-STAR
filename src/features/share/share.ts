import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { dayKeyAt } from '@/lib/dayKey';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { SHARE_EVENT_ID, SHARE_REWARDS, SHARE_RESET_HOUR, SHARE_URL } from './constants';
import type { ShareClaimError, ShareProgress } from './types';

/**
 * Pure share-reward rules. Nothing here touches React, storage, or the browser's
 * share dialog — every function that changes an account takes one and returns a
 * new one, same as the daily login calendar and the shop.
 */

/** Today's key, counting a day as starting at the reset hour. */
export function todayKey(now: Date): string {
  return dayKeyAt(now, SHARE_RESET_HOUR);
}

export function claimedToday(progress: ShareProgress | undefined, today: string): boolean {
  return progress?.lastClaimDay === today;
}

/** Repairs progress read from storage — the same job normalizeWallet does for a wallet. */
export function normalizeShareProgress(value: unknown): ShareProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<ShareProgress>;
  return typeof raw.lastClaimDay === 'string' ? { lastClaimDay: raw.lastClaimDay } : undefined;
}

/** Whether pressing the share button right now would still pay a reward. */
export function canClaimShare(progress: ShareProgress | undefined, today: string): boolean {
  return !claimedToday(progress, today);
}

export interface ShareClaimOutcome {
  ok: boolean;
  error: ShareClaimError | null;
  account: Account;
  rewards: ShopReward[];
  cards: OwnedPlayer[];
}

function failed(account: Account, error: ShareClaimError): ShareClaimOutcome {
  return { ok: false, error, account, rewards: [], cards: [] };
}

/**
 * Pays today's share reward once and files the day — one new account, so mashing
 * the share button cannot pay twice in the same day.
 *
 * All-or-nothing, like every other reward line: a wallet at its cap refuses the
 * claim and the day stays open so the player can try again once there is room.
 */
export function claimShare(
  account: Account,
  now: Date,
  lookup: CardLookup,
  stamp: ShopStamp,
): ShareClaimOutcome {
  const today = todayKey(now);
  if (claimedToday(account.share, today)) return failed(account, 'claimed');

  const paid = deliverRewards(account, SHARE_REWARDS, lookup, stamp, 'share', SHARE_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error);

  return {
    ok: true,
    error: null,
    rewards: [...SHARE_REWARDS],
    cards: paid.cards,
    account: { ...paid.account, share: { lastClaimDay: today } },
  };
}

export interface ShareTeamSummary {
  teamName: string;
  rating: number;
  formationName: string;
  /** The starting eleven, in whatever order the formation lists its slots. */
  starters: { name: string; rating: number; position: string }[];
}

/** The post text dropped into the Facebook share dialog. */
export function shareText(summary: ShareTeamSummary): string {
  const lineup =
    summary.starters.length > 0
      ? summary.starters.map((player) => `${player.name} (${player.rating})`).join(', ')
      : 'ยังไม่ได้จัดตัวจริง';

  return [
    `ทีม "${summary.teamName}" ของฉันใน FC ALL-STAR!`,
    `เรตติ้งทีม ${summary.rating} OVR · สูตร ${summary.formationName}`,
    `ตัวจริง: ${lineup}`,
    `มาลองเล่นกันได้ที่ ${SHARE_URL}`,
  ].join('\n');
}

/** The Facebook share-dialog URL for this post text, linking back to the game. */
export function facebookShareUrl(text: string): string {
  const params = new URLSearchParams({ u: SHARE_URL, quote: text });
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}
