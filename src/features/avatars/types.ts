import type { Entity } from '@/types/common';

/** What the catalogue ships. Static — the admin never edits these directly. */
export interface AvatarDefinition extends Entity {
  name: string;
  /** Resolved asset URL. */
  source: string;
  /** Level requirement as authored. The admin can override it at runtime. */
  defaultRequiredLevel: number;
  /** Animated files get a small badge in the picker so the cost is visible. */
  animated?: boolean;
}

/** A definition with the admin's override applied. This is what the UI consumes. */
export interface Avatar extends AvatarDefinition {
  requiredLevel: number;
  /** True when requiredLevel differs from defaultRequiredLevel. */
  overridden: boolean;
}

/** avatar id -> required level. Only ids the admin has changed appear here. */
export type AvatarLevelOverrides = Record<string, number>;

export type AvatarCatalogue = readonly AvatarDefinition[];
