import type { OwnedPlayer } from '@/features/club/types';

/**
 * Every formation the club screen offers. The list is the runtime half of the type
 * (`FORMATION_IDS` in constants.ts) — a saved squad or a published leaderboard eleven
 * is checked against it on read.
 */
export type FormationId =
  | '4-3-3-attack'
  | '4-3-3-flat'
  | '4-3-3-holding'
  | '4-3-3-defend'
  | '4-3-3-false9'
  | '4-4-2-flat'
  | '4-4-2-holding'
  | '4-1-2-1-2-narrow'
  | '4-1-2-1-2-wide'
  | '4-2-3-1-wide'
  | '4-2-3-1-narrow'
  | '4-2-2-2'
  | '4-3-1-2'
  | '4-3-2-1'
  | '4-1-4-1'
  | '4-4-1-1'
  | '4-5-1-flat'
  | '4-5-1-attack'
  | '4-2-4'
  | '3-4-3-flat'
  | '3-5-2'
  | '3-4-1-2'
  | '3-4-2-1'
  | '3-1-4-2'
  | '5-3-2'
  | '5-2-3'
  | '5-4-1'
  | '5-2-1-2';

/** Every position a slot can ask for. */
export type SlotPosition =
  | 'GK'
  | 'LB'
  | 'CB'
  | 'RB'
  | 'LWB'
  | 'RWB'
  | 'CDM'
  | 'CM'
  | 'LM'
  | 'RM'
  | 'CAM'
  | 'LW'
  | 'RW'
  | 'CF'
  | 'ST';

export interface FormationSlot {
  id: string;
  position: SlotPosition;
  /** Card centre on the 2048x942 stage, in design pixels. */
  x: number;
  y: number;
  /** Cards further up the pitch are drawn slightly smaller. */
  scale: number;
  /**
   * Where the match engine stands this player, in the side's own attacking frame:
   * metres from their own goal, then metres from the left touchline (pitch 105 x 68).
   *
   * Kept beside the stage coordinates rather than derived from them: the club screen
   * squeezes the eleven into a perspective trapezoid beside a panel, so its x and y
   * are the wrong shape for a pitch.
   */
  pitch: [depth: number, width: number];
}

/** Which back line a formation plays — the picker groups by it. */
export type FormationFamily = 4 | 3 | 5;

export interface Formation {
  id: FormationId;
  name: string;
  family: FormationFamily;
  slots: FormationSlot[];
}

export interface Squad {
  formation: FormationId;
  /** Slot id -> owned card id. */
  starters: Record<string, string | null>;
  /** Fixed length; see BENCH_SIZE. */
  bench: (string | null)[];
  /**
   * Equipped team crests by badge id, fixed length BADGE_SLOTS. Ids point at admin
   * config (features/badges) and are resolved on read — a crest the admin has since
   * deleted reads as an empty slot.
   */
  badges: (string | null)[];
}

/** Where a card currently sits, used when a drag swaps two cards. */
export type SquadLocation =
  | { kind: 'starter'; slotId: string }
  | { kind: 'bench'; index: number }
  | { kind: 'collection' };

export interface PlacementCheck {
  ok: boolean;
  reason: 'gk-slot-needs-gk' | 'gk-cannot-play-outfield' | 'duplicate-name' | null;
}

export type OwnedIndex = Map<string, OwnedPlayer>;
