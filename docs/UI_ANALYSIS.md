# UI_ANALYSIS — Home Screen

Reference: single screenshot of a mobile football game home screen.
Design canvas: **2048 × 942** (landscape, ratio 2.174:1).

All coordinates below are in **design pixels** on that 2048 × 942 canvas.
Measurements were taken off the reference (native 2560 × 1178) and scaled by 0.80.

---

## 1. Global canvas & scaling strategy

The screen is a **fixed-ratio game stage**, not a document flow.
Every element is absolutely positioned inside a `2048 x 942` stage element, and the
stage is placed and scaled by `useStageFit`.

Two rules make this behave:

1. **Measure the container, not the window.** `window.innerWidth/innerHeight`
   includes chrome and scrollbars and does not match the element being filled.
2. **Place the corner explicitly, scale from `transform-origin: 0 0`.** A
   transformed element still occupies its untransformed 2048 x 942 in layout, so a
   2048px box inside a narrower `overflow: hidden` container is pinned to the start
   edge rather than centred; scaling about the centre from there pushes the stage
   sideways. At a 1919px-wide viewport that produced a 65px bar on the left and none
   on the right. `left`/`top` are therefore computed in JS and applied as a
   translate.

### Fill vs letterbox

`useStageFit` compares the container's aspect ratio to the stage's:

- Within `maxStretch` (default 1.06) the stage stretches very slightly and fills the
  container edge to edge. At 1919 x 883 the mismatch is 1.0004, so the stretch is
  imperceptible and there are no bars at all.
- Beyond it, the stage scales uniformly and letterboxes.

Stretching is preferred over cropping because the top bar and bottom navigation sit
flush against the stage edges — cropping would cut into them. Set `maxStretch` to 1
for strictly uniform scaling at the cost of bars on most window sizes.

Consequences at common sizes: 1366 x 768 and 1536 x 864 browsers fill completely;
1920 x 1080 with no chrome letterboxes by 98px top and bottom; portrait windows
letterbox heavily, which is why a separate portrait composition is still needed.

## 2. Layout grid

The screen resolves into four bands, not a symmetric grid:

```
 0                                                                        2048
 ┌──────────────────────────────────────────────────────────────────────────┐  0
 │ TOP BAR  profile ····· news ··················· currencies / social      │  90
 ├──────────┬────────────────────────────────┬──────────────────────────────┤
 │ LEFT     │                                │  NEWS BANNER                 │ 162
 │ RAIL     │        HERO ARTWORK            │  1150 → 1894 · h 415         │
 │ 172→268  │        (free-floating layers)  ├──────────────┬───────────────┤ 577
 │ 4 tiles  │                                │  CLUB        │  PLAY         │ 601
 │ pitch130 │   overlay band + NUMERO + CTA  │  358 wide    │  358 wide     │
 │          │   carousel dots                │  1150→1508   │  1536→1894    │ 773
 ├──────────┴────────────────────────────────┴──────────────┴───────────────┤ 835
 │ BOTTOM NAV   5 equal items, dividers at 410 / 819 / 1229 / 1638           │
 └──────────────────────────────────────────────────────────────────────────┘ 942
```

Right rail is a single 744px column (x 1150 → 1894) shared by the news banner and
the two cards. Right page margin = 154px. Left rail starts at x 172.

## 3. Component boundaries (x, y, w, h)

