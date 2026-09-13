# CLAUDE.md

Working agreement for this repository.

## What this project is

A pixel-faithful reconstruction of a mobile football game **home screen**, built as a
web UI.

- **Phase 1 (done)** — static home UI, mock data, placeholder artwork.
- **Phase 2 (in progress)** — local accounts: ID + password, roles, level 1 start,
  three currencies with per-account balances, level-gated profile avatars, an
  editable four-slide news banner, a draft screen with a working pull (odds, pity
  counters, results filed in the club), a video walkout for high-rated pulls, a club
  screen with a drag-and-drop squad, and an admin panel covering all of it. Still no
  server.

The reference screenshot is the source of truth for visuals.
`docs/UI_ANALYSIS.md` is the source of truth for measurements.

## Architecture

```
src/
  app/          App shell + route table
  components/   presentational components, grouped by area
  features/     domain slices (types, constants, barrels) — mostly placeholders
  data/mock/    all displayed values live here, never inline in JSX
  assets/       placeholder artwork + assetMap.ts
  hooks/        useStageScale
  styles/       variables.css, typography.css, globals.css
  types/        cross-cutting types
docs/           UI_ANALYSIS.md
```

`components/` holds *how it looks*. `features/` holds *what it means*.
A component may import from `features/*` and `data/mock`; a feature must never
import from `components/`. That is why `SignUpScreen` lives in `components/auth/`
while its types, rules, and context live in `features/auth/`.

State that outlives a screen goes in a feature context (`features/auth/AuthContext`),
never in `App.tsx`.

## Visual accuracy rules

1. **The stage is 2048 × 942.** Everything is positioned in design pixels on that
   stage. Never write a layout that depends on the viewport size.
2. **No magic numbers.** Positions that appear in `UI_ANALYSIS.md` become tokens in
   `variables.css`. One-off values are allowed only inside the component that owns
   them, and only with a comment citing the analysis table row.
3. **Don't "improve" the reference.** No extra whitespace, no softening of colours,
   no rounding a 26px radius to 24 because it feels tidier. If something looks wrong,
   check the measurement before changing the design.
4. **Layering is explicit.** Use the `--z-*` tokens. Never write a raw `z-index`.
5. **Hero artwork is never a `background-image`** on a content box — it is a stack of
   independently positioned `<img>` layers so each can be moved and cropped alone.
6. Text sitting on artwork always carries `--shadow-text`.

## Component rules

- One component per file, default export, colocated `*.module.css`.
- Props are typed with an exported interface named `<Component>Props`.
- No component reads mock data directly except the page-level composition
  (`app/HomePage.tsx`) and the three bar components that own a whole region
  (`TopBar`, `LeftNavigation`, `BottomNavigation`). Everything else takes props.
- Interaction in phase 1 is visual only: hover, active, selected. No handlers that
  mutate anything outside local state.
- Icons: `lucide-react` where no real asset exists. Wrap in `IconButton` so the swap
  to real assets is one file.

## Asset rules

- Every image goes through `src/assets/assetMap.ts`. Components import `ASSETS`,
  never a file path.
- Placeholders keep the **exact aspect ratio and composition** of the slot they fill.
- Replacing an asset = drop the new file at the same path with the same name. No code
  change. If the extension changes, update `assetMap.ts` only.
- No copyrighted artwork, club crests, real player likenesses, or third-party brand
  marks in this repository.

## Commands

```
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build      # tsc -b && vite build
npm run preview    # serve the production build
```

## Testing rules

Phase 1 has no test runner. Verification is manual and visual:

1. `npm run dev`, open at a 2048 × 942 viewport (DevTools device toolbar, custom size).
2. Screenshot, overlay the reference at 50% opacity.
3. Walk the table in `UI_ANALYSIS.md §3` top to bottom and check each boundary.
4. Fix, repeat. Do not stop at the first pass.

`npm run typecheck` and `npm run build` must both be clean before any commit.

## Git rules

- `main` is always buildable.
- Conventional commits: `feat:`, `fix:`, `style:`, `docs:`, `chore:`, `refactor:`.
  Scope by area: `feat(home): add news banner carousel dots`.
