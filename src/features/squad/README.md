# features/squad

The starting eleven and the bench.

```
squad/
  types.ts      Squad, Formation, FormationSlot, PlacementCheck
  constants.ts  every formation's slot coordinates + engine spots, bench size, card size
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

## Formations

28 of them (`FORMATION_LIST`), grouped by back line — four, three or five — and picked
from the formation button in the club panel (`components/club/FormationPicker`).

Each slot carries two positions: `x`/`y`/`scale` on the club stage, and `pitch`, the
spot the match engine stands that player on (metres from his own goal, metres from
the left touchline). The stage is a squeezed trapezoid beside a panel, so the two
cannot be derived from each other exactly; `pitchSpot` takes a depth per position and
the lane from the card's x. 4-3-3 Attack keeps the spots the engine was tuned on.

Three-line formations use the original rows (y199 / 375 / 559 / 749). Four-line ones
use a second grid (y186 / 334 / 430 / 590 / 760) with smaller cards up top and the two
midfield rows staggered. Every formation is checked for overlapping cards and for
cards outside the touchlines or under the panel.

Switching (`changeFormation`) keeps the eleven and arranges them for the highest total
effective rating in the new shape — an optimal assignment (Hungarian algorithm), not a
greedy pass, which drifted: a greedy switch that once parked a midfielder at right back
kept him there on every switch after. Ties go to the same slot id, then to the slot
nearest across the pitch, so switching away and back returns the squad as it was.

The engine plays whatever formation the squad is in; a published leaderboard eleven
plays in the formation it was published in, and an unknown one falls back to 4-3-3
Attack. Bots still line up in 4-3-3 Attack, exactly as before.

## Not done yet

Chemistry, and naming or saving multiple squads.

## Swap-screen stats (`stats.ts`)

The swap screen shows a six-stat radar and detail rows (WFA, stamina, skill moves,
height, weight, work rates, skill trait, acceleration, sprint speed). The catalogue
does not store any of these, so they are **derived**: a position profile scaled by the
upgraded OVR, plus a small variation seeded from the catalogue id. The same card always
shows the same numbers, and a rank-up raises them with its OVR. They are display only —
nothing in match or squad rating reads them.

`swapList.ts` holds the list's sort orders (best fit for the slot, OVR, tier, newest)
and filters (tier, club, nation, OVR range).
