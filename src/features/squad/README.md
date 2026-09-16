# features/squad

The starting eleven and the bench.

```
squad/
  types.ts      Squad, Formation, FormationSlot, PlacementCheck
  constants.ts  4-3-3 slot coordinates, bench size, card size
  squad.ts      PURE logic — placement, swapping, auto-build, rating, repair
```

UI lives in `src/components/club/`. Dragging is `src/hooks/useCardDrag.ts`.

## Shape

```ts
interface Squad {
  formation: FormationId;
  starters: Record<SlotId, string | null>;  // owned card ids
  bench: (string | null)[];                 // fixed length 7
}
```

It stores **ids into the club, not copies of cards**. A card is one object; the squad
only says where it stands.

## Repair on read

`normalizeSquad` runs against the cards actually owned:

- A reference to a card no longer in the club becomes an empty slot. The club is
  capped and drops its oldest cards, so this is a normal outcome, not corruption.
- A card appearing more than once keeps its first placement. Without this, a
  hand-edited record could field the same player eleven times.
- An unknown formation falls back to the default rather than rendering no slots.

## The keeper rule

The brief asked that nothing but a GK can fill the GK slot. The reverse is enforced
too — a keeper cannot play outfield. Allowing it would let auto-build spend the only
keeper an account owns on the striker position and leave the net empty, which is the
exact failure the first rule exists to prevent.

Refusals surface twice: the slot outlines red while the card hovers it, and a message
names the rule if it is dropped anyway. Every other slot accepts any outfield player,
in or out of position.

## Auto-build

Two passes over the club, best rated first:

1. Each slot takes the highest rated player who **actually plays that position**.
2. Whatever is still empty takes the highest rated player left over.

Then the next seven fill the bench. The GK slot is skipped in both passes unless a
keeper is available, so an account with no keeper gets an empty net rather than a
striker in gloves.

Checked against the reference squad: the same pool produces OVR **125**, matching the
screenshot.

## Rating and value

`squadRating` averages the players **actually fielded**, skipping empty slots rather
than counting them as zero — a part-built squad showing a rating far below its own
players reads as a bug, not a warning.

`squadValue` is `rating⁴ / 10` summed over the eighteen. Steeply superlinear on
purpose: one great card should be worth more than several ordinary ones.

## Layout

The pitch is a photograph — `backgrounds/pitch-stadium.webp` — not CSS. Its source is
1848x851, the same 2.17:1 as the stage, so it maps 1:1 with no meaningful crop and the
geometry below stays valid.

**Slot coordinates are derived from that image, not chosen.** The touchlines were
measured after resampling and are straight:

```
left(y)  = 680  + (80   - 680)  * (y - 139) / 803
right(y) = 1390 + (1960 - 1390) * (y - 139) / 803
```

`touchlineLeft` / `touchlineRight` in `constants.ts` expose them, so a new formation
can be checked rather than eyeballed.

Two constraints follow:

- The pitch **narrows upward**, so a card's top edge is its tightest bound. Every slot
  is validated at that y, not at its centre.
- The left panel runs to x540, so no slot may start before x560 regardless of where
  the touchline is. Below y≈500 the touchline is further left than the panel, and the
  panel wins.

Vertical budget: the top touchline is at y139 and the bench begins at y856. Four rows
of card plus position tag have to fit in that 717px, which is what fixes the card at
**88x120** — not a style choice.

Depth is suggested by scale alone (0.88 forward, 0.94 midfield, 1.00 defence, 1.06
keeper). The reference renders its pitch in true 3D and its cards overlap by design;
copying those positions for flat cards produced a pile instead, so the rows here clear
each other outright.

Every slot carries an explicit `z-index` above the backdrop. An earlier version drew
the pitch as a decoration layer with no z-index on the slots, and the turf painted
over all eleven cards — only the ones poking out above it were visible.

## Dragging

`useCardDrag` is pointer-based, not HTML5 drag-and-drop, which does not fire on touch
at all. Drop targets opt in with `data-drop-kind` / `data-drop-id` and are resolved
with `elementFromPoint` on release, so slots can move or rescale without the hook
knowing the layout.

A press that never travels more than 4px is treated as a click, not a drag. The ghost
card is rendered in client pixels **outside** the scaled stage so it tracks the cursor
exactly at any stage scale.

Dropping outside every target removes the card from the squad — the whole screen is a
remove target sitting behind all the others.

## Not done yet

Other formations (`FORMATIONS` is a map, so adding one is data), the three crest slots
under the team value, chemistry, position ratings for out-of-position players, and
naming or saving multiple squads.

## Swap-screen stats (`stats.ts`)

The swap screen shows a six-stat radar and detail rows (WFA, stamina, skill moves,
height, weight, work rates, skill trait, acceleration, sprint speed). The catalogue
does not store any of these, so they are **derived**: a position profile scaled by the
upgraded OVR, plus a small variation seeded from the catalogue id. The same card always
shows the same numbers, and a rank-up raises them with its OVR. They are display only —
nothing in match or squad rating reads them.

`swapList.ts` holds the list's sort orders (best fit for the slot, OVR, tier, newest)
and filters (tier, club, nation, OVR range).
