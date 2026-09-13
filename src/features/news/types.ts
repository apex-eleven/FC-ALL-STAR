import type { Entity } from '@/types/common';

/** What the catalogue ships. Static — the admin never edits these directly. */
export interface NewsSlideDefinition extends Entity {
  heading: string;
  /** Draft event this slide opens. Catalogue-only; the admin panel does not edit it. */
  draftId?: string;
  /** Resolved asset URL. */
  artwork: string;
  /**
   * `object-position` for the artwork. The banner is 1.79:1 and campaign art rarely
   * is, so this decides what the crop keeps.
   */
  focus?: string;
}

/** What an admin changed. Only the fields they touched are present. */
export interface NewsSlideOverride {
  heading?: string;
  /** Data URL produced by encodeBannerImage. */
  artwork?: string;
}

/** A definition with its override applied. This is what the UI consumes. */
export interface NewsSlide extends NewsSlideDefinition {
  headingOverridden: boolean;
  artworkOverridden: boolean;
  /** True for slides an admin created rather than ones that shipped. */
  custom: boolean;
}

/** slide id -> override. Ids for slides that no longer exist are ignored. */
export type NewsOverrides = Record<string, NewsSlideOverride>;

/**
 * A slide an admin added. Stored whole rather than as an override, because there is
 * no catalogue entry underneath it.
 */
export interface CustomNewsSlide extends NewsSlideDefinition {
  createdAt: string;
}

/** Everything the banner admin owns, in one record. */
export interface NewsConfig {
  overrides: NewsOverrides;
  custom: CustomNewsSlide[];
  /** Ids of catalogue slides an admin deleted — they ship in code and cannot be erased. */
  removed: string[];
}

export type NewsCatalogue = readonly NewsSlideDefinition[];

