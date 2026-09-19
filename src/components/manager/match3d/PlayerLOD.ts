import type { Object3D } from 'three';

/**
 * Level of detail for a player, by distance from the camera.
 *
 * The touchline camera sits about 45 m from the near touchline and 110 m from the
 * far corner, so a player can be anywhere from a third of the frame tall to a few
 * pixels. The parts that only read up close — eyes, collar, cuffs, sock tops, boot
 * soles — are not worth a draw call at the far end, and neither is a shadow-map
 * pass for a body three pixels high.
 *
 * Levels only ever change visibility flags on parts that already exist; nothing is
 * created or destroyed when a player crosses a threshold.
 */

export type DetailLevel = 0 | 1 | 2;

export const LOD_NEAR: DetailLevel = 0;
export const LOD_MID: DetailLevel = 1;
export const LOD_FAR: DetailLevel = 2;

/**
 * Camera distances, in metres, at which the next level down takes over. The camera
 * sits 44 m outside the near touchline, so the near half of the pitch is inside the
 * first threshold and only the far corners fall past the second.
 */
export const LOD_MID_DISTANCE = 62;
export const LOD_FAR_DISTANCE = 92;

/** The visibility groups a body sorts its parts into. */
export interface DetailParts {
  /** Only shown up close: face, collar, cuffs, sock tops, soles. */
  fine: Object3D[];
  /** Shown near and mid: hands, hair. */
  medium: Object3D[];
  /** Everything that throws a shadow into the sun's map. */
  casters: Object3D[];
}

export function makeDetailParts(): DetailParts {
  return { fine: [], medium: [], casters: [] };
}

export function levelForDistance(distance: number): DetailLevel {
  if (distance < LOD_MID_DISTANCE) return LOD_NEAR;
  if (distance < LOD_FAR_DISTANCE) return LOD_MID;
  return LOD_FAR;
}

/** Writes the flags for `level`. Cheap enough to call only when the level changes. */
export function applyDetailLevel(parts: DetailParts, level: DetailLevel): void {
  const fine = level === LOD_NEAR;
  const medium = level !== LOD_FAR;
  for (const part of parts.fine) part.visible = fine;
  for (const part of parts.medium) part.visible = medium;
  // Far players still receive the sun's light, they just do not cast into its map:
  // at that size the contact disc on the grass does the same job for nothing.
  for (const part of parts.casters) part.castShadow = medium;
}
