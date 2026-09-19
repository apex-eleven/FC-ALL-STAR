import type { OwnedPlayer } from '@/features/club/types';

export type FormationId = '4-3-3-attack';

/** Every position a slot can ask for. */
export type SlotPosition =
  | 'GK'
  | 'LB'
  | 'CB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LW'
  | 'RW'
  | 'ST';

export interface FormationSlot {
  id: string;
  position: SlotPosition;
  /** Card centre on the 2048x942 stage, in design pixels. */
  x: number;
  y: number;
  /** Cards further up the pitch are drawn slightly smaller. */
  scale: number;
}

export interface Formation {
  id: FormationId;
  name: string;
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
