# features/avatars

Profile pictures with level-gated unlocks and admin-configurable requirements.

```
avatars/
  types.ts              AvatarDefinition, Avatar, AvatarLevelOverrides
  constants.ts          default id, level bounds, storage key
  unlocks.ts            pure rules — resolve, clamp, unlock checks, id repair
  avatarConfigStore.ts  the only file that touches localStorage
  AvatarContext.tsx     AvatarProvider, useAvatars()
```

UI lives in `src/components/profile/AvatarPicker.tsx` (player) and
`src/components/admin/AdminAvatars.tsx` (admin) — this folder must not import from
`src/components/`. See CLAUDE.md.

## Two kinds of data

- **Catalogue** — `data/mock/avatars.ts`. Ships with the build: id, name, artwork,
  and the authored `defaultRequiredLevel`.
- **Overrides** — what the admin changed, in `localStorage` under
  `football-home-ui:avatar-levels:v1`. Keyed by avatar **id**, so reordering or
  removing an avatar cannot silently reassign somebody else's requirement. An
  override for an id that no longer exists is ignored.

`resolveAvatars()` merges the two. The UI only ever sees the merged result, with
`requiredLevel` and an `overridden` flag.

Setting a requirement back to its authored value deletes the override rather than
recording a no-op, so "แก้แล้ว" in the admin list stays truthful.

## Accounts store an id, not a URL

`Account.avatarId` is a catalogue id. Storing the resolved URL would break every
saved account the moment a file is renamed or the bundler changes its hash.

`normalizeAvatarId()` repairs anything unexpected — an id that was removed, or a URL
left over from before this system existed — by falling back to `rookie`. That is
also what protects the top bar from a hand-edited `localStorage` record.

## When an avatar becomes locked

If an admin raises a requirement above a player's level, `resolveDisplayAvatar()`
shows the default instead. The player's choice **stays stored**, so lowering the
requirement again restores it rather than silently resetting them to the starter
avatar.

Unlock checks live in one place. `AvatarPicker` disables locked cards, but the
authority is `isUnlocked()` — and, as everywhere else in this project, it is a UI
gate, not enforcement. Anyone can edit `localStorage` and wear whatever they like.

## Adding an avatar

1. Drop the file in `src/assets/images/avatars/`.
2. Import it in `assetMap.ts` under `avatars`.
3. Add an entry to `avatarCatalogue` with a **new, stable id**.

Artwork is 128x128, square, with its own frame; the picker clips it to a rounded
square and draws nothing behind it. Animated files set `animated: true`, which shows
a GIF tag in the picker.

## Not done yet

Unlock sources other than level (events, purchases, achievements), an unlock
animation, per-account overrides, and server authority over any of it.
