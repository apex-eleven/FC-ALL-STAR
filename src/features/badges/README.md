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
- **Active = enough of the set on the pitch.** Only the starting eleven counts. A
  set member is matched by `isSameCard` (features/club/identity.ts), shared with the
  special-card offers: the exact catalogue id; else the **card number**
  (`PlayerCard.code`) — when both sides have one it alone decides; else, only when
  either side has no number yet, the same OVR **and** the same art file (the name
  stands in for art only when a side has no real art). A player's name alone never
  matches — two versions of one player are different cards. Any rank-up level
  qualifies. A set lists up to 20 players (`MAX_SET_CARDS`); `need` is at most 11
  (`MAX_NEED`), and `need` = 0 means the whole set — capped at 11 for a set bigger
  than a starting eleven, since no more than eleven can be on the pitch.
- **One rating everywhere.** `teamRating` = `squadRating` + active bonuses. The home
  tile, club panel, league and manager mode all read it through `useBadges().ratingOf`,
  never `squadRating` directly.
- **Empty squad stays 0.** A bonus never puts a number on a club with nobody fielded.

Rules: this folder must not import from `src/components/`. See CLAUDE.md.
