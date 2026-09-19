import { DoubleSide } from 'three';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/features/manager/matchEngine';
import { engineToWorldX, engineToWorldZ } from './Match3DAdapter';

/**
 * The pitch and the ground around it, drawn from the same measurements the 2D
 * renderer's SVG uses so the two views can be compared line for line. Markings are
 * given in ENGINE coordinates and converted through the adapter — which is what makes
 * this component double as a check that the mapping itself is right.
 */

const GRASS_LIGHT = '#3c9a4e';
const GRASS_DARK = '#2f8a3e';
const SURROUND_COLOR = '#1b3a28';
const LINE_COLOR = '#ffffff';
/** Team colours, matching the rings the 2D renderer draws round its tokens. */
const HOME_COLOR = '#c6f23a';
const AWAY_COLOR = '#ff5b5b';

const LINE_WIDTH = 0.25;
/** Markings sit just above the grass so they never z-fight with it. */
const LINE_Y = 0.02;
const CENTRE_CIRCLE_R = 9.15;
const CENTRE_SPOT_R = 0.4;
const PENALTY_SPOT_R = 0.25;
const GOAL_HEIGHT = 2.44;
const GOAL_HALF_WIDTH = 3.66;
const POST = 0.2;

/** Mown bands, running across the pitch the way the reference shot shows them. */
const STRIPES = 12;
const STRIPE_DEPTH = PITCH_LENGTH / STRIPES;

/** How far the ground runs past the touchlines before the stands take over. */
const SURROUND_MARGIN = 34;

/** One axis-aligned marking, both ends in engine coordinates. */
function Marking({ ax, ay, bx, by }: { ax: number; ay: number; bx: number; by: number }) {
  const x0 = engineToWorldX(ay);
  const x1 = engineToWorldX(by);
  const z0 = engineToWorldZ(ax);
  const z1 = engineToWorldZ(bx);
  return (
    <mesh position={[(x0 + x1) / 2, LINE_Y, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry
        args={[Math.max(LINE_WIDTH, Math.abs(x1 - x0)), Math.max(LINE_WIDTH, Math.abs(z1 - z0))]}
      />
      <meshBasicMaterial color={LINE_COLOR} />
    </mesh>
  );
}

/** A marked rectangle, in engine coordinates. */
function MarkedBox({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  return (
    <>
      <Marking ax={x0} ay={y0} bx={x1} by={y0} />
      <Marking ax={x0} ay={y1} bx={x1} by={y1} />
      <Marking ax={x0} ay={y0} bx={x0} by={y1} />
      <Marking ax={x1} ay={y0} bx={x1} by={y1} />
    </>
  );
}

function Spot({ engineX, engineY, radius }: { engineX: number; engineY: number; radius: number }) {
  return (
    <mesh
      position={[engineToWorldX(engineY), LINE_Y, engineToWorldZ(engineX)]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[radius, 24]} />
      <meshBasicMaterial color={LINE_COLOR} />
    </mesh>
  );
}

/**
 * Posts and a crossbar. Coloured by the side that defends it, which is the quickest
 * way to see on screen that home really is at −Z and away at +Z.
 */
function Goal({ engineX, color }: { engineX: number; color: string }) {
  const z = engineToWorldZ(engineX);
  return (
    <group position={[0, 0, z]}>
      <mesh position={[-GOAL_HALF_WIDTH, GOAL_HEIGHT / 2, 0]}>
        <boxGeometry args={[POST, GOAL_HEIGHT, POST]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[GOAL_HALF_WIDTH, GOAL_HEIGHT / 2, 0]}>
        <boxGeometry args={[POST, GOAL_HEIGHT, POST]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, GOAL_HEIGHT, 0]}>
        <boxGeometry args={[GOAL_HALF_WIDTH * 2 + POST, POST, POST]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export default function Pitch3D() {
  const halfL = PITCH_LENGTH / 2;
  const ground = (halfL + SURROUND_MARGIN) * 2;

  return (
    <group>
      {/* Ground outside the pitch. */}
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ground, ground]} />
        <meshBasicMaterial color={SURROUND_COLOR} />
      </mesh>

      {/* Grass, in mown bands. */}
      {Array.from({ length: STRIPES }, (_, index) => (
        <mesh
          key={index}
          position={[0, 0, -halfL + STRIPE_DEPTH * (index + 0.5)]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[PITCH_WIDTH, STRIPE_DEPTH]} />
          {/* Lambert rather than basic: an unlit material cannot receive a shadow. */}
          <meshLambertMaterial color={index % 2 === 0 ? GRASS_LIGHT : GRASS_DARK} />
        </mesh>
      ))}

      {/* Touchlines and goal lines. */}
      <MarkedBox x0={0} y0={0} x1={PITCH_LENGTH} y1={PITCH_WIDTH} />

      {/* Halfway line, centre circle, centre spot. */}
      <Marking ax={PITCH_LENGTH / 2} ay={0} bx={PITCH_LENGTH / 2} by={PITCH_WIDTH} />
      <mesh position={[0, LINE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[CENTRE_CIRCLE_R - LINE_WIDTH / 2, CENTRE_CIRCLE_R + LINE_WIDTH / 2, 72]} />
        <meshBasicMaterial color={LINE_COLOR} side={DoubleSide} />
      </mesh>
      <Spot engineX={PITCH_LENGTH / 2} engineY={PITCH_WIDTH / 2} radius={CENTRE_SPOT_R} />

      {/* Penalty and goal areas, both ends — the 2D SVG's own numbers. */}
      <MarkedBox x0={0} y0={13.84} x1={16.5} y1={54.16} />
      <MarkedBox x0={0} y0={24.84} x1={5.5} y1={43.16} />
      <MarkedBox x0={88.5} y0={13.84} x1={PITCH_LENGTH} y1={54.16} />
      <MarkedBox x0={99.5} y0={24.84} x1={PITCH_LENGTH} y1={43.16} />
      <Spot engineX={11} engineY={PITCH_WIDTH / 2} radius={PENALTY_SPOT_R} />
      <Spot engineX={94} engineY={PITCH_WIDTH / 2} radius={PENALTY_SPOT_R} />

      <Goal engineX={0} color={HOME_COLOR} />
      <Goal engineX={PITCH_LENGTH} color={AWAY_COLOR} />
    </group>
  );
}
