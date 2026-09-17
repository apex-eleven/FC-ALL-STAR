# features/starpass

Star Pass — a season-long reward track behind the home rail's "STAR PASS" tile.

```
starpass/
  types.ts                StarPassConfig, StarPassLevel, StarPassProgress
  constants.ts            storage key, limits, defaults
  starpass.ts             PURE — levels, addXp(), claimLevel(), claimAll(), buyPremium()
  starpassConfigStore.ts  the only file here that touches localStorage; normalizers
  StarPassContext.tsx     StarPassProvider, useStarPass()
```

## Season

The pass follows the manager-mode season (`manager.seasonIndex`): when the ladder
restarts, so does the pass — XP, claims, and the premium unlock. Progress saved
under another season number is read as a fresh pass.

## XP

| source | XP |
| --- | --- |
| a claimed mission | its points × `missionRate` / 100 |
| a finished manager match | `matchWin` / `matchDraw` / `matchLoss` (forfeits: nothing) |

Every `xpPerLevel` XP reaches the next level, up to the number of levels set.

## Rewards

Each level has a free and a premium reward list (currencies, or catalogue cards at
+0..+8 — the shop's reward shape and delivery). A reached level is claimed by hand,
one cell at a time or all at once. Premium cells unlock once the premium track is
bought with gems or FC points, or granted by an admin — and a late unlock can claim
every premium reward already passed.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
