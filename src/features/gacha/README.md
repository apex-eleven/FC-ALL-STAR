# features/gacha

กาชาปอง — a prize roulette behind the home rail's "กิจกรรม" tile.

```
gacha/
  types.ts             GachaConfig, GachaPrize, GachaWin, GachaState, GachaError
  constants.ts         storage key, limits, rarity labels and colours, defaults
  gacha.ts             PURE — prizeFor(), percentOf(), spin()
  gachaConfigStore.ts  the only file here that touches localStorage; normalizers
  GachaContext.tsx     GachaProvider, useGacha()
```

## A spin

One spin costs `keyCost` keys (the `key` currency — admins hand them out from the
wallet tab; nothing sells them yet), rolls one prize, and pays it. Charge, payout and
the filed win are one new account, so a spin can never take a key without paying or
pay without taking one: `spin()` returns the untouched account on any failure
(`no-keys`, `at-cap`, `club-full`, `card-missing`, `closed`, `empty`).

The roll, the clock, the win id and the payout stamp are fixed by the caller before
`updateAccount`, because that mutator may run twice — both runs have to land on the
same prize and file the same win. The prize's display name is resolved by the caller
too: the names live in the catalogues the screen reads, not here.

## Several at once

หมุน 5 / 10 ครั้ง is `spinMany`: the same spin applied to the account each previous
one returned, so a batch charges and pays exactly what pressing the button that many
times would. It stops at the first spin that cannot go through — no keys left, a
wallet at its cap, a club with no room — and keeps everything up to that point, with
`error` saying what stopped it. Each spin gets its own stamp derived from the batch's,
because cards are numbered from the seed and sharing one would hand two cards the
same id.

The screen runs the reel once for the whole batch, stopping on the rarest prize won,
and lays the rest out in a panel afterwards: ten runs of the strip would be nearly a
minute of watching.

## Prizes and odds

A prize is one reward line in the shop's shape — any currency, a catalogue card at
+0..+8, or a bag item — plus a relative weight, a rarity band, and an announce flag.

Weights do not have to add to 100. The real chance is the weight over the sum of the
live weights (`percentOf`), and the admin panel shows it beside every row: a list
adding to 137 reads honestly instead of being silently rescaled. Weight 0 or disabled
means the prize never comes out; an empty wheel refuses the spin rather than paying
nothing.

## The reel

Decoration. The prize is decided, paid and filed before the strip starts moving, so
closing the screen mid-spin cannot lose it. The strip is the prize list shuffled and
repeated — not rolled against the odds, which clumps — with the real prize written
into the card that stops under the frame.

## Winners feed

Prizes marked `announce` are published to the `gachaFeed` collection in Firestore
(`features/cloud/cloudGachaFeed.ts`) and read back by everyone. The rule is
append-only for the signed-in author, so a row is a claim about a spin and nothing
more: it grants nothing, and a faked one costs its author nothing but a line in a
list. With no Firebase the feed is simply empty.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
