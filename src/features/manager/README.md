# features/manager

เมเนเจอร์โหมด — the screen behind the home "เล่น" card. One-off simulated matches
against other players' published elevens, a star ladder per season, and a weekly
win track that pays rewards.

```
manager/
  types.ts               ManagerConfig, ManagerTier, ManagerMilestone, ManagerState
  constants.ts           storage key, limits, image budgets, defaults
  manager.ts             PURE — season/week clocks, climb(), pickOpponent(), playManagerMatch()
  managerConfigStore.ts  the only file here that touches localStorage; normalizers
  outcomes.ts            the MatchOutcome list the normalizer checks against
  ManagerContext.tsx     ManagerProvider, useManager()
```

## A match

`pickOpponent` takes the nearest few published elevens by OVR (never the player's
own, never an empty one) and picks one by seed. No cloud, or nobody else published:
a generated side within `botSpread` of the player's rating.

The result comes from the league's `playMatch` / `scoreFor`, seeded by the match id.
The context fixes the id, clock, and opponent before `updateAccount`, so a mutator
that runs twice plays the same game — and the match is saved before the screen
reveals it.

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
