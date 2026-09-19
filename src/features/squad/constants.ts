import type { Formation, FormationId } from './types';

export const BENCH_SIZE = 7;
export const STARTER_COUNT = 11;
/** Crest slots under the OVR shield — see features/badges. */
export const BADGE_SLOTS = 3;

/**
 * Slot coordinates, derived from the stadium backdrop rather than chosen.
 *
 * The touchlines in `pitch-stadium.webp` were measured off the image after it is
 * resampled to the 2048x942 stage — the source is 1848x851, the same ratio, so the
 * mapping is 1:1. They are straight lines:
 *
 *   left(y)  = 680 + (80 - 680)  * (y - 139) / 803
 *   right(y) = 1390 + (1960 - 1390) * (y - 139) / 803
 *
 * The pitch narrows upward, so a card's **top** edge is its tightest constraint; every
 * slot below is checked against left/right at that y, plus a 20px margin clear of the
 * left panel's right edge at x540.
 *
 * Vertical budget: the top touchline is at y139 and the bench begins at y856. Four
 * rows of card plus position tag have to fit in that 717px. Row spacing is 176px at
 * its tightest (y199 -> y375), which is the ceiling on card height.
 */
export const FORMATIONS: Record<FormationId, Formation> = {
  '4-3-3-attack': {
    id: '4-3-3-attack',
    name: '4-3-3 Attack',
    slots: [
      { id: 'lw', position: 'LW', x: 760, y: 199, scale: 0.88 },
      { id: 'st', position: 'ST', x: 1035, y: 199, scale: 0.88 },
      { id: 'rw', position: 'RW', x: 1310, y: 199, scale: 0.88 },

      { id: 'cm-l', position: 'CM', x: 690, y: 375, scale: 0.94 },
      { id: 'cam', position: 'CAM', x: 1035, y: 375, scale: 0.94 },
      { id: 'cm-r', position: 'CM', x: 1380, y: 375, scale: 0.94 },

      { id: 'lb', position: 'LB', x: 640, y: 559, scale: 1 },
      { id: 'cb-l', position: 'CB', x: 940, y: 559, scale: 1 },
      { id: 'cb-r', position: 'CB', x: 1270, y: 559, scale: 1 },
      { id: 'rb', position: 'RB', x: 1570, y: 559, scale: 1 },

      { id: 'gk', position: 'GK', x: 1035, y: 749, scale: 1.06 },
    ],
  },
};

export const DEFAULT_FORMATION: FormationId = '4-3-3-attack';

/**
 * Base card size before a slot's scale is applied. See the note above.
 *
 * Bigger than the original 88x120 and squarer, because the card is now the artwork
 * itself rather than a frame with a portrait inside it: the art is close to square,
 * so a tall box would just add empty space above and below. 124 tall at the largest
 * slot scale (1.06) is 131px against 176px of row spacing, which keeps the position
 * tag under each card clear of the row below.
 */
export const CARD_WIDTH = 116;
export const CARD_HEIGHT = 124;

/** Touchline geometry, measured off the backdrop. See the note above. */
export const PITCH_TOP_LINE = 139;
export const PITCH_BOTTOM = 942;
export const PITCH_TOP_LEFT = 680;
export const PITCH_TOP_RIGHT = 1390;
export const PITCH_BOTTOM_LEFT = 80;
export const PITCH_BOTTOM_RIGHT = 1960;

/** Where the left panel ends, so no slot is placed underneath it. */
export const PANEL_RIGHT = 540;

export const BENCH_TOP = 856;

/** x of the touchline at a given y. Useful for validating new formations. */
export function touchlineLeft(y: number): number {
  const t = (y - PITCH_TOP_LINE) / (PITCH_BOTTOM - PITCH_TOP_LINE);
  return PITCH_TOP_LEFT + (PITCH_BOTTOM_LEFT - PITCH_TOP_LEFT) * t;
}

export function touchlineRight(y: number): number {
  const t = (y - PITCH_TOP_LINE) / (PITCH_BOTTOM - PITCH_TOP_LINE);
  return PITCH_TOP_RIGHT + (PITCH_BOTTOM_RIGHT - PITCH_TOP_RIGHT) * t;
}

/**
 * How close a position has to be to count as "in position" for auto-build. Only
 * exact matches are preferred; everything else is a fallback, which keeps the rule
 * simple enough to explain: best rated player who actually plays there, then best
 * rated player left over.
 */
export const AUTO_BUILD_PREFERS_EXACT = true;
