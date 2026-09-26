import type { Formation, FormationFamily, FormationId, SlotPosition } from './types';

export const BENCH_SIZE = 7;
export const STARTER_COUNT = 11;
/** Crest slots under the OVR shield — see features/badges. */
export const BADGE_SLOTS = 3;

/**
 * Where a position stands in the match engine, metres from its own goal.
 *
 * One depth per position rather than per slot, so a CDM is a CDM in every formation
 * that fields one. Width comes from the slot's own x — see `pitchSpot`.
 */
const DEPTH: Record<SlotPosition, number> = {
  GK: 5,
  CB: 20,
  LB: 22,
  RB: 22,
  LWB: 31,
  RWB: 31,
  CDM: 33,
  CM: 42,
  LM: 46,
  RM: 46,
  CAM: 53,
  CF: 62,
  LW: 72,
  RW: 72,
  ST: 76,
};

/**
 * A slot's engine spot, from its position and where it sits across the club pitch.
 *
 * The club pitch is a trapezoid squeezed in beside the panel, so a card's x is only
 * good for which lane it is in. That lane is spread over the real 68m width: the
 * widest card a row can hold maps to about 8m from the touchline. The top row is
 * narrower on screen than the rows below it, which is why it has its own span.
 */
function pitchSpot(position: SlotPosition, x: number, y: number): [number, number] {
  const half = y < 260 ? 290 : 400;
  const lane = Math.max(-1, Math.min(1, (x - 1035) / half));
  return [DEPTH[position], Math.round((34 + lane * 26) * 10) / 10];
}

type SlotSpec = [id: string, position: SlotPosition, x: number, y: number, scale: number];

function formation(
  id: FormationId,
  name: string,
  family: FormationFamily,
  specs: SlotSpec[],
  pitch: Record<string, [number, number]> = {},
): Formation {
  return {
    id,
    name,
    family,
    slots: specs.map(([slotId, position, x, y, scale]) => ({
      id: slotId,
      position,
      x,
      y,
      scale,
      pitch: pitch[slotId] ?? pitchSpot(position, x, y),
    })),
  };
}

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
/*
  Rows.

  A formation with three outfield lines uses the original 4-3-3 rows: attack y199,
  midfield y375, defence y559, keeper y749. One with four lines (a holding midfielder
  under an attacking one) cannot fit four full rows in the 717px budget above, so it
  uses a second grid — attack y186, attacking midfield y334, holding midfield y430,
  defence y590, keeper y760 — with smaller cards up top, and the two midfield rows
  are staggered so no card in one sits directly above a card in the other. That is
  how mobile football games draw them too.

  Every formation here is checked by `validateFormation` in the verification script:
  no two cards (with their name and position caption) overlap, and every card sits
  inside the touchlines and clear of the left panel.
*/
const GK3: SlotSpec = ['gk', 'GK', 1035, 749, 1.06];
const GK4: SlotSpec = ['gk', 'GK', 1035, 760, 1];

/** Back fours. */
const BACK4_3: SlotSpec[] = [
  ['lb', 'LB', 640, 559, 1],
  ['cb-l', 'CB', 900, 559, 1],
  ['cb-r', 'CB', 1170, 559, 1],
  ['rb', 'RB', 1430, 559, 1],
];
const BACK4_4: SlotSpec[] = [
  ['lb', 'LB', 630, 590, 0.96],
  ['cb-l', 'CB', 900, 590, 0.96],
  ['cb-r', 'CB', 1170, 590, 0.96],
  ['rb', 'RB', 1440, 590, 0.96],
];

/** Back threes. */
const BACK3_3: SlotSpec[] = [
  ['cb-l', 'CB', 800, 559, 1],
  ['cb', 'CB', 1035, 559, 1],
  ['cb-r', 'CB', 1270, 559, 1],
];
const BACK3_4: SlotSpec[] = [
  ['cb-l', 'CB', 800, 590, 0.96],
  ['cb', 'CB', 1035, 590, 0.96],
  ['cb-r', 'CB', 1270, 590, 0.96],
];

