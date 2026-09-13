# features/club

Where drafted cards are kept.

```
club/
  types.ts      OwnedPlayer, Club
  constants.ts  capacity, squad size
  club.ts       PURE helpers — add, normalise, rate
```

## Owned cards are snapshots

`OwnedPlayer` copies the name, rating, position, tier, and portrait at the moment of
the pull rather than referencing the draft pool. An admin can rename, retune, or
delete a pool entry, and a card somebody already pulled must not change or vanish
because of it. `playerId` and `eventId` are kept for provenance, not for lookup.

## Capacity

`CLUB_CAPACITY` is 300, oldest dropped first. The club lives in `localStorage`
alongside everything else, and an unbounded list would eventually take the storage
quota down with it — which would break the account, not just the club.

## Rating

`clubRating()` averages the best eleven, rounded. A club with fewer than eleven cards
averages what it has rather than padding with zeroes, which would make a strong new
account look worse than an empty one. The home screen's CLUB card shows this, falling
back to the catalogue number while the club is empty.

## Not done yet

A club screen, squad selection, duplicates, selling, and anything that makes the
collection do something other than exist.
