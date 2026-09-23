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
  matched by player: the exact catalogue id (`OwnedPlayer.playerId`), the same
  player name (the rule the squad uses for duplicates), or the same card art file.
  Any rank-up level and any catalogue copy of that player qualifies — a card pulled
  before the admin re-imported or renamed a player keeps its old id and name, but not
  its artwork, so it still counts. Two copies of one player in a set count as one member.
  `need` = 0 means the whole set.
- **One rating everywhere.** `teamRating` = `squadRating` + active bonuses. The home
  tile, club panel, league and manager mode all read it through `useBadges().ratingOf`,
  never `squadRating` directly.
- **Empty squad stays 0.** A bonus never puts a number on a club with nobody fielded.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
