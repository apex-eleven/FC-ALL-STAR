# features/transfers

The star-signing market (การเซ็นสัญญาดาวเด่น): buy catalogue cards with exchange
points, and exchange owned cards back for them.

```
transfers/
  types.ts                TransferConfig, PriceBand, CardPrice, TransferProgress
  constants.ts            storage key, default price ladder, sort options
  transferConfigStore.ts  the only file here that touches localStorage
  transfer.ts             PURE — prices, buy(), sell(), watch and lock toggles
  filter.ts               PURE — the search / filter dialog's matching rules
  TransferContext.tsx     TransferProvider, useTransfer()
```

## Prices

A price comes from the OVR band the card's base rating falls in, unless the admin
has set that card's own price. A price of 0 switches that direction off: not on
sale, or cannot be exchanged back. A card can also be hidden from the market without
losing its prices.

Selling is priced off the base rating — a rank-up bonus does not raise it, or the
rank-up screen would become a way to mint points.

## What cannot be sold

- a card in the lineup (starting eleven or bench)
- a card the player locked
- a card whose sell price is 0

`sell()` skips blocked cards rather than failing the batch, because a selection can
go stale between tapping and confirming.

## Per-account state

`Account.transfer` holds the watch list (catalogue ids) and the locks (owned-card
ids). Both load paths — local and Firestore — repair it, and a lock on a card that
is no longer owned is dropped on load.
