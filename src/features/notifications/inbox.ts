import type { Account } from '@/features/auth/types';
import type { OwnedPlayer } from '@/features/club/types';
import { deliverRewards, type CardLookup, type ShopStamp } from '@/features/shop/shop';
import type { ShopReward } from '@/features/shop/types';
import { INBOX_EVENT_ID, MAX_PROGRESS_IDS } from './constants';
import type { InboxClaimError, InboxConfig, InboxEntry, InboxMail, InboxProgress } from './types';

/**
 * Pure inbox rules. No storage, no React — every function that changes an account
 * takes one and returns a new one, and the caller fixes the clock and the card
 * stamp before `updateAccount`, so a mutator that runs twice lands on the same
 * cards with the same ids.
 */

export function emptyProgress(): InboxProgress {
  return { read: [], claimed: {}, deleted: [] };
}

export function progressOf(account: Pick<Account, 'inbox'>): InboxProgress {
  return account.inbox ?? emptyProgress();
}

/** Newest id last; the oldest fall off once the list is full. */
function pushId(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return [...ids];
  return [...ids, id].slice(-MAX_PROGRESS_IDS);
}

/** Whether a mail is addressed to this account. */
export function addressedTo(mail: InboxMail, username: string): boolean {
  if (mail.to === '') return true;
  return mail.to.toLowerCase() === username.toLowerCase();
}

/** Whether a mail is inside its delivery window. */
export function isLive(mail: InboxMail, now: Date): boolean {
  if (!mail.enabled) return false;
  if (mail.sentAt && now.getTime() < Date.parse(mail.sentAt)) return false;
  if (mail.expiresAt && now.getTime() > Date.parse(mail.expiresAt)) return false;
  return true;
}

/**
 * The mails this account sees right now, newest first.
 *
 * Deleted mails are gone whatever the config says; everything else is decided by
 * the mail itself, so an admin disabling one pulls it from every inbox at once.
 */
export function entriesFor(
  config: InboxConfig,
  account: Pick<Account, 'username' | 'inbox'>,
  now: Date,
): InboxEntry[] {
  if (!config.enabled) return [];
  const progress = progressOf(account);
  return config.mails
    .filter((mail) => isLive(mail, now) && addressedTo(mail, account.username))
    .filter((mail) => !progress.deleted.includes(mail.id))
    .map((mail) => {
      const claimedAt = progress.claimed[mail.id] ?? '';
      return {
        mail,
        read: progress.read.includes(mail.id),
        pending: mail.rewards.length > 0 && claimedAt === '',
        claimedAt,
      };
    })
    .sort((a, b) => b.mail.sentAt.localeCompare(a.mail.sentAt));
}

/** Mails that still want attention: unread, or with attachments waiting. */
export function attentionCount(entries: readonly InboxEntry[]): number {
  return entries.filter((entry) => !entry.read || entry.pending).length;
}

/** Marks a mail opened. Same account back when it already was. */
export function markRead(account: Account, mailId: string): Account {
  const progress = progressOf(account);
  if (progress.read.includes(mailId)) return account;
  return { ...account, inbox: { ...progress, read: pushId(progress.read, mailId) } };
}

/**
 * Deletes a mail from this account's view.
 *
 * Refused while attachments are waiting — a player who taps delete by mistake must
 * not lose a gift. The screen only offers delete on collected or plain mails.
 */
export function removeMail(account: Account, config: InboxConfig, mailId: string, now: Date): Account {
  const progress = progressOf(account);
  if (progress.deleted.includes(mailId)) return account;
  const mail = config.mails.find((entry) => entry.id === mailId);
  if (mail && isLive(mail, now) && mail.rewards.length > 0 && !progress.claimed[mailId]) return account;
  return {
    ...account,
    inbox: {
      ...progress,
      read: pushId(progress.read, mailId),
      deleted: pushId(progress.deleted, mailId),
    },
  };
}

