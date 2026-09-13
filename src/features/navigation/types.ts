import type { BadgeInfo, Entity } from '@/types/common';

export interface RailItem extends Entity {
  label: string;
  /** Resolved asset URL for the tile artwork. Used until `artworkFile` exists. */
  artwork: string;
  /**
   * File name inside `public/brand/` that replaces the tile artwork when present.
   * Lets a tile's art be swapped by dropping a file in, with no rebuild.
   */
  artworkFile?: string;
  badge?: BadgeInfo;
}

export type BottomNavIcon = 'missions' | 'league' | 'contracts' | 'exchange' | 'store';

export interface BottomNavItem extends Entity {
  label: string;
  icon: BottomNavIcon;
  badge?: BadgeInfo;
  active?: boolean;
}
