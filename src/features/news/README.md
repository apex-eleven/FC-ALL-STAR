# features/news

The four-slide banner carousel, with headings and artwork an admin can change at
runtime.

```
news/
  types.ts            NewsSlideDefinition, NewsSlide, overrides, upload errors
  constants.ts        storage key, heading limit, image size and quality budget
  imageEncoding.ts    turns an uploaded file into a storable data URL
  newsConfigStore.ts  the only file that touches localStorage
  NewsContext.tsx     NewsProvider, useNews()
```

UI lives in `src/components/home/NewsBanner.tsx` and
`src/components/admin/AdminBanners.tsx`.

## Two kinds of data

Same split as avatars: the catalogue in `data/mock/news.ts` ships with the build,
and the admin's edits live in `localStorage` under
`football-home-ui:news-slides:v1`, keyed by slide **id**. An override for an id that
no longer exists is ignored.

A heading typed back to the shipped text stops being an override, so the admin list
keeps telling the truth about what has been changed.

## Uploaded images

Files are re-encoded, never stored as-is. A 1.4 MB PNG would spend a quarter of the
origin's entire localStorage budget on one slide, and the banner never renders above
1488x830.

`encodeBannerImage()` scales the image down to fit that box, then steps quality down
through `BANNER_QUALITY_STEPS` until the result is under `BANNER_MAX_BYTES`
(600 KB). WebP is tried first, JPEG is the fallback — a canvas without WebP support
silently returns PNG, which is larger than either, so the format is checked rather
than assumed. If even the lowest quality is too big, the upload is refused with
`too-large-to-store` instead of being stored and failing later.

Writes go to storage **first**; state updates only if the write landed. A banner that
looks changed but vanishes on reload is worse than a refused edit, and base64 images
are the one thing here big enough to hit the quota. `QuotaExceededError` surfaces in
the admin panel as a message, not a silent no-op.

On read, only `data:image/` URLs are accepted back. A stored `http(s)` URL would mean
somebody hand-edited the record, and rendering it would fetch an arbitrary remote
image.

## Cropping

The banner is 1.79:1 and campaign art rarely is. Each slide carries a `focus`
(`object-position`) so the crop keeps what matters — the shipped art is 1.60:1, so
about 11% of its height is dropped, and `50% 18%` keeps the wordmark clear of the
green heading strip.

`focus` is catalogue-only; the admin panel does not expose it. An uploaded image
inherits the slide's existing focus.

## Carousel

`NewsBanner` auto-advances every 6 seconds, pauses on hover, and clamps its index so
an admin removing slides cannot leave it pointing past the end. Pass `interval={0}`
to disable auto-advance.

## Adding a slide

Add an entry to `newsCatalogue` with a new, stable id. The dots, the carousel, and
the admin list are all driven by the array length — nothing else needs changing.

## Not done yet

Scheduling (start and end dates), per-slide links or actions, ordering from the admin
panel, and any server authority over what is shown.
