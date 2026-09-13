/** v1 held a bare override map. Read once on load, then migrated into v2 and left alone. */
export const DRAFT_CONFIG_KEY_V1 = 'football-home-ui:draft-events:v1';

/** v2 holds `{ overrides, custom }` — admin-authored events live here too. */
export const DRAFT_CONFIG_KEY = 'football-home-ui:draft-events:v2';

/** Store-side limits, all enforced on the way into storage. */
export const PACK_LABEL_MAX = 28;
export const PACK_BADGE_MAX = 14;
export const PACK_COST_MAX = 10_000_000;
export const PACK_PULLS_MAX = 30;
export const PACK_LIMIT_MAX = 999;
export const MAX_PACKS_PER_EVENT = 6;
export const MAX_CUSTOM_EVENTS = 24;

/**
 * The showcase canvas: the scrolling area that holds the banner and the cards on
 * top of it. Origin is stage (470, 230); the viewport is what fits on screen, the
 * canvas is how far it can scroll.
 */
export const SHOWCASE_VIEWPORT_W = 1416;
export const SHOWCASE_VIEWPORT_H = 428;
export const SHOWCASE_BANNER_X = 26;
export const SHOWCASE_BANNER_H = 370;
export const MAX_SHOWCASE_SLOTS = 8;
export const SHOWCASE_CARD_MIN_W = 80;
export const SHOWCASE_CARD_MAX_W = 420;

/**
 * Default card placement, carried over from the measured reference: one large card
 * overhanging the banner's left edge and three smaller ones stepping across it.
 */
export const DEFAULT_SHOWCASE = [
  { left: 0, top: 191, width: 190 },
  { left: 558, top: 238, width: 152 },
  { left: 970, top: 238, width: 152 },
  { left: 1342, top: 238, width: 152 },
] as const;

export const NAME_MAX_LENGTH = 40;
export const TITLE_MAX_LENGTH = 60;

/** The showcase banner renders at 1390x370 on the stage. */
export const DRAFT_BANNER_MAX_WIDTH = 1390;
export const DRAFT_BANNER_MAX_HEIGHT = 370;
export const DRAFT_BANNER_MAX_BYTES = 500_000;

/** Rail thumbnails are tiny, so they get a much smaller budget. */
export const DRAFT_THUMB_MAX_WIDTH = 240;
export const DRAFT_THUMB_MAX_HEIGHT = 230;
export const DRAFT_THUMB_MAX_BYTES = 60_000;