export interface InboxClaimOutcome {
  ok: boolean;
  error: InboxClaimError | null;
  account: Account;
  rewards: ShopReward[];
  cards: OwnedPlayer[];
}

function failed(account: Account, error: InboxClaimError): InboxClaimOutcome {
  return { ok: false, error, account, rewards: [], cards: [] };
}

/**
 * Collects one mail's attachments: pays them and files the claim — one new account,
 * so a mail can never be marked collected without paying, or pay twice.
 *
 * The all-or-nothing rules come from `deliverRewards`: a wallet at its cap, a full
 * club or a card the admin has since deleted refuses the whole mail, which stays
 * pending so the player can try again once there is room.
 */
export function claimMail(
  account: Account,
  config: InboxConfig,
  mailId: string,
  now: Date,
  lookup: CardLookup,
  stamp: ShopStamp,
): InboxClaimOutcome {
  if (!config.enabled) return failed(account, 'closed');
  const mail = config.mails.find((entry) => entry.id === mailId);
  if (!mail || !isLive(mail, now) || !addressedTo(mail, account.username)) {
    return failed(account, 'unknown');
  }
  const progress = progressOf(account);
  if (progress.deleted.includes(mailId)) return failed(account, 'unknown');
  if (mail.rewards.length === 0) return failed(account, 'empty');
  if (progress.claimed[mailId]) return failed(account, 'claimed');

  const paid = deliverRewards(account, mail.rewards, lookup, stamp, 'inbox', INBOX_EVENT_ID);
  if (!paid.ok) return failed(account, paid.error);

  return {
    ok: true,
    error: null,
    rewards: [...mail.rewards],
    cards: paid.cards,
    account: {
      ...paid.account,
      inbox: {
        ...progress,
        read: pushId(progress.read, mailId),
        claimed: { ...progress.claimed, [mailId]: now.toISOString() },
      },
    },
  };
}

export interface InboxClaimAllOutcome {
  account: Account;
  /** Ids collected, in order. */
  claimed: string[];
  /** Everything paid across those mails. */
  rewards: ShopReward[];
  cards: OwnedPlayer[];
  /** The first refusal, if one stopped the run short. */
  error: InboxClaimError | null;
}

/**
 * Collects every pending mail, oldest first, stopping at the first refusal.
 *
 * Oldest first so a mail nearest to expiring is paid before anything blocks the
 * rest. What was collected before a refusal stays collected — stopping is about not
 * skipping a mail silently, not about undoing the ones that went through.
 */
export function claimAll(
  account: Account,
  config: InboxConfig,
  now: Date,
  lookup: CardLookup,
  stamp: ShopStamp,
): InboxClaimAllOutcome {
  const pending = entriesFor(config, account, now)
    .filter((entry) => entry.pending)
    .reverse();

  let current = account;
  const claimed: string[] = [];
  const rewards: ShopReward[] = [];
  const cards: OwnedPlayer[] = [];

  for (const [index, entry] of pending.entries()) {
    // One stamp per mail: card ids are numbered off the seed, so two mails sharing a
    // seed would hand out the same ids twice.
    const outcome = claimMail(current, config, entry.mail.id, now, lookup, {
      seed: `${stamp.seed}-${index}`,
      at: stamp.at,
    });
    if (!outcome.ok) return { account: current, claimed, rewards, cards, error: outcome.error };
    current = outcome.account;
    claimed.push(entry.mail.id);
    rewards.push(...outcome.rewards);
    cards.push(...outcome.cards);
  }

  return { account: current, claimed, rewards, cards, error: null };
}

/** Deletes every mail that is read and has nothing left to collect. */
export function removeRead(account: Account, config: InboxConfig, now: Date): Account {
  let current = account;
  for (const entry of entriesFor(config, account, now)) {
    if (entry.read && !entry.pending) current = removeMail(current, config, entry.mail.id, now);
  }
  return current;
}
