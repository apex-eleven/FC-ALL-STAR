import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

/**
 * The soft pool of shade under a player's feet.
 *
 * The sun already throws a hard, directional shadow through the shadow map; this is
 * the other half of how a body reads as standing ON the grass rather than hovering
 * over it — ambient occlusion where the boots meet the ground. One texture and one
 * material serve every player; each body owns only a plane that samples them.
 *
 * The plane stays on the pitch while the body lifts (a jump, a dive), which is why
 * the stage places it against the pose's `rootY` rather than leaving it a plain
 * child of the root.
 */

/** Radius on the grass, in metres, before the per-player scale. */
export const CONTACT_RADIUS = 0.42;
/** Just above the markings so it draws over them without fighting the grass. */
export const CONTACT_Y = 0.03;

const SIZE = 64;

function makeContactTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = SIZE / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.32)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

let material: MeshBasicMaterial | null = null;
let geometry: PlaneGeometry | null = null;

/** Built on first use, because the canvas needs a document. */
export function contactShadowMaterial(): MeshBasicMaterial {
  if (!material) {
    material = new MeshBasicMaterial({
      map: makeContactTexture(),
      transparent: true,
      // Never writes depth: a translucent disc that did would punch a hole in the
      // sun shadow drawn on the grass beneath it.
      depthWrite: false,
      toneMapped: false,
    });
  }
  return material;
}

export function contactShadowGeometry(): PlaneGeometry {
  if (!geometry) geometry = new PlaneGeometry(CONTACT_RADIUS * 2, CONTACT_RADIUS * 2);
  return geometry;
}
