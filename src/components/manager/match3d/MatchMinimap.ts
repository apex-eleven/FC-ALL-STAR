/**
 * The minimap under the play, after the live-match reference: the whole pitch seen from
 * above, the far touchline at the top (as the broadcast camera sees it) and the home
 * side attacking to the right. The home side are white discs, the away side dark
 * triangles with a white edge, and the ball a yellow cross.
 *
 * Plain canvas 2D, drawn once a frame from the adapter's interpolated positions — so it
 * moves with the drawn players, not a step ahead of them. Measured on the reference
 * (2048 x 942 stage): 375 x 220 px, discs 16 px across, triangles 19 px a side, the
 * cross 20 px, lines at half opacity.
 */

const LENGTH = 105;
const WIDTH = 68;
const HALF_LENGTH = LENGTH / 2;
const HALF_WIDTH = WIDTH / 2;

export interface MinimapPlayer {
  /** World position (X across the pitch, Z along it). */
  x: number;
  z: number;
  home: boolean;
}

/** Stage pixels → canvas pixels. The canvas is drawn at twice the stage size so it stays sharp. */
export const MINIMAP_RESOLUTION = 2;

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  players: Iterable<MinimapPlayer>,
  ballX: number,
  ballZ: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const k = MINIMAP_RESOLUTION;
  const pad = 1.5 * k;
  const sx = (w - pad * 2) / LENGTH;
  const sy = (h - pad * 2) / WIDTH;
  // World Z (along) runs left to right; world X (across) runs bottom (near) to top (far).
  const px = (z: number) => pad + (z + HALF_LENGTH) * sx;
  const py = (x: number) => pad + (HALF_WIDTH - x) * sy;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0, 18, 0, 0.3)';
  ctx.fillRect(0, 0, w, h);

  // Markings.
  ctx.strokeStyle = 'rgba(236, 236, 236, 0.5)';
  ctx.lineWidth = 1.3 * k;
  ctx.beginPath();
  ctx.rect(px(-HALF_LENGTH), py(HALF_WIDTH), LENGTH * sx, WIDTH * sy);
  ctx.moveTo(px(0), py(HALF_WIDTH));
  ctx.lineTo(px(0), py(-HALF_WIDTH));
  for (const end of [-1, 1]) {
    const line = end * HALF_LENGTH;
    for (const [depth, half] of [
      [16.5, 20.16],
      [5.5, 9.16],
    ] as const) {
      ctx.moveTo(px(line), py(half));
      ctx.lineTo(px(line - end * depth), py(half));
      ctx.lineTo(px(line - end * depth), py(-half));
      ctx.lineTo(px(line), py(-half));
    }
  }
  ctx.stroke();
  // Centre circle and the two D's (radius 9.15 m; the D is the part outside the box).
  ctx.beginPath();
  ctx.ellipse(px(0), py(0), 9.15 * sx, 9.15 * sy, 0, 0, Math.PI * 2);
  ctx.stroke();
  const dAngle = Math.acos(5.5 / 9.15);
  for (const end of [-1, 1]) {
    ctx.beginPath();
    const facing = end > 0 ? Math.PI : 0;
    ctx.ellipse(px(end * (HALF_LENGTH - 11)), py(0), 9.15 * sx, 9.15 * sy, 0, facing - dAngle, facing + dAngle);
    ctx.stroke();
  }

  // Players: away (triangles) first, so the home side reads on top where they meet.
  for (const pass of [false, true]) {
    for (const player of players) {
      if (player.home !== pass) continue;
      const cx = px(player.z);
      const cy = py(player.x);
      if (player.home) {
        ctx.beginPath();
        ctx.arc(cx, cy, 8 * k, 0, Math.PI * 2);
        ctx.fillStyle = '#eeeeee';
        ctx.fill();
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = 'rgba(120, 120, 120, 0.85)';
        ctx.stroke();
      } else {
        const r = 11 * k;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
        ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
        ctx.closePath();
        ctx.fillStyle = '#262a3c';
        ctx.fill();
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
  }

  // The ball: a yellow cross with a dark edge.
  const bx = px(ballZ);
  const by = py(ballX);
  const arm = 10 * k;
  const bar = 3.4 * k;
  ctx.beginPath();
  ctx.rect(bx - arm, by - bar, arm * 2, bar * 2);
  ctx.rect(bx - bar, by - arm, bar * 2, arm * 2);
  ctx.lineWidth = 2.4 * k;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  ctx.fillStyle = '#ffe11a';
  ctx.fillRect(bx - arm, by - bar, arm * 2, bar * 2);
  ctx.fillRect(bx - bar, by - arm, bar * 2, arm * 2);
}
