import type { Entity } from '@/types/common';
import type { CurrencyKind } from '@/features/currencies/types';

/** Rarity tiers. A is the best; D is the filler that most pulls land on. */
export type PlayerSet = 'A' | 'B' | 'C' | 'D';

export const PLAYER_SETS: readonly PlayerSet[] = ['A', 'B', 'C', 'D'];

/** A player in an event's pool. */
export interface DraftPlayer extends Entity {
  name: string;
  rating: number;
  position: string;
  set: PlayerSet;
  portrait: string;
  /** Short code standing in for a flag until real badges exist. */
  nation: string;
  /** Club name, revealed as the third beat of the walkout. */
  club: string;
}

/** Relative weight per set. Normalised at pull time, so these need not total 100. */
export type SetOdds = Record<PlayerSet, number>;

/**
 * A pity counter. After `threshold` pulls without landing `set` or better, the next
 * pull is forced to that set.
 */
export interface PityRule extends Entity {
  set: PlayerSet;
  threshold: number;
  /** Row label, e.g. "ชุด A". */
  label: string;
  /** Sentence shown between the label and the counter. */
  description: string;
  tone: 'primary' | 'secondary';
}

/** One purchase button in the store. */
export interface DraftPack extends Entity {
  label: string;
  cost: number;
  currency: CurrencyKind;
  /** How many players a single press draws. */
  pulls: number;
  /**
   * Struck-through "was" price. Only shown when it is higher than `cost`, so a
   * discount that has been rolled back stops advertising itself automatically.
   */
  listCost?: number;
  /** Short ribbon on the button, e.g. "คุ้มที่สุด". Empty means no ribbon. */
  badge?: string;
  /** Hidden from the store when false. Absent counts as visible. */
  visible?: boolean;
  /**
   * How many times one account may buy this. 0 is unlimited.
   *
   * Counted per account per pack in `DraftProgress`, not globally — this game has no
   * server, so a shared stock count would be a number each browser invents for
   * itself.
   */
  limitPerAccount?: number;
}

/** What the catalogue ships for one draft event. */
export interface DraftEventDefinition extends Entity {
  railName: string;
  title: string;
  thumbnail: string;
  banner: string;
  hot: boolean;
  endsInDays: number;
  /** Everyone who can be drawn. The showcase displays the top-rated few. */
  pool: DraftPlayer[];
  odds: SetOdds;
  pity: PityRule[];
  packs: DraftPack[];
}

/**
 * Where one showcase card sits on the banner canvas.
 *
 * Coordinates are design pixels from the canvas origin, not the stage: the canvas
 * scrolls, so a stage coordinate would stop meaning anything the moment it moves.
 */
export interface ShowcaseSlot {
  left: number;
  top: number;
  width: number;
  /**
   * A catalogue card pinned to this slot, or null to let the slot fill itself from
   * the pack's best cards.
   *
   * Kept separate from the pool on purpose: the banner is advertising. A pack may
   * want to show a card it is famous for even while the pool is being reshuffled, and
   * a card that is not in this pack at all can still make the poster.
   */
  cardId?: string | null;
}

/** What an admin changed. Only the fields they touched are present. */
export interface DraftEventOverride {
  /** Card placement on the banner, dragged in the admin panel. */
  showcase?: ShowcaseSlot[];
  /**
   * Replaces the guarantee rules outright, rather than only their thresholds.
   * Events created in the panel start with none, so there is nothing to tune until
   * a rule is added here.
   */
  pityRules?: PityRule[];
  /**
   * Card ids from the player catalogue. Present means the pool is built from the
   * catalogue and `pool` is ignored — arrangements store ids, collections store
   * objects, so editing a card updates every pack that uses it.
   */
  poolIds?: string[];
  /** Replaces the store buttons outright. */
  packs?: DraftPack[];
  /** Taken out of the rail and the store without deleting anything. */
  hidden?: boolean;
  /** Rail order, ascending. Events without one keep catalogue order, after the rest. */
  order?: number;
  /** ISO date. Before this the event is configured but not live. */
  startsAt?: string | null;
  /** ISO date. After this the event stops selling. */
  endsAt?: string | null;
  railName?: string;
  title?: string;
  /** Data URL. */
  banner?: string;
  /** Data URL. */
  thumbnail?: string;
  odds?: SetOdds;
  /** Rule id -> threshold. */
  pity?: Record<string, number>;
  /** Replaces the catalogue pool outright when present. */
  pool?: DraftPlayer[];
}

export interface DraftEvent extends DraftEventDefinition {
  /** True for events an admin authored rather than ones that shipped in the catalogue. */
  custom: boolean;
  hidden: boolean;
  order: number;
  startsAt: string | null;
  endsAt: string | null;
  /** Visible, inside its window, and holding at least one card. */
  live: boolean;
  /** Card placement for this event's banner, defaults included. */
  showcase: ShowcaseSlot[];
  showcaseOverridden: boolean;
  poolIdsOverridden: boolean;
  packsOverridden: boolean;
  railNameOverridden: boolean;
  titleOverridden: boolean;
  bannerOverridden: boolean;
  thumbnailOverridden: boolean;
  oddsOverridden: boolean;
  pityOverridden: boolean;
  poolOverridden: boolean;
}

export type DraftOverrides = Record<string, DraftEventOverride>;

/**
 * An event an admin created. Stored whole rather than as an override, because there
 * is no catalogue entry underneath it to override.
 */
export interface CustomDraftEvent extends Omit<DraftEventDefinition, 'pool'> {
  poolIds: string[];
  showcase: ShowcaseSlot[];
  createdAt: string;
}

/** Everything the draft admin owns, in one record. */
export interface DraftConfig {
  overrides: DraftOverrides;
  custom: CustomDraftEvent[];
  /**
   * Ids of catalogue events an admin deleted.
   *
   * Events that ship in code cannot be erased from the source at runtime, so
   * deleting one means remembering that it is gone. Kept as a list rather than as a
   * flag on the override so that restoring is one obvious action.
   */
  removed: string[];
}

export type DraftCatalogue = readonly DraftEventDefinition[];

/** Per-account, per-event pity counters. Rule id -> pulls since it last paid out. */
export type DraftCounters = Record<string, number>;

/** Everything an account has drawn from drafts, keyed by event id. */
export type DraftProgress = Record<
  string,
  {
    pulls: number;
    counters: DraftCounters;
    /** Pack id -> times bought. Only written for packs that carry a limit. */
    purchases?: Record<string, number>;
  }
>;
