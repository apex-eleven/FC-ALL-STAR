# features/manager

เมเนเจอร์โหมด — the screen behind the home "เล่น" card. One-off simulated matches
against other players' published elevens, a star ladder per season, and a weekly
win track that pays rewards.

```
manager/
  types.ts               ManagerConfig, ManagerTier, ManagerMilestone, ManagerState
  constants.ts           storage key, limits, image budgets, defaults
  manager.ts             PURE — season/week clocks, climb(), pickOpponent(), playManagerMatch()
  matchEngine.ts         PURE — the live match: 22 players and a ball, stepped on a fixed dt
  lineup.ts              squads, published elevens, and bot sides → engine lineups
  managerConfigStore.ts  the only file here that touches localStorage; normalizers
  outcomes.ts            the MatchOutcome list the normalizer checks against
  ManagerContext.tsx     ManagerProvider, useManager()
```

## A match

`pickOpponent` takes the nearest few published elevens by OVR (never the player's
own, never an empty one) and picks one by seed. No cloud, or nobody else published:
a generated side within `botSpread` of the player's rating, dressed in catalogue
cards that are not already playing for the home side.

The match is then **played live** (`matchEngine.ts`, drawn by `ManagerLiveMatch`):
both elevens on a 105 x 68 m pitch, positioned from their formation spots and moved
with the ball. The carrier decides every half-second or so to shoot, pass, or run;
tackles, interceptions, shots on target, and goals are rolled against the players'
own skills — the derived stats from `squad/stats.ts`, so a striker finishes better
than a centre-back and a card played out of position is weaker. Tired legs slow
players down over the match; substitutes come on fresh.

The manager can change tactic (attack: more goals both ways; defend: fewer, more
draws), make five substitutions, pause, and play at x1/x2/x4. `matchSeconds` sets
how long 90 minutes takes at x1. Measured over 200 simulated games between equal
sides: about 2.8 goals and 16 shots a game; a 25-OVR gap wins about 9 in 10.

### Leaving early

A ranked match writes `pending` to the account at kick-off, before a ball is kicked.
Full time settles it with the real score and clears it. Leaving through the button
settles it as a 0-3 forfeit; closing the tab leaves it pending, and the next load
settles it the same way — so quitting a losing game never keeps the stars. Unranked
matches record nothing until full time and cost nothing to leave.

(One page per account is assumed: a second tab would see the first tab's match as
abandoned.)

## Ladder

Ranked only. A win adds a star; filling the tier's last star moves up with none. A
loss takes a star; one taken at zero drops a tier unless the tier is a `floor`. Draws
change nothing. Unranked matches go into history and nothing else.

Seasons run back to back, `seasonDays` long, from `seasonAnchor` at `resetHour`. A
new season drops `seasonDrop` tiers per season missed and clears stars. There is no
timer: `currentState` works it out from the clock whenever it is read.

## Weekly track

Weeks start Monday at `resetHour`. Each milestone pays once when the week's ranked
wins reach it, in the same write as the match (`WalletReason` `'manager'`).

## Art

Background, centre figure, tier trophies, and banner slides are uploaded in the admin
tab and stored as data URLs in the shared settings document, so they count toward
its ~900 KB limit. Background and figure fall back to `public/brand/manager_background.jpg`
and `manager_figure.png`; a tier with no image draws its own trophy.
