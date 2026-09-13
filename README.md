# Football Home UI

A web reconstruction of a mobile football game **home screen**, built at a fixed
2048 × 942 design canvas with React + TypeScript + Vite.

Phase 1 built the static home screen. Phase 2 adds local accounts: you create an ID
with a name, start at level 1, and the account persists in the browser. Still no
server, no gameplay, no real player data.

![canvas](https://img.shields.io/badge/canvas-2048%C3%97942-7B3FE4) ![phase](https://img.shields.io/badge/phase-2%20%C2%B7%20local%20accounts-2BE08C)

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

For an accurate view, open DevTools → device toolbar → custom size **2048 × 942**.
At any other size the whole stage scales uniformly and letterboxes, which is the
intended behaviour.

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run preview     # serve the build
```

## How the layout works

Every element is absolutely positioned inside a single `2048 × 942` stage. The stage
is scaled with `transform: scale(min(vw/2048, vh/942))`. That gives an exact match at
the reference resolution and a proportional match everywhere else, which is how the
original game behaves. See `docs/UI_ANALYSIS.md` for the full measurement table.

## Accounts

On first load you get a sign-up / sign-in screen. Create an ID and password, and the
account starts at level 1 with 0 XP. Several accounts can live in one browser; the
active session is remembered across reloads.

IDs are 3–16 characters — letters (Thai or Latin), digits, and `. _ -`, no spaces, so
the name stays on one line in the top bar. Passwords are at least 6 characters and
are stored as a PBKDF2-SHA-256 hash with a per-account salt, never in plain text.

Password hashing uses `crypto.subtle`, which only exists in a secure context. That
means `localhost` and `https` work; opening the dev server over a plain `http` LAN
address does not, and you'll get a clear error rather than a silent downgrade.

## Currencies

Three currencies — แต้มแลกเปลี่ยน (`exchange`), เจม (`gem`), เอฟซีพอยต์ (`fcpoint`) —
with balances stored per account, so two players in the same browser keep separate
wallets. New accounts start with a small grant set by `STARTING_WALLET` in
`src/features/currencies/constants.ts`.

Game code uses `useWallet()`:

```ts
const { balances, earn, spend, affords } = useWallet();
if (affords('gem', 250)) spend('gem', 250, 'purchase');
```

Every change is validated, clamped, and recorded in a capped per-account ledger.
See `src/features/currencies/README.md`.

## Avatars

Click the avatar in the top bar to open the picker. Each one unlocks at a level set
in `src/data/mock/avatars.ts`, and an admin can change any requirement at runtime
from the admin panel — that setting applies to every account in the browser.

Accounts store the avatar **id**, not a URL, so renaming a file or changing the
build hash does not break saved accounts. If an admin raises a requirement above a
player's level, the default avatar is shown but the player's choice is kept, so
lowering it again restores them. See `src/features/avatars/README.md`.

## Screens

Two so far. **Home** is the reconstruction of the original home screen. **Draft**
opens from the hero CTA (ไปเลย) or by clicking the news banner, and reconstructs the
draft screen: event rail, showcase with player cards, guarantee rows, and pack
buttons that spend real currency.

Navigation is a small stack in `features/navigation` rather than a router — there are
no URLs to keep in sync and two screens to move between. The back button and the home
shortcut in the draft top bar both use it.

## Drafting

The draft screen pulls for real. Packs cost **ตั๋วดราฟต์** (`ticket`), a fourth
currency that only appears in the draft top bar — the reference puts exchange points
there on home and tickets there on draft.

Each event has a pool tiered A to D, per-tier weights, and two pity counters: ชุด B
every 10 pulls and ชุด A every 70. The counters on screen are the account's own, and
they tick down as you pull. Results are filed in the club immediately and the CLUB
card's OVR on the home screen is the average of your best eleven.

Pulling a card rated **121 or higher** plays a video walkout: a flight clip that
reveals nation, then position, then club, cutting inside its own closing white flash
into a looping stage clip that holds the finished card until you leave. Everything
else goes straight to the results grid. See `src/features/draft/README.md`,
`src/features/club/README.md`, and `src/features/walkout/README.md`.

> The two clips add about 11 MB to the build. They are separate files, not bundled
> into the JS, and are only fetched when a walkout actually plays.

## Club

The CLUB card on the home screen opens the squad screen: a 4-3-3 with eleven starting
slots, seven bench seats, and every card you own in a drawer behind **ตัวสำรอง**.

Cards are dragged between the pitch, the bench, and the collection; dropping one
outside any slot takes it out of the squad. The GK slot only accepts a keeper, and a
keeper cannot play outfield — the slot outlines red before you release it.

**สร้างอัตโนมัติ** fills each slot with the best rated player who actually plays there,
then covers anything still empty with the best remaining. See
`src/features/squad/README.md`.

## News banner

Four slides, auto-advancing every 6 seconds and pausing on hover. Content ships in
`src/data/mock/news.ts`; an admin can rewrite any heading or upload a replacement
image from the admin panel. Uploads are scaled to 1488x830 and re-encoded to WebP
under 600 KB before being stored, so the browser's storage quota survives four of
them. See `src/features/news/README.md`.

### Admin

Accounts whose ID appears in `ADMIN_USERNAMES` (`src/features/auth/constants.ts`) get
the admin role, and signing up with one of those IDs also requires the admin code in
the same file. Admin accounts show an ADMIN chip next to their name — click it to
open the admin panel. It has three tabs: **เงินในเกม**, which lists every account and
can mint or overwrite any balance and grant EXP or set a level; **รูปโปรไฟล์**, which
sets the unlock level for each avatar; **แบนเนอร์ข่าว**, which edits the four
banner slides; **ดราฟต์**, which edits each draft event's name, title, showcase
banner, and rail thumbnail; **อัตราสุ่ม**, which edits per-tier weights, pity
thresholds, and the player pool; and **Walkout**, which sets the trigger rating and
the animation's timings.

**This is a UI gate, not security.** The app has no server, so the role, the password
check, and the admin code all live in the browser and can be edited with DevTools.
Don't gate anything that matters on it until accounts move server-side —
`src/features/auth/README.md` spells out what that involves.

Sign out from the gear icon in the top bar.

To point accounts at a real backend, implement the `AccountStore` interface and pass
it to `AuthProvider` — see `src/features/auth/README.md`. No component changes.

## Structure

```
docs/UI_ANALYSIS.md      measurements, colours, type, z-index layers
CLAUDE.md                architecture and working rules
src/app/                 App shell, routes, HomePage composition
src/components/          layout · profile · currency · home · navigation · ui
src/features/            domain slices — placeholders for phase 2+
src/data/mock/           every displayed value
src/assets/              placeholder artwork + assetMap.ts
src/styles/              variables.css · typography.css · globals.css
```

## Replacing artwork

All images resolve through `src/assets/assetMap.ts`. Drop a replacement at the same
path with the same filename and nothing else changes. Each placeholder already has
the correct aspect ratio and composition for its slot — the required list is in
`docs/UI_ANALYSIS.md §13`.

## Notes on assets

The artwork shipped here is generated, non-branded placeholder material. The
repository deliberately contains no club crests, player likenesses, or third-party
brand marks. Supply your own licensed assets before shipping anything public.

## Next

Domain systems live behind `src/features/*`, still empty: profile detail, currencies,
players, squad, club, league, contracts, transfers, marketplace, missions, events,
starpass, notifications, settings, gameplay.

Nearest follow-ups for accounts: avatar selection, renaming from the settings menu
(`rename()` already exists on the auth context), and a server-backed `AccountStore`.
