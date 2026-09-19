# features/badges

Team crests (ตราทีม): admin-made player sets with an OVR bonus, pinned three at a
time under the OVR shield on the club screen.

```
badges/
  types.ts             TeamBadge, BadgeConfig, BadgeStatus
  constants.ts         storage key, caps, image budget
  badges.ts            pure rules — statusOf, equipped, bonusOf, teamRating, equip
  badgeConfigStore.ts  normalize/load/save config
  BadgeContext.tsx     provider + useBadges(): ratingOf / bonusOf / slotsOf
```

## Rules

- **Crests are config, the pins are an arrangement.** `squad.badges` holds three ids;
  `equipped()` resolves them against the live config on every read, so a crest the
  admin deletes or disables simply reads as an empty slot.
- **Active = enough of the set on the pitch.** Only the starting eleven counts,
  matched by catalogue id (`OwnedPlayer.playerId`), so any rank-up level qualifies.
  `need` = 0 means the whole set.
- **One rating everywhere.** `teamRating` = `squadRating` + active bonuses. The home
  tile, club panel, league and manager mode all read it through `useBadges().ratingOf`,
  never `squadRating` directly.
- **Empty squad stays 0.** A bonus never puts a number on a club with nobody fielded.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
