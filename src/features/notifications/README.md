# features/notifications

The inbox (กล่องจดหมาย): mail an admin sends to everyone or to one login ID, with
optional attachments the player collects with one tap.

```
notifications/
  types.ts             InboxMail, InboxConfig, InboxProgress, InboxEntry
  constants.ts         storage key, size caps, defaultInbox()
  inbox.ts             pure rules — entriesFor, claimMail, claimAll, removeMail
  inboxConfigStore.ts  normalize/load/save config; normalizeProgress for accounts
  InboxContext.tsx     provider + useInbox(): entries, attention count, actions
```

## How it fits

- **Mails are config, state is per account.** The mail list lives under
  `football-home-ui:inbox:v1` and rides the backup/cloud snapshot like every other
  admin setting. What a player has opened, collected and deleted is three id lists on
  `account.inbox`. Eligibility is computed on read, so a mail reaches accounts made
  after it was sent, and disabling a mail pulls it from every inbox at once.
- **Attachments pay through `deliverRewards`** with reason `inbox`, the same
  all-or-nothing path as missions and redeem codes. A refused mail stays pending.
- **Delete never loses a gift.** `removeMail` refuses while attachments are waiting;
  the screen only offers delete on collected or plain mails.
- **The badge** on the top-bar mail icon is `attention`: unread mails plus mails with
  attachments waiting.

## Extension point

System-generated mail (league season rewards, compensation for a failed pull) is not
wired yet. When it is, give the account a `local: InboxMail[]` list beside the id
lists and merge it into `entriesFor` — the claim path does not care where a mail came
from, only that it has an id and a reward list.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