| Component | x | y | w | h |
|---|---|---|---|---|
| Top bar | 0 | 0 | 2048 | 90 |
| Avatar frame | 160 | 8 | 72 | 72 |
| Player name | 240 | 8 | ~70 | 38 |
| Level badge | 240 | 56 | 46 | 26 |
| XP text + bar | 296 | 56 | 130 | 26 |
| News button | 462 | 12 | 48 | 50 |
| Currency cluster | 1192 | 24 | 688 | 42 |
| ├ exchange-point icon | 1192 | 24 | 46 | 46 |
| ├ gem icon | 1376 | 24 | 46 | 46 |
| ├ FC-point icon | 1528 | 24 | 42 | 42 |
| ├ friends | 1668 | 24 | 48 | 48 |
| ├ mail (badge 1780,8) | 1752 | 24 | 48 | 48 |
| └ settings | 1836 | 24 | 48 | 48 |
| Left rail | 172 | 222 | 96 | 478 |
| ├ tile | — | — | 96 | 88 |
| └ pitch (tile + label + gap) | — | — | — | 130 |
| Scroll hint column | 64 | 300 | 20 | 150 |
| Hero artwork stack | bleeds | bleeds | — | — |
| Hero overlay band | 300 | 599 | 850 | 210 |
| NUMERO wordmark | centred on 712 | 607 | 260 | 42 |
| Hero CTA | 424 | 667 | 576 | 80 |
| Hero carousel dots | 630 | 792 | 130 | 10 |
| Stream/video button | 418 | 819 | 50 | 44 |
| News banner | 1150 | 162 | 744 | 415 |
| ├ heading strip | — | — | 744 | 78 |
| └ banner dot pill | 1776 | 545 | 114 | 28 |
| Club card | 1150 | 601 | 358 | 172 |
| ├ CLUB wordmark | +24 | +10 | — | 50/0.82 |
| ├ OVR badge | +34 | bottom +10 | 92 | 102 |
| └ club crest | right +16 | bottom +26 | 72 | 84 |
| Play card | 1536 | 601 | 358 | 172 |
| └ label | +23 | +15 | — | 40 |
| Bottom nav | 0 | 835 | 2048 | 107 |
| └ item | 5 x 409.6 | — | — | — |

All values were read off the reference after resampling it to exactly 2048 x 942,
using colour-mask bounding boxes for the anchors that have a flat fill (level badge,
mail badge, green heading strip, lime play card, magenta CTA) and a 100px grid
overlay for the rest.

## 3b. Draft screen (2048 x 942)

Same stage, same scaling. The reference screenshot is 2756 x 1268 — identical aspect
ratio — so it maps 1:1 after resampling.

| Component | x | y | w | h |
|---|---|---|---|---|
| Back button | 164 | 13 | 68 | 68 |
| Screen title | 258 | 14 | — | 46 |
| Currency cluster + icons | — | 26 | — | 46 |
| Right cluster edge | — | — | ends 1876 | — |
| Event rail | 148 | 133 | 268 | pitch 139 |
| └ rail card | — | — | 268 | 105 |
| └ "ฮอต" tag | +42 | bottom +10 | 78 | 24 |
| Draft title | 500 | 100 | — | 44 |
| Info button | 1055 | 105 | 38 | 38 |
| Countdown | 500 | 155 | — | 34 |
| Showcase banner | 496 | 230 | 1390 | 370 |
| Card strip | 470 | 408 | 1416 | 250 |
| ├ card 1 (foreground) | +0 | — | 190 | 237 |
| └ cards 2-4 | +558 / +970 / +1342 | — | 152 | 190 |
| "เพิ่มเติม" pill | 1712 | 622 | 148 | 40 |
| Guarantee row 1 | right 1886 | 689 | — | 40 |
| Guarantee row 2 | right 1886 | 744 | — | 40 |
| Contract shortcut | 520 | 785 | 72 | 72 |
| Shop shortcut | 676 | 785 | 72 | 72 |
| Pack button 1 | 938 | 815 | 464 | 65 |
| Pack button 2 | 1422 | 815 | 466 | 65 |

Two structural notes:

- The **card strip is its own box**, not a child of the banner. The foreground card
  overhangs the banner's left edge by 26px while the fourth card is clipped by its
  right edge, so a single clipped container cannot produce both.
- The **backdrop is inverted** relative to the home screen: pale silver on the left,
  magenta on the right, and most text is dark on light rather than white on dark.

Verified by overlaying these boxes on the resampled reference and checking each
against the artwork underneath.

## 4. Visual hierarchy

1. Hero artwork + the pink CTA is the loudest element; it owns the optical centre.
2. News banner is second — large, high-chroma, hard-edged border.
3. Club / Play cards are third, sized at ~half the banner height.
4. Left rail and bottom nav are chrome: low chroma, high contrast icons only.
5. Top bar is the quietest band despite being at the top.

The hero **bleeds under everything**: artwork is not clipped by the top bar or the
rails, it runs edge to edge vertically and is overlapped by them. This is the single
most important structural fact about the screen — it is why the artwork cannot be a
`background-image` on a content box.

