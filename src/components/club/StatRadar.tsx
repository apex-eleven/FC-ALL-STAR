import { FACE_STATS, type FaceStat } from '@/features/squad/stats';
import styles from './StatRadar.module.css';

export interface StatRadarProps {
  /** The card in the slot. null for an empty slot. */
  values: Record<FaceStat, number> | null;
  /** The card being compared, drawn as an outline over the first. */
  compare: Record<FaceStat, number> | null;
}

/** Radius of the backing disc and of a maxed stat, in design pixels. */
const RADIUS = 90;
/** Box the whole radar is drawn in; the centre is its middle. */
const WIDTH = 420;
const HEIGHT = 320;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

/**
 * Label and number centres relative to the radar centre, measured off the reference
 * (radar centre 570,251 on the stage). Radar order: shooting, passing, dribbling,
 * defending, physical, pace.
 */
const PLACES: readonly { label: [number, number]; value: [number, number] }[] = [
  { label: [0, -126], value: [0, -97] },
  { label: [136, -53], value: [114, -23] },
  { label: [139, 42], value: [113, 72] },
  { label: [0, 112], value: [0, 142] },
  { label: [-137, 42], value: [-117, 72] },
  { label: [-119, -53], value: [-113, -23] },
];

// Vertices start at the top and go clockwise, one every 60°.
const ANGLES = FACE_STATS.map((_, index) => (-90 + index * 60) * (Math.PI / 180));

function point(angle: number, radius: number): [number, number] {
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius];
}

function polygon(radii: readonly number[]): string {
  return radii.map((radius, index) => point(ANGLES[index]!, radius).join(',')).join(' ');
}

/**
 * The six-stat hexagon from the swap screen: labels and numbers round the outside,
 * the card's shape in green, and a compared card as an orange outline on top.
 */
export default function StatRadar({ values, compare }: StatRadarProps) {
  // Scaled to the largest number shown, never below 230 — the reference's 216
  // defending sits just inside the rim.
  const shown = [values, compare].flatMap((set) => (set ? Object.values(set) : []));
  const max = Math.max(230, ...shown.map((value) => value * 1.06));
  const radii = (set: Record<FaceStat, number>) =>
    FACE_STATS.map(({ key }) => Math.max(4, (set[key] / max) * RADIUS));

  return (
    <div className={styles.radar} style={{ width: WIDTH, height: HEIGHT }}>
      <svg className={styles.svg} width={WIDTH} height={HEIGHT} aria-hidden="true">
        <circle className={styles.base} cx={CX} cy={CY} r={RADIUS} />
        {ANGLES.map((angle, index) => {
          const [x, y] = point(angle, RADIUS);
          return <line key={index} className={styles.spoke} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
        {values && <polygon className={styles.shape} points={polygon(radii(values))} />}
        {compare && <polygon className={styles.compare} points={polygon(radii(compare))} />}
      </svg>

      {FACE_STATS.map(({ key, label }, index) => {
        const place = PLACES[index]!;
        const diff = values && compare ? compare[key] - values[key] : 0;

        return (
          <span key={key}>
            <span
              className={styles.label}
              style={{ left: CX + place.label[0], top: CY + place.label[1] }}
            >
              {label}
            </span>
            <span
              className={styles.value}
              style={{ left: CX + place.value[0], top: CY + place.value[1] }}
            >
              {values ? values[key] : compare ? compare[key] : ''}
              {values && compare && (
                <small className={diff >= 0 ? styles.up : styles.down}>
                  {diff >= 0 ? `+${diff}` : diff}
                </small>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}