- One concern per commit. Layout changes and asset changes are separate commits.
- Never commit `node_modules`, `dist`, `.env*`, or local editor state.
- Generated or downloaded artwork does not go in git history until it is licensed.

## Security honesty rule

Auth runs entirely in the browser, so `isAdmin`, the password check, and
`ADMIN_SIGNUP_CODE` are all bypassable with DevTools. Treat them as UI gating.

- Never describe them as security in comments, docs, or UI copy.
- Never gate anything that costs money, exposes another player's data, or cannot be
  undone on a client-side role check.
- Never store a password in plain text, and never fall back to doing so when
  `crypto.subtle` is missing — fail loudly instead.

When a server arrives, role assignment and password verification move there first.

## No dev-only affordances

There is no DEV strip. Anything worth having while building — granting XP, setting a
level, minting currency — belongs in the admin panel, where it is one feature with
one implementation rather than a second path that only exists in `npm run dev` and
rots. If a control is useful enough to build, it is useful enough to gate on a role.

Corollary: when removing a dev affordance, check what only lived there. Sign-out did,
and moved to the settings menu.

## Screens and navigation

`features/navigation` holds a stack, not a router — there are no URLs to sync with.
A screen owns its own chrome: the draft screen does not sit inside `GameLayout`,
because the only thing it shares with home is the currency cluster.

Swap in a real router when screens need to be linkable from outside the app.

## Timing against real media

When a transition has to line up with footage, **measure the footage**. The walkout's
crossfade is 0.2s because the flight clip's white flash is saturated for 0.208s,
found frame by frame — not because 0.2 felt right. Measured constants go in the
feature's `constants.ts` with the measurement written down, and the admin panel
validates against them.

## Game logic rules

- **Draw logic is pure and separate from React.** `features/draft/pull.ts` takes
  state and an injectable RNG and returns new state. That is what makes the pity
  rules testable; a hook that reaches into context cannot be.
- **Charge after validating, never refund.** Check the pool before spending. A refund
  means two ledger entries for a transaction that never happened.
- **Commit before revealing.** Results are written to the account before the reveal
  screen renders, so closing it early cannot lose a card — and the walkout animation
  can replace the reveal without touching the pull.
- **Owned things are snapshots, not references.** A card in the club copies what it
  was when pulled. Catalogue edits must never alter or delete something a player
  already has.
- **Arrangements store ids; collections store objects.** The squad says where cards
  stand, it does not hold copies of them. Every read repairs against what is actually
  owned.
- **Never HTML5 drag-and-drop.** It does not fire on touch, and this is a
  reconstruction of a mobile game. Pointer events cover mouse, touch, and pen in one
  path.

## Persistence rules

- Only `localAccountStore.ts` may touch `localStorage`. Everything else goes through
  the `AccountStore` interface so a server-backed store drops in without UI changes.
- Derived values are never stored. `requiredXP` is computed from the level by
  `features/profile/leveling.ts`; persisting it would let the save drift from the
  curve the moment the curve is tuned.
- Storage access is wrapped in try/catch. Blocked storage means signed out, not a
  crash.
- Credentials never leave `features/auth`. The context strips `credential` before
  exposing an `Account`, so no component can read a hash.
- Anything read back from storage is repaired before use, not trusted. A record can
  be hand-edited, so `normalizeWallet` coerces every balance into range on load.
- Balances change through `earn`/`spend`/`grant`, never by assigning to
  `account.wallet`. Those paths clamp, validate, and write the ledger.
- Accounts store **ids**, not resolved URLs. `avatarId` survives a renamed file or a
  changed bundler hash; a stored URL would not.
- Player data and game configuration are stored separately. Avatar unlock levels and
  banner content apply to every account, so they live under their own keys, not on an
  account.
- Anything large enough to hit the storage quota writes **before** state updates, and
  reports failure. Optimistic UI that survives until reload is worse than a refused
  edit.
- User-supplied images are re-encoded and size-capped before storage, never kept
  as-is. On read, only `data:` URLs are accepted back.

## Out of scope

player data · squad · club · league · contracts ·
transfers · marketplace · missions · events · star pass · settings · gameplay

`src/features/<name>/` exists for each of these as an empty, documented slot. Do not
implement them yet.
