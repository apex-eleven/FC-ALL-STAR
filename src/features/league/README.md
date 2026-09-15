# features/league

The daily league: a simulated 20-team table that settles at 06:00.

```
league/
  types.ts             LeagueConfig, LeagueState, LeagueRival, LeagueMatch
  constants.ts         storage key, defaults, invented rival names
  season.ts            PURE — season boundaries, match slots, seeded simulation
  standings.ts         PURE — advance(): replays fixtures, rolls the season over
  leagueConfigStore.ts the only file here that touches localStorage
  LeagueContext.tsx    LeagueProvider, useLeague()
```

## There is no timer

A match does not *happen* at 14:00; it is **derived** from 14:00 having passed.
`advance()` looks at the clock, sees which slots are due, and replays them in order.
Close the tab for eight hours and the eight fixtures resolve the moment you come
back — the alternative punishes players for not leaving a browser open.

The same idea covers the 06:00 settlement: the season rolls over when the app next
opens after the boundary, and the reward is credited in the same write that clears
the table, so a reload between the two cannot pay twice or lose the prize.

## Everything is seeded, nothing is random

`seeded(string)` is FNV-1a plus murmur3's avalanche step. The same account, season,
and slot always produce the same fixture, so reloading gets the day you already
played rather than a re-roll, and a restored save rebuilds the identical league.

The avalanche step is not decoration. FNV alone is uniform across millions of inputs
but clumpy across a handful of near-identical ones — which is exactly the input here,
the slot number ticking up. Measured over 400 sequential seeds it produced 0.75%
draws where 20% was expected; with the mixer, 20%.

## Every team plays every team — for real

A slot is not "the player's match plus some rival colour". It is one full round of a
proper round-robin (`season.roundRobin`, the circle method) over
`[PLAYER_TEAM_ID, ...rivals]`: every seat is paired with another seat, nobody plays
twice before everyone has played once, and an odd team count gives exactly one team a
bye per round, rotating fairly.

The fixture board (`LeagueScreen`) and the star simulation (`standings.advance`)
build that same schedule from the same seat order, so a pairing shown on screen is
never invented separately from the one that actually moved a team's stars — including
rival-versus-rival games, which used to be faked against a single "average rating"
opponent instead of an actual other team.

The cycle length is `teamCount - 1` rounds for an even team count, `teamCount` for an
odd one (the extra round is where each team's bye falls). A day usually has more
slots than that, so the schedule simply wraps and plays the same round-robin again.

Measured over a full day, tuned as shipped: a 95-rated squad finishes ~17th, 110
finishes ~7th, 125 finishes 1st.

## State lives on the account

`LeagueState` is a field on `Account`, like `draftProgress` — it saves and loads with
everything else, and per-account admin tools work through the normal `updateAccount`
path. Accounts created before the league existed have no field; the provider fills it
in on first open.
