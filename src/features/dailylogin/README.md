# features/dailylogin

The daily login calendar (เข้าเกมรายวัน): one reward per day for showing up, on a
seven-tile loop or a calendar month.

```
dailylogin/
  types.ts                  DailyLoginConfig, LoginDay, DailyLoginProgress
  constants.ts              storage key, tiles per cycle, default reward tables
  dailylogin.ts             pure rules — cycleKeyFor, currentProgress, claimToday
  dailyloginConfigStore.ts  normalize/load/save config; normalizeProgress for accounts
  DailyLoginContext.tsx     provider + useDailyLogin(): progress, claim, auto-open
```

## Rules

- **A day is claimed once**, keyed by `YYYY-MM-DD` under the admin's reset hour —
  the same `dayKey` missions use, so "today" means the same thing on both screens.
- **Week cycle** is seven claims long, not seven calendar days. A missed day does not
  reset the count; the run starts over on the first claim after tile 7.
- **Month cycle** is the calendar month. Claims fill tiles in order, so a missed day
  leaves the last tiles out of reach until the month rolls over.
- **Rewards pay through `deliverRewards`** with reason `login`, the same
  all-or-nothing path as missions. A refused claim leaves the day open.
- **Auto-open** is a per-launch nudge tracked in memory, not storage: close it without
  claiming and it is back next launch, but not every time home is revisited.

The calendar is also reachable any time from the inbox screen's second tab.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
