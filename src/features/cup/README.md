# features/cup

ฟุตบอลถ้วย — knockout cups, in place of the daily league.

```
cup/
  types.ts           CupConfig, CupCompetition, CupRun, CupTie, CupState, statuses
  constants.ts       storage key, sizes, round names, defaults, forfeit score, isTitleBand
  bracket.ts         PURE — seeding, the empty board, where a winner goes next
  cup.ts             PURE — window clocks, buildRun(), playRound(), tieStatus(), rewards
  play.ts            PURE — enterCup(), kickOffTie(), playCupRound(), claimCupReward()
  cupShop.ts         PURE — ร้าน Cup Token: shopItems(), remainingOf(), buyCupShopItem()
  cupConfigStore.ts  the only file here that touches localStorage; normalizers
  CupContext.tsx     CupProvider, useCup() — the tournament layer the screen talks to
```

## The flow

```
NEW CUP ─▶ enterCup      charge the entry, draw the bracket          run: running
PLAY MATCH ─▶ kickOffTie write `pending` before a ball is kicked
          ─▶ ManagerLiveMatch + MatchEngine (manager mode's, unchanged)
          ─▶ playCupRound(live score)      or   จำลองผล ─▶ playCupRound(simulate)
             win  → next round AVAILABLE, round reward paid   run: running
             loss → bracket plays out to a champion           run: out
             final won → title reward held                    run: champion
CLAIM REWARD ─▶ claimCupReward  pays the title band           run: completed
NEW CUP ─▶ … a new run; the old one is never reset by itself
```

`CupRun.status` is the source of truth. The screen reads it and `tieStatus()` (LOCKED /
AVAILABLE / LIVE / WON / ELIMINATED on the player's road) and decides nothing itself.

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

A round happens because the player pressed PLAY MATCH or จำลองผล. The clock only
decides which window is open and when the entry count resets, and both are read when
somebody looks rather than ticked.

(Until STEP 1 of the cup rework, rounds played themselves at fixed kickoff times —
round one the moment you entered, the rest two or three hours apart — so the player
never actually played a tie. That scheduler, `kickoffs` on the run and the admin's
`roundGapMinutes` are gone; old saves and settings are read without them.)

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

PLAY MATCH watches it in manager mode's live engine (`ManagerLiveMatch`, fed a
`LiveMatch` built in `CupContext.kickOff`). จำลองผล decides it with `playTie`, the
quick simulation. Either way the other ties in that round are simulated, so the round
resolves as one thing. Both are seeded off the run id and round, so they are the same
fixture.

A watched tie that ends level goes to penalties by the same rule an unwatched one does
(`shootoutFor`), because watching a match must not change what kind of result it is
allowed to have. A live score that arrives malformed is not a retry either: it falls
back to the quick simulation.

Once the player is out, the rest of the bracket plays through to its final anyway.
Somebody wins this cup whether or not the player is still in it, and "ตกรอบ" with no
idea who lifted it is a worse ending than losing to the eventual champion and being
told so.

## Double presses

Every play call names the run and round it is for (`RoundRef`). A replayed mutator, or a
second tap that lands after the first already moved the bracket on, finds a different
round and is refused as `stale` instead of playing the next tie by mistake. Claiming
is idempotent the same way: the run is `completed` in the same write that pays it.

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
numbers, which is what stops a reload from paying a band twice.

Every band short of the title is paid in the same write as the tie that earned it,
through `deliverRewards` (reason `'cup'`) like every other payout in the game. The
title band — `wins === roundCount(run.size)` — is held until CLAIM REWARD.

A payout there is no room for — a full club, a wallet at its cap — refuses **the
payout**, not the round: the tie is still played and filed, and the band stays
unclaimed. The champion claim pays everything still owed, so nothing is lost.

### Cup Token

Each band also carries `tokens`, added to `CupState.tokens`. It is a counter on the cup
state, not a seventh wallet currency — earned in one place, spent in one place.
Settings saved before tokens existed take the default amount for the same win count;
an explicit 0 stays 0.

## ร้าน Cup Token

`config.shop` — items with one price in Cup Token, a reward list in the shop's own
`ShopReward` shape, and a limit (`daily` on the cup's `resetHour`, or `lifetime`).
Opened from the token balance on the cup screen; edited in ADMIN → ฟุตบอลถ้วย → ร้าน
Cup Token.

`buyCupShopItem` checks the shop, the item, the limit and the balance, then hands
the rewards over through `deliverRewards` (which checks club space and wallet caps
before crediting anything), and only then takes the tokens — all in one returned
account, so nothing is ever refunded. Purchase counts live in `CupState.shop`, keyed by
item id. Items carry no uploaded art: the card draws itself from its first reward, so
the shop adds nothing to the shared settings document's size budget. Settings saved
before the shop existed get the default five items.

## Leaving a watched tie

Settles as a 0-3 loss, the same as a ranked manager match. `pending` is written at
kick-off; the leave button settles it, and a pending tie found on load that this page
did not start (tab closed, refresh mid-match) is settled the same way. Otherwise
closing the tab at 0-1 would be a free retry. A forfeit counts toward no mission.

## Windows and unfinished runs

At the window roll the entry count resets and a finished run (`out`, `completed`) is
cleared. A `running` run, or a `champion` one with the title unclaimed, is kept: the
entry is paid for, and a cup must not vanish because the player came back the next day.

## Repair on read

Both account stores run `normalizeProgress` on load. It drops a run whose shape
disagrees with itself: seats pointing outside the team list, a board with the wrong
number of rounds or ties, no seat marked as the player's, a running run with no round
left. A patched bracket is a bracket nobody drew, and the entry it cost is spent either
way — losing it beats playing a run that cannot resolve. A `pending` that is not the
current round is cleared.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
