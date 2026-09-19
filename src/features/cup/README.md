# features/cup

ฟุตบอลถ้วย — knockout cups, in place of the daily league.

```
cup/
  types.ts           CupConfig, CupCompetition, CupRun, CupTie, CupState
  constants.ts       storage key, sizes, round names, defaults, forfeit score
  bracket.ts         PURE — seeding, the empty board, where a winner goes next
  cup.ts             PURE — window clocks, buildRun(), playRound(), rewards
  play.ts            PURE — enterCup() and playCupRound(): everything touching an Account
  cupConfigStore.ts  the only file here that touches localStorage; normalizers
  CupContext.tsx     CupProvider, useCup()
```

## Why the league went

A league is a table that never ends. It resolved itself in the background, the
player's own fixtures were indistinguishable from the other nineteen, and the day it
finished looked exactly like the day before it. Nothing was ever at stake in a
single match, so there was never a reason to watch one.

A cup has an entry, a bracket and a final. You are in it or you are out, and a run
ends in a trophy or in nothing.

## Two competitions

| | ถ้วยรายวัน | ถ้วยใหญ่สุดสัปดาห์ |
| --- | --- | --- |
| bracket | 8 teams | 16 teams |
| wins to lift it | 3 | 4 |
| window | every day, from `resetHour` | Fri–Sun, as **one** window |
| entries | 3 a day | 2 a weekend |

A window is a stretch of consecutive open days, not a day: entries bought on Friday
are still there on Sunday, and a run started on Saturday survives the night.
`windowStart` finds it by walking back over open days, capped at a week so a
competition set to all seven cannot walk backwards forever.

## Nothing happens on a clock

The league derived its fixtures from time having passed. A cup round happens because
the player pressed a button — which is the whole difference. The only thing the
clock decides is which window is open and when the entry count resets, and both are
read when somebody looks rather than ticked.

## The draw

Real published elevens first, nearest in OVR (the same `leaderboard` collection
manager mode draws from), with generated sides padding out whatever is left. Seats
are then handed out by rating, strongest first, so the seeding means something: a
player seeded low meets a top seed early, and the top two seeds can only meet in the
final. `seedOrder` builds that by doubling — every seat is followed by its mirror.

The whole board exists from the moment of the draw, with later ties waiting on seat
`-1`. A bracket that grew a column at a time would not show the player what they are
playing towards, which is the only reason to draw one.

## Two ways a tie is played

Simulated outright, or watched with the real match engine — the player picks per
tie. Either way the other ties in that round are simulated, so the round resolves as
one thing.

`playRound` takes an optional `result`, exactly as `playManagerMatch` does: supplied,
the engine decided it; absent, `playTie` did. A watched tie that ends level goes to
penalties by the same rule an unwatched one does, because watching a match must not
change what kind of result it is allowed to have.

Once the player is out, the rest of the bracket plays through to its final anyway.
Somebody wins this cup whether or not the player is still in it, and "ตกรอบ" with no
idea who lifted it is a worse ending than losing to the eventual champion and being
told so.

## The upset is the point

`playTie` is **not** `playMatch` with the draw removed, which is what it was first
written as. `playMatch` saturates at a 0.85 win chance and then spends a flat 0.2 on
draws, which leaves a side 25 or more points clear with a loss chance of exactly
zero — measured over 2,000 ties, a +30 favourite went through 94.5% of the time and
could not be beaten in normal time at all. In a table that hardly shows. In a cup it
removes the only thing a cup is for.

Ties now use their own curve (`tieOdds` in `features/sim`): the draw takes a fixed
0.22, the rest splits by rating with a 0.12 floor under the underdog. Measured over
2,000 ties, a +30 favourite goes through 83% of the time and loses inside 90 minutes
about 1 time in 10. `playMatch` was left alone — manager mode's numbers were measured
against it.

## Rewards

Keyed by **wins**, not by round index, so an admin changing the bracket size cannot
shift a reward onto a different round mid-run. `run.claimed` holds the same win
numbers, which is what stops a reload from paying a round twice.

The bracket and the payout are one write (`playCupRound`). A player who closed the
tab between the two would otherwise come back to a round they had won and no prize,
which is indistinguishable from a prize already taken.

A payout there is no room for — a full club, a wallet at its cap — refuses **the
payout**, not the round: the tie is still played and filed, and the reward stays
unclaimed so the next round or the admin can pay it. Losing a bracket because the
club was full would be a far worse trade than a late prize.

## Leaving a watched tie

Settles as a 0-3 loss. The entry is spent and the draw is made, so quitting has to
settle the tie — otherwise closing the tab at 0-1 would be a free retry.

## Repair on read

`normalizeProgress` drops a run whose shape disagrees with itself: seats pointing
outside the team list, a board with the wrong number of rounds, no seat marked as the
player's. A patched bracket is a bracket nobody drew, and the entry it cost is spent
either way — losing it beats playing a run that cannot resolve.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
