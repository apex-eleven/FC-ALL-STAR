import type { RouteId } from '@/features/navigation/routes';
import type { ShopReward } from '@/features/shop/types';

/**
 * The inbox (กล่องจดหมาย).
 *
 * A mail is something an admin writes once and every eligible player finds waiting:
 * a compensation gift, an event notice, a welcome pack. It can carry attachments —
 * any reward the game has — which the player collects with one tap, paid through the
 * same all-or-nothing path as a shop purchase or a mission chest.
 *
 * Mails are admin config, shared read-only. What each player has opened, collected
 * and deleted is theirs, stored on the account as id lists. That split is why a mail
 * can reach an account created after it was sent: eligibility is computed on read,
 * not copied into every account at send time.
 */

export interface InboxMail {
  id: string;
  enabled: boolean;
  /** Login ID this mail is for. '' = everyone. Matched case-insensitively. */
  to: string;
  title: string;
  body: string;
  /** The sender line, e.g. "ทีมงาน FC ALL-STAR". */
  sender: string;
  /** Attachments. Empty for a plain notice. */
  rewards: ShopReward[];
  /** ISO. The mail shows up from this moment; set when the admin creates it. */
  sentAt: string;
  /** ISO or ''. Past this the mail — attachments included — is gone. */
  expiresAt: string;
  /** Screen the optional button opens. null = no button. */
  route: RouteId | null;
}

export interface InboxConfig {
  enabled: boolean;
  /** Screen heading. */
  title: string;
  mails: InboxMail[];
}

/** Stored on the account. Absent until the first mail is opened. */
export interface InboxProgress {
  /** Mail ids the player has opened. */
  read: string[];
  /** Mail id -> ISO time the attachments were collected. */
  claimed: Record<string, string>;
  /** Mail ids the player deleted. Kept so a deleted mail stays deleted. */
  deleted: string[];
}

export type InboxClaimError =
  | 'closed'
  | 'unknown'
  | 'empty'
  | 'claimed'
  | 'at-cap'
  | 'club-full'
  | 'card-missing';

/** A mail as the screen sees it: the config entry plus this account's state. */
export interface InboxEntry {
  mail: InboxMail;
  read: boolean;
  /** True when the mail has attachments not yet collected. */
  pending: boolean;
  /** ISO time the attachments were collected, or ''. */
  claimedAt: string;
}