### Fitting 4:3 key art to a 2.17:1 stage

Campaign key art arrives at 4:3 with its own composition: wordmark left, figures
right. Dropped in at `cover` the figures land at x890–1900, entirely behind the news
banner and the two cards. So the art is used twice:

- **Wash** — the whole image, `cover`, blurred 40px and lightly dimmed, filling the
  stage. This is what gives the screen its palette, so a new image recolours the
  whole screen for free.
- **Focus** — a 780 × 983 window at (382, −18) showing the art at 0.64 scale,
  offset so the figure cluster lands at x459–1067. Its right edge stops at x1162,
  tucked under the news banner at x1150; its left edge fades out over 18%.

The wash is deliberately kept near the art's own brightness. Dimming it makes the
focus window read as a lit rectangle with hard vertical edges; matching luminance
hides the crop.

Numbers live in `heroBackdrop` (`src/data/mock/home.ts`), not in CSS. Refitting a
new image means editing that object and nothing else.

## 5. Colour

| Token | Value | Used for |
|---|---|---|
| `--color-background` | `#2A1140` | deepest purple base |
| `--color-background-2` | `#5B2A86` | mid purple |
| `--color-background-3` | `#C74BAE` | magenta bloom, right side |
| `--color-panel` | `rgba(20, 16, 34, 0.72)` | glass panels |
| `--color-panel-dark` | `#131A2E` | left-nav tiles, club card |
| `--color-purple` | `#7B3FE4` | gradients, accents |
| `--color-pink` | `#E45BC8` | primary CTA |
| `--color-cyan` | `#25D6EC` | soft currency, focus rings |
| `--color-green` | `#2BE08C` | banner strip, play card, XP bar |
| `--color-yellow` | `#E4F04B` | play card, active nav item |
| `--color-red` | `#E5343F` | notification badges, OVR badge |
| `--color-text` | `#FFFFFF` | all primary text |
| `--color-muted` | `rgba(255,255,255,0.62)` | secondary labels |

Background is a three-stop composite: a deep purple base, a magenta radial bloom
biased to the upper right, and a desaturated silver-white diagonal shard entering
from the left edge and a second from the far right. A halftone dot field sits over
the lower third at ~10% opacity.

## 6. Typography

Two families, both with Thai coverage handled by Noto Sans Thai:

- **Display** — `Saira Condensed` 800/900, slight negative tracking, used for
  `NUMERO`, `CLUB`, `OVR`, `125`, `STAR PASS`.
- **UI / Thai** — `Noto Sans Thai` 400–800 for every Thai label, currency values,
  player name, nav labels.

Scale used: 11 / 13 / 15 / 17 / 20 / 22 / 24 / 26 / 32 / 34 / 40 / 44 / 52 / 56 px.
Player name 34px 800. XP 24px 700. Currency values 32px 800. Rail labels 13px 700.
NUMERO 56px 900. CTA 30px 700. Banner heading 34px 800. CLUB 44px 900.
OVR value 52px 900. Play label 40px 800. Bottom nav labels 22px 700.

## 7. Spacing

4px base unit. Recurring values: 8, 12, 16, 20, 24, 32, 40.
Right rail inner gutter 20px. Left nav gap between tiles 44px (pitch 132 − 88).
Bottom nav item padding 0 32px with 1px dividers at 24% white.

## 8. Borders & radii

| Token | Value | Where |
|---|---|---|
| `--radius-sm` | 8px | badges, small chips |
| `--radius-md` | 14px | left-nav tiles, currency pills |
| `--radius-lg` | 20px | club / play cards |
| `--radius-xl` | 26px | news banner |

The green heading strip is a full-width band across the top of the banner; the
artwork burst breaks upward through it in the reference. The reconstruction keeps
the clean full-width strip, which preserves the read at this size.
| `--radius-pill` | 999px | CTA, XP bar, carousel dots |

The news banner and both cards carry a **2px dark outer stroke** plus a 1px inner
light stroke — that double edge is what makes them read as "game cards" rather than
web cards, and it must not be flattened to a single hairline.

## 9. Gradients

