# features/missions

ภารกิจรายวัน / รายสัปดาห์ — the screen behind the bottom-bar "ภารกิจ" button.

```
missions/
  types.ts                MissionConfig, MissionDef, MissionChest, MissionProgress
  constants.ts            storage key, limits, the metric list, defaults
  missions.ts             PURE — period clocks, recordMission(), claimMission(), claimChest()
  missionConfigStore.ts   the only file here that touches localStorage; normalizers
  MissionContext.tsx      MissionProvider, useMissions()
```

## Counting

The game counts actions per period (`MissionMetric`), not per mission: a mission is
an admin-set target on one of those counts. Every feature that does something
countable calls `useMissions().note(account, metric, amount)` inside its own
`updateAccount` mutator, so the action and its count are one save.

| metric | counted where |
| --- | --- |
| login | MissionProvider, once per day |
| manager-play / -win / -goal | ManagerContext, on a finished match (not a forfeit) |
| draft-pull | useDraftRun, one per card drawn |
| rankup-try / -success | RankUpScreen |
| league-play / -win | LeagueContext, fixtures resolved on catch-up |
| transfer-buy / -sell | TransferContext |
| shop-buy | ShopContext, in-game purchases |

Daily counts reset at `resetHour` (device time); weekly counts on Monday at the same
hour. `login` counts days, so a weekly login mission reads "เข้าเกม 5 วัน".

## Claiming

A finished mission is claimed by hand: rewards (any currency, or catalogue cards at
+0..+8 — the shop's reward shape and delivery) and its points in one save. Points
fill the period's chest track; each chest opens once its points are reached.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
