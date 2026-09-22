/**
 * The "share team" button on the club screen (ปุ่มแชร์ทีม).
 *
 * One flat reward for sharing the team to Facebook, at most once per day. Unlike
 * the daily login calendar this has no tiles or streak — just today's yes/no.
 */

/** Stored on the account. Absent until the first share. */
export interface ShareProgress {
  /** Day key (YYYY-MM-DD) the reward was last paid — see lib/dayKey. */
  lastClaimDay: string;
}

export type ShareClaimError = 'claimed' | 'at-cap' | 'club-full' | 'card-missing';
