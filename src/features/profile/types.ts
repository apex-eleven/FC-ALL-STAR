import type { Entity } from '@/types/common';

export interface Player extends Entity {
  name: string;
  level: number;
  currentXP: number;
  requiredXP: number;
  /** Resolved asset URL. */
  avatar: string;
  /** Draws the ADMIN chip beside the name. */
  isAdmin?: boolean;
}

export interface LevelProgress {
  level: number;
  currentXP: number;
  requiredXP: number;
}
