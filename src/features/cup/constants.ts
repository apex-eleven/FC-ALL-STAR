import type { CupCompetition, CupConfig, CupKind } from './types';

export const CUP_CONFIG_KEY = 'football-home-ui:cup:v1';

/** Bracket sizes the admin may choose. Anything else cannot be paired evenly. */
export const CUP_SIZES = [4, 8, 16] as const;

export const MAX_ENTRIES = 20;
export const MAX_ROUND_REWARDS = 8;

/** Minutes between rounds. 0 would put a whole bracket in one second. */
export const MIN_ROUND_GAP = 5;
export const MAX_ROUND_GAP = 24 * 60;
export const NAME_MAX = 40;
/** Finished runs kept per account. */
export const HISTORY_LIMIT = 30;
/**
 * Uploaded art budgets.
 *
 * Both live in the one shared settings document, which Firestore caps at 1 MiB for
 * everything together — so the background gets the larger share because it is the
 * thing people actually look at, and the trophy is small on screen anyway.
 */
export const CUP_BACKGROUND_IMAGE = { maxWidth: 1600, maxHeight: 760, maxBytes: 120_000 };
export const CUP_TROPHY_IMAGE = { maxWidth: 420, maxHeight: 420, maxBytes: 45_000 };

/** The signed-in account's seat id inside a bracket. Never collides with a uid. */
export const YOU_ID = 'you';

export const CUP_LABEL: Record<CupKind, string> = {
  daily: 'ถ้วยรายวัน',
  weekend: 'ถ้วยใหญ่สุดสัปดาห์',
};

/**
 * Round names, counted back from the final.
 *
 * Named by what is at stake rather than by number, because "รอบ 2" means nothing
 * on its own while "รอบรองชนะเลิศ" means the same thing in a 4-team bracket and a
 * 16-team one.
 */
export function roundName(size: number, round: number): string {
  const teamsLeft = size >> round;
  if (teamsLeft <= 1) return 'แชมป์';
  if (teamsLeft === 2) return 'รอบชิงชนะเลิศ';
  if (teamsLeft === 4) return 'รอบรองชนะเลิศ';
  if (teamsLeft === 8) return 'รอบก่อนรองชนะเลิศ';
  return `รอบ ${teamsLeft} ทีม`;
}

/** How many rounds a bracket of this size has. 8 teams is 3. */
export function roundCount(size: number): number {
  return Math.max(1, Math.round(Math.log2(Math.max(2, size))));
}

function daily(): CupCompetition {
  return {
    enabled: true,
    name: CUP_LABEL.daily,
    size: 8,
    // A ticket a run, three runs a day: the ticket currency existed with almost
    // nothing to spend it on, and a cup entry is exactly what it was shaped for.
    entryCost: 1,
    entryCurrency: 'ticket',
    entries: 3,
    days: [],
    botSpread: 8,
    // Three rounds two hours apart is six hours — inside a single day's window.
    roundGapMinutes: 120,
    rewards: [
      { wins: 1, rewards: [{ kind: 'exchange', amount: 400 }] },
      { wins: 2, rewards: [{ kind: 'exchange', amount: 900 }, { kind: 'gem', amount: 120 }] },
      {
        wins: 3,
        rewards: [
          { kind: 'exchange', amount: 2000 },
          { kind: 'gem', amount: 400 },
          { kind: 'fcpoint', amount: 10 },
        ],
      },
    ],
    background: '',
    trophy: '',
  };
}

function weekend(): CupCompetition {
  return {
    enabled: true,
    name: CUP_LABEL.weekend,
    size: 16,
    entryCost: 2,
    entryCurrency: 'ticket',
    entries: 2,
    // Friday, Saturday, Sunday. The window opens at `resetHour` on the first of
    // these and closes at `resetHour` on the day after the last.
    days: [5, 6, 0],
    botSpread: 6,
    // Four rounds, so a longer gap still finishes well inside a weekend.
    roundGapMinutes: 180,
    rewards: [
      { wins: 1, rewards: [{ kind: 'exchange', amount: 600 }] },
      { wins: 2, rewards: [{ kind: 'exchange', amount: 1200 }, { kind: 'gem', amount: 200 }] },
      { wins: 3, rewards: [{ kind: 'exchange', amount: 2500 }, { kind: 'gem', amount: 500 }] },
      {
        wins: 4,
        rewards: [
          { kind: 'exchange', amount: 6000 },
          { kind: 'gem', amount: 1500 },
          { kind: 'fcpoint', amount: 40 },
          { kind: 'ticket', amount: 3 },
        ],
      },
    ],
    background: '',
    trophy: '',
  };
}

export function defaultCup(): CupConfig {
  return {
    enabled: true,
    resetHour: 6,
    // Shorter than manager mode's: a cup run is up to four of these back to back.
    matchSeconds: 150,
    daily: daily(),
    weekend: weekend(),
  };
}

/**
 * What leaving a watched tie early is recorded as.
 *
 * The entry is already spent and the bracket is already drawn, so quitting has to
 * settle the tie rather than leave it open — otherwise closing the tab at 0-1 would
 * be a free retry. It settles as a loss, which is what walking off the pitch is.
 */
export const CUP_FORFEIT_SCORE: readonly [number, number] = [0, 3];

export function cupId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}