- CTA: 90° `#C44BE8 → #E86BD0 → #C44BE8`, plus a top inner highlight at 30% white.
- Play card: 120° `#D8F03C → #4BE39C → #2BD8C4`.
- Club card: 135° `#17203A → #0D2B46`.
- Banner heading strip: 90° `#2BE08C → #1FC9A8`.
- Level badge: flat `#2BE08C` with a dark inset.

## 10. Shadows

- `--shadow-card`: `0 10px 30px rgba(0,0,0,0.45)`
- `--shadow-cta`: `0 8px 24px rgba(196,75,232,0.45)`
- `--shadow-text`: `0 2px 8px rgba(0,0,0,0.55)` — on every piece of text that sits
  directly on artwork.

## 11. Z-index layers

```
--z-background    0    base gradient
--z-decoration   10    shards, halftone, bokeh
--z-hero-art     20    player artwork layers
--z-hero-overlay 30    translucent band, NUMERO, CTA, dots
--z-panel        40    news banner, club, play
--z-header       50    top bar
--z-left-nav     60    left rail
--z-bottom-nav   70    bottom navigation
--z-badge        80    notification badges
--z-modal       100    reserved, unused in phase 1
```

## 12. Notification badges

Three variants, all absolutely positioned on the top-right corner of their host:
- **count** — red pill, white 13px 800 number (mail: `1`, measured at x1780 y8).
- **dot** — 16px flat red circle, no content. On the left rail it sits on the tile
  corner; on the bottom nav it sits on the bar's top edge at the item's right corner
  (items 1 and 4), not on the icon.
- **gift** — red rounded square with a gift glyph (left rail item 1).

Badges overhang their host by ~40% of their own size; they are never clipped.

## 13. Assets required

| Slot | Aspect | Status |
|---|---|---|
| `home/hero-key-art` | 2048 × 1536 (4:3) | supplied |
| `home/news-banner` | 780 × 426 | placeholder |
| `home/club-logo` | 200 × 200 | placeholder |
| `home/card-club-bg` | 244 × 120 PNG | supplied |
| `home/card-play-bg` | 244 × 120 PNG | supplied |
| `backgrounds/hero-background` | 2048 × 942 | placeholder |
| `backgrounds/halftone` | 64 × 64 tile | placeholder |
| `brand/currency-exchange` | 256 × 256 PNG | supplied |
| `brand/currency-gem` | 64 × 64 PNG | supplied, low-res |
| `brand/currency-fcpoint` | 64 × 64 PNG | supplied, low-res |
| `brand/nav-activities` | 256 × 256 PNG | supplied |
| `brand/nav-highlight` | 256 × 256 PNG | supplied |
| `brand/nav-starpass` | 256 × 256 PNG | supplied |
| `brand/nav-overtime` | 256 × 256 PNG | supplied |

Slots marked *placeholder* are neutral, non-branded stand-ins with the correct
aspect ratio and composition. Swap the file, keep the filename — see
`src/assets/assetMap.ts`.

The four rail icons are round medallions on a transparent background. `NavItem`
draws the dark tile behind them and uses `object-fit: contain`, so any replacement
should keep that same shape rather than being a full-bleed square.

Both bottom cards use a single composed background at `cover` plus a diagonal scrim
under the text. The supplied art is pale where the white wordmarks sit — 1.15:1 on
the club card — so the scrim is doing legibility work, not decoration. Club lifts to
~3.2:1, play to ~2.7:1.

The three currency icons already carry their own ring or frame, so `CurrencyItem`
draws nothing behind them. They fill their canvas by different amounts — a round
medallion, a bare gem, a hexagon — so each one sets its own `iconSize` in
`data/mock/currencies.ts` to keep the optical weight even. Two of the three are only
64 px, which is soft on a 2x display; 256 px replacements would sharpen them.

## 14. Responsive strategy

Phase 1 ships uniform-scale only. Later phases:
1. `>= 1.9:1` — current stage, scale to fit.
2. `1.3 – 1.9:1` — stage scales; right rail may narrow to 720 and the hero crops.
3. Portrait — a separate composition: rails become a scrollable top strip, the
   hero becomes a square, cards stack. Tokens in `variables.css` are the seam.
