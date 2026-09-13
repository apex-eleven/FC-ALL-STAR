# features/draft

Draft events: the pool, the odds, the pity counters, and the pull.

```
draft/
  types.ts             events, players, sets, odds, pity rules, packs
  constants.ts         storage key, text limits, per-slot image budgets
  pull.ts              PURE draw logic — odds, pity, counters, showcase picks
  useDraftRun.ts       spend -> draw -> advance counters -> file in the club
  draftConfigStore.ts  the only file that touches localStorage
  DraftContext.tsx     DraftProvider, useDraft()
```

## Sets

Players are tiered `A` (best) to `D` (filler). `odds` are **relative weights, not
percentages**: they are normalised at pull time, so a tier with nobody in it drops
out of the roll instead of silently eating its share. That means an admin can empty
tier A without every pull in that slot vanishing.

## Pity

Two rules ship per event: `ชุด B` at 10 pulls and `ชุด A` at 70.

Every rule advances on every pull. Before the random roll, the **best** tier whose
counter has reached its threshold wins — a pull that would trigger both the A and B
guarantees pays the A one.

Landing a tier resets the counters for that tier **and every worse one**. Without
that, a lucky early A would still leave the player owed a B, which is not what "ชุด B
หรือสูงกว่า" means.

Counters live on the account, not the catalogue: two players in the same browser are
different distances from the same guarantee. `normalizeCounters` repairs them on read
— unknown rule ids dropped, missing ones zeroed, and anything past its threshold
clamped so a hand-edited record cannot hold a guarantee hostage.

Verified against the engine: with tier A weighted to zero, A lands on pulls 70, 140,
and 210 exactly, and B lands every tenth pull except where an A already reset it.

## Pulling

`useDraftRun().run(event, pack)` does the whole transaction as one account update:
spend, draw, advance counters, file the results in the club.

The pool is checked **before** the currency is spent. Refunding after a failed draw
would mean two ledger entries for something that never happened, and a pull that
cannot produce a card is a configuration error, not a transaction.

Results are committed before the reveal screen renders, so closing it early cannot
lose a card. That also means the walkout animation can replace `DraftResult` without
touching any of this.

## Showcase

The four cards on the banner are `showcasePlayers(pool, 4)` — the highest-rated
players actually in the pool. Editing the pool in the admin panel changes what the
screen advertises, which is the point: the banner cannot promise a player who is not
drawable.

## What an admin can change

Artwork tab: rail name, on-screen title, banner, thumbnail.
Rates tab: per-tier weights, both pity thresholds, and the pool itself (name, rating,
position, tier, add, remove).

The last player cannot be removed — an empty pool makes every pull fail, and a store
record that sanitises down to an empty pool is treated as no override at all.

**Editing a threshold does not reset anybody's counter.** Lowering `ชุด A` from 70 to
50 means a player already at 60 gets their guarantee on the next pull.

## Not done yet

The walkout reveal, duplicates handling, a club screen to browse what you own, and
any server authority over odds or results. Right now a player could edit
`localStorage` and hand themselves a tier A card — see `features/auth/README.md`.
