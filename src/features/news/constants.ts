/** v1 held a bare override map. Read once on load, then left alone. */
export const NEWS_CONFIG_KEY_V1 = 'football-home-ui:news-slides:v1';

/** v2 holds `{ overrides, custom, removed }` — admin-added slides live here too. */
export const NEWS_CONFIG_KEY = 'football-home-ui:news-slides:v2';

/**
 * A ceiling on slides, driven by storage rather than by design: each one can carry a
 * 600 KB image, and the whole app shares a ~5 MB origin quota.
 */
export const MAX_NEWS_SLIDES = 8;

export const HEADING_MAX_LENGTH = 70;

/**
 * Uploaded art is re-encoded to at most this size. Twice the banner's design size
 * (744x415) so it stays sharp on a 2x display without storing a print-resolution
 * file in localStorage.
 */
export const BANNER_MAX_WIDTH = 1488;
export const BANNER_MAX_HEIGHT = 830;

/**
 * Ceiling for one encoded image. localStorage is typically 5 MB per origin for the
 * whole app, and base64 inflates bytes by about a third, so four slides at 600 KB
 * already spends half the budget. Quality is stepped down until the result fits.
 */
export const BANNER_MAX_BYTES = 600_000;

export const BANNER_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];
