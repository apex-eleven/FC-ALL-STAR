export type ID = string;

/** A position on the 2048 x 942 design stage, in design pixels. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BadgeVariant = 'count' | 'dot' | 'gift';

export interface BadgeInfo {
  variant: BadgeVariant;
  /** Only read when variant is 'count'. */
  count?: number;
}

/** Every mock record carries an id so lists never key on index. */
export interface Entity {
  id: ID;
}