/** Back fives: wing-backs outside three centre-backs. */
const BACK5_3: SlotSpec[] = [
  ['lwb', 'LWB', 630, 559, 1],
  ['cb-l', 'CB', 840, 559, 1],
  ['cb', 'CB', 1035, 559, 1],
  ['cb-r', 'CB', 1230, 559, 1],
  ['rwb', 'RWB', 1440, 559, 1],
];
const BACK5_4: SlotSpec[] = [
  ['lwb', 'LWB', 630, 590, 0.96],
  ['cb-l', 'CB', 840, 590, 0.96],
  ['cb', 'CB', 1035, 590, 0.96],
  ['cb-r', 'CB', 1230, 590, 0.96],
  ['rwb', 'RWB', 1440, 590, 0.96],
];

/** The three-line rows' scales, and the four-line rows'. */
const A3 = 0.88;
const M3 = 0.94;
const A4 = 0.8;
const AM4 = 0.82;
const DM4 = 0.86;

const LIST: Formation[] = [
  // ---- back four ---------------------------------------------------------
  formation(
    '4-3-3-attack',
    '4-3-3 Attack',
    4,
    [
      ['lw', 'LW', 760, 199, A3],
      ['st', 'ST', 1035, 199, A3],
      ['rw', 'RW', 1310, 199, A3],
      ['cm-l', 'CM', 690, 375, M3],
      ['cam', 'CAM', 1035, 375, M3],
      ['cm-r', 'CM', 1380, 375, M3],
      ['lb', 'LB', 640, 559, 1],
      ['cb-l', 'CB', 940, 559, 1],
      ['cb-r', 'CB', 1270, 559, 1],
      ['rb', 'RB', 1570, 559, 1],
      ['gk', 'GK', 1035, 749, 1.06],
    ],
    // The original formation keeps the spots the match engine was tuned on.
    {
      gk: [5, 34],
      lb: [22, 8],
      'cb-l': [20, 25],
      'cb-r': [20, 43],
      rb: [22, 60],
      'cm-l': [42, 18],
      cam: [50, 34],
      'cm-r': [42, 50],
      lw: [72, 10],
      st: [76, 34],
      rw: [72, 58],
    },
  ),
  formation('4-3-3-flat', '4-3-3 Flat', 4, [
    ['lw', 'LW', 760, 199, A3],
    ['st', 'ST', 1035, 199, A3],
    ['rw', 'RW', 1310, 199, A3],
    ['cm-l', 'CM', 690, 375, M3],
    ['cm', 'CM', 1035, 375, M3],
    ['cm-r', 'CM', 1380, 375, M3],
    ...BACK4_3,
    GK3,
  ]),
  formation('4-3-3-holding', '4-3-3 Holding', 4, [
    ['lw', 'LW', 760, 186, A4],
    ['st', 'ST', 1035, 186, A4],
    ['rw', 'RW', 1310, 186, A4],
    ['cm-l', 'CM', 860, 334, AM4],
    ['cm-r', 'CM', 1210, 334, AM4],
    ['cdm', 'CDM', 1035, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-3-3-defend', '4-3-3 Defend', 4, [
    ['lw', 'LW', 760, 186, A4],
    ['st', 'ST', 1035, 186, A4],
    ['rw', 'RW', 1310, 186, A4],
    ['cm', 'CM', 1035, 334, AM4],
    ['cdm-l', 'CDM', 885, 430, DM4],
    ['cdm-r', 'CDM', 1185, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-3-3-false9', '4-3-3 False 9', 4, [
    ['lw', 'LW', 760, 186, A4],
    ['cf', 'CF', 1035, 186, A4],
    ['rw', 'RW', 1310, 186, A4],
    ['cm-l', 'CM', 860, 334, AM4],
    ['cm-r', 'CM', 1210, 334, AM4],
    ['cdm', 'CDM', 1035, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-4-2-flat', '4-4-2 Flat', 4, [
    ['st-l', 'ST', 890, 199, A3],
    ['st-r', 'ST', 1180, 199, A3],
    ['lm', 'LM', 640, 375, M3],
    ['cm-l', 'CM', 900, 375, M3],
    ['cm-r', 'CM', 1170, 375, M3],
    ['rm', 'RM', 1430, 375, M3],
    ...BACK4_3,
    GK3,
  ]),
  formation('4-4-2-holding', '4-4-2 Holding', 4, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cdm-l', 'CDM', 885, 430, DM4],
    ['cdm-r', 'CDM', 1185, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-1-2-1-2-narrow', '4-1-2-1-2 Narrow', 4, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['cam', 'CAM', 1035, 310, AM4],
    ['cm-l', 'CM', 800, 400, DM4],
    ['cm-r', 'CM', 1270, 400, DM4],
    ['cdm', 'CDM', 1035, 462, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-1-2-1-2-wide', '4-1-2-1-2 Wide', 4, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['cam', 'CAM', 1035, 310, AM4],
    ['lm', 'LM', 660, 400, DM4],
    ['rm', 'RM', 1410, 400, DM4],
    ['cdm', 'CDM', 1035, 462, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-2-3-1-wide', '4-2-3-1 Wide', 4, [
    ['st', 'ST', 1035, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['cam', 'CAM', 1035, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cdm-l', 'CDM', 885, 430, DM4],
    ['cdm-r', 'CDM', 1185, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-2-3-1-narrow', '4-2-3-1 Narrow', 4, [
    ['st', 'ST', 1035, 186, A4],
    ['cam-l', 'CAM', 760, 334, AM4],
    ['cam', 'CAM', 1035, 334, AM4],
    ['cam-r', 'CAM', 1310, 334, AM4],
    ['cdm-l', 'CDM', 885, 430, DM4],
    ['cdm-r', 'CDM', 1185, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-2-2-2', '4-2-2-2', 4, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['cam-l', 'CAM', 720, 334, AM4],
    ['cam-r', 'CAM', 1350, 334, AM4],
    ['cdm-l', 'CDM', 885, 430, DM4],
    ['cdm-r', 'CDM', 1185, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-3-1-2', '4-3-1-2', 4, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['cam', 'CAM', 1035, 300, AM4],
    ['cm-l', 'CM', 760, 452, DM4],
    ['cm', 'CM', 1035, 452, DM4],
    ['cm-r', 'CM', 1310, 452, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-3-2-1', '4-3-2-1', 4, [
    ['st', 'ST', 1035, 186, A4],
    ['cf-l', 'CF', 800, 300, AM4],
    ['cf-r', 'CF', 1270, 300, AM4],
    ['cm-l', 'CM', 760, 452, DM4],
    ['cm', 'CM', 1035, 452, DM4],
    ['cm-r', 'CM', 1310, 452, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-1-4-1', '4-1-4-1', 4, [
    ['st', 'ST', 1035, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['cm-l', 'CM', 860, 334, AM4],
    ['cm-r', 'CM', 1210, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cdm', 'CDM', 1035, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-4-1-1', '4-4-1-1', 4, [
    ['st', 'ST', 1035, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['cf', 'CF', 1035, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cm-l', 'CM', 885, 430, DM4],
    ['cm-r', 'CM', 1185, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-5-1-flat', '4-5-1 Flat', 4, [
    ['st', 'ST', 1035, 199, A3],
    ['lm', 'LM', 630, 375, M3],
    ['cm-l', 'CM', 832, 375, M3],
    ['cm', 'CM', 1035, 375, M3],
    ['cm-r', 'CM', 1238, 375, M3],
    ['rm', 'RM', 1440, 375, M3],
    ...BACK4_3,
    GK3,
  ]),
  formation('4-5-1-attack', '4-5-1 Attack', 4, [
    ['st', 'ST', 1035, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['cam-l', 'CAM', 860, 334, AM4],
    ['cam-r', 'CAM', 1210, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cm', 'CM', 1035, 430, DM4],
    ...BACK4_4,
    GK4,
  ]),
  formation('4-2-4', '4-2-4', 4, [
    ['lw', 'LW', 760, 199, A3],
    ['st-l', 'ST', 945, 199, A3],
    ['st-r', 'ST', 1125, 199, A3],
    ['rw', 'RW', 1310, 199, A3],
    ['cm-l', 'CM', 900, 375, M3],
    ['cm-r', 'CM', 1170, 375, M3],
    ...BACK4_3,
    GK3,
  ]),

  // ---- back three --------------------------------------------------------
  formation('3-4-3-flat', '3-4-3 Flat', 3, [
    ['lw', 'LW', 760, 199, A3],
    ['st', 'ST', 1035, 199, A3],
    ['rw', 'RW', 1310, 199, A3],
    ['lm', 'LM', 640, 375, M3],
    ['cm-l', 'CM', 900, 375, M3],
    ['cm-r', 'CM', 1170, 375, M3],
    ['rm', 'RM', 1430, 375, M3],
    ...BACK3_3,
    GK3,
  ]),
  formation('3-5-2', '3-5-2', 3, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['cam', 'CAM', 1035, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cdm-l', 'CDM', 885, 430, DM4],
    ['cdm-r', 'CDM', 1185, 430, DM4],
    ...BACK3_4,
    GK4,
  ]),
  formation('3-4-1-2', '3-4-1-2', 3, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['cam', 'CAM', 1035, 334, AM4],
    ['lm', 'LM', 640, 430, DM4],
    ['cm-l', 'CM', 870, 430, DM4],
    ['cm-r', 'CM', 1200, 430, DM4],
    ['rm', 'RM', 1430, 430, DM4],
    ...BACK3_4,
    GK4,
  ]),
  formation('3-4-2-1', '3-4-2-1', 3, [
    ['st', 'ST', 1035, 186, A4],
    ['cf-l', 'CF', 760, 300, AM4],
    ['cf-r', 'CF', 1310, 300, AM4],
    ['lm', 'LM', 620, 430, DM4],
    ['cm-l', 'CM', 900, 430, DM4],
    ['cm-r', 'CM', 1170, 430, DM4],
    ['rm', 'RM', 1450, 430, DM4],
    ...BACK3_4,
    GK4,
  ]),
  formation('3-1-4-2', '3-1-4-2', 3, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['lm', 'LM', 650, 334, AM4],
    ['cm-l', 'CM', 870, 334, AM4],
    ['cm-r', 'CM', 1200, 334, AM4],
    ['rm', 'RM', 1420, 334, AM4],
    ['cdm', 'CDM', 1035, 430, DM4],
    ...BACK3_4,
    GK4,
  ]),

  // ---- back five ---------------------------------------------------------
  formation('5-3-2', '5-3-2', 5, [
    ['st-l', 'ST', 890, 199, A3],
    ['st-r', 'ST', 1180, 199, A3],
    ['cm-l', 'CM', 760, 375, M3],
    ['cm', 'CM', 1035, 375, M3],
    ['cm-r', 'CM', 1310, 375, M3],
    ...BACK5_3,
    GK3,
  ]),
  formation('5-2-3', '5-2-3', 5, [
    ['lw', 'LW', 760, 199, A3],
    ['st', 'ST', 1035, 199, A3],
    ['rw', 'RW', 1310, 199, A3],
    ['cm-l', 'CM', 900, 375, M3],
    ['cm-r', 'CM', 1170, 375, M3],
    ...BACK5_3,
    GK3,
  ]),
  formation('5-4-1', '5-4-1', 5, [
    ['st', 'ST', 1035, 199, A3],
    ['lm', 'LM', 640, 375, M3],
    ['cm-l', 'CM', 900, 375, M3],
    ['cm-r', 'CM', 1170, 375, M3],
    ['rm', 'RM', 1430, 375, M3],
    ...BACK5_3,
    GK3,
  ]),
  formation('5-2-1-2', '5-2-1-2', 5, [
    ['st-l', 'ST', 900, 186, A4],
    ['st-r', 'ST', 1170, 186, A4],
    ['cam', 'CAM', 1035, 334, AM4],
    ['cm-l', 'CM', 885, 430, DM4],
    ['cm-r', 'CM', 1185, 430, DM4],
    ...BACK5_4,
    GK4,
  ]),
];

/** Every formation, in the order the picker shows them. */
export const FORMATION_LIST: readonly Formation[] = LIST;

export const FORMATIONS = Object.fromEntries(LIST.map((entry) => [entry.id, entry])) as Record<
  FormationId,
  Formation
>;

/** The runtime list of ids, for checking a stored or published `formation`. */
export const FORMATION_IDS: readonly FormationId[] = LIST.map((entry) => entry.id);

export function isFormationId(value: unknown): value is FormationId {
  return typeof value === 'string' && (FORMATION_IDS as readonly string[]).includes(value);
}

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
