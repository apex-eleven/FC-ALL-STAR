# features/players

The card catalogue: every player card that can be pulled, and where its art lives.

```
players/
  types.ts           PlayerCard, PlayerCardDraft
  constants.ts       storage key, art paths, field limits, position list
  playerStore.ts     the only file here that touches localStorage
  artManifest.ts     file name -> URL, plus the manifest fetch
  PlayerContext.tsx  PlayerProvider, usePlayers()
```

## Cards are a collection, packs are an arrangement

A pack stores **card ids**, not copies. Fixing a rating here updates every pack that
uses the card, and deleting a card removes it from future pulls without touching
anything a player already owns — owned cards are snapshots taken at pull time.

`features/draft/pool.ts` turns a `PlayerCard` into the `DraftPlayer` shape the pull,
the walkout, and the club already speak. That mapping happens on every read, which is
why a card stores an art file name rather than a resolved URL.

## Art lives in public/, not in storage and not in the bundle

A few hundred animated cards is tens or hundreds of megabytes:

- **localStorage** is out — banner images already push that quota, and these are
  a hundred times larger.
- **`src/assets/` imports** are out — the bundler would read every file on every
  build, and `assetMap.ts` would need an import line per card.

So they sit in `public/players/`, which Vite copies verbatim, and a card stores the
file name (`p021.webp`). `playerArtUrl` prefixes it at render time.

A browser cannot list a directory, so the admin picker reads
`public/players/manifest.json`, written by:

```
npm run players:manifest
```

A missing manifest is an ordinary state, not an error: the picker says so, and a file
name can still be typed by hand.

## The catalogue is mirrored into the repo

localStorage is per-browser and disappears with the profile. A few hundred hand-edited
cards is too much work to lose that way, so every write is also mirrored to
`public/players/catalogue.json` by a dev-only Vite plugin
(`vite-plugins/repo-store.ts`).

- **The file is the seed, storage is the working copy.** A browser with nothing
  stored loads the file on startup; a browser that already has cards keeps them.
- **Dev only.** `configureServer` does not run in a build, so a deployed site has no
  endpoint that can write to disk. There the panel offers download and import buttons
  instead.
- Commit `catalogue.json` and the cards travel with the repo.

## What does not belong here

Per CLAUDE.md: no copyrighted card art, club crests, league marks, or real player
likenesses in this repository. What goes in the folder locally is the operator's
call; nothing licensed gets committed.
