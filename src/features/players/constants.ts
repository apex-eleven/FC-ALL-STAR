export const PLAYERS_KEY = 'football-home-ui:players:v1';

/**
 * Where card art lives.
 *
 * `public/` is served as-is and never goes through the bundler, which is the only
 * workable answer for a few hundred animated cards: importing them would mean the
 * build reads every file, and storing them would blow the localStorage quota a
 * hundred times over. The catalogue keeps the file name; this prefix turns it into
 * a URL at render time.
 */
export const PLAYER_ART_BASE = '/players/';

/** Written by `npm run players:manifest`. Absent is fine — the picker just empties. */
export const PLAYER_ART_MANIFEST = '/players/manifest.json';

export const PLAYER_NAME_MAX = 24;
export const PLAYER_CLUB_MAX = 28;
export const PLAYER_NATION_MAX = 6;
export const PLAYER_POSITION_MAX = 4;

export const RATING_MIN = 1;
export const RATING_MAX = 199;

/**
 * A ceiling on the catalogue, not on the art folder. Cards are small JSON records,
 * but localStorage is shared with accounts, banners, and draft overrides — a runaway
 * import should fail loudly here rather than take the whole save down.
 */
export const MAX_PLAYERS = 800;

/** Offered in the editor as buttons. Typing something else is still allowed. */
export const POSITIONS = [
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LM',
  'RM',
  'LW',
  'RW',
  'CF',
  'ST',
] as const;
