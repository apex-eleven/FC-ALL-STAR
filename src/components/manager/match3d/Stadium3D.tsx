import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type InstancedMesh,
} from 'three';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/features/manager/matchEngine';

/**
 * What surrounds the pitch: hoardings, terracing, a crowd, roofs and floodlights.
 *
 * Two instanced meshes carry nearly all of it — several thousand spectators and all
 * the terracing cost one draw call each, which is what makes them affordable on a
 * phone. Spectators are boxes on purpose: from the touchline camera one is two or
 * three pixels tall, so a head would be smaller than a pixel and only the colour of
 * the shirt actually reads.
 *
 * The hoardings carry this project's own names. Nothing here may show a real brand —
 * see the asset rules in CLAUDE.md.
 */

const HALF_W = PITCH_WIDTH / 2;
const HALF_L = PITCH_LENGTH / 2;

const BOARD_OFFSET = 3;
const BOARD_HEIGHT = 1.3;
const BOARD_X = HALF_W + BOARD_OFFSET;
const BOARD_Z = HALF_L + BOARD_OFFSET;

/** The stand starts beyond the hoarding and climbs away from the pitch. */
const STAND_GAP = 5;
const STAND_DEPTH = 18;
const STAND_LOW = 1.6;
const STAND_HIGH = 13;
const STAND_COLOR = '#2b3444';
const STEP_COLOR = '#1d2431';

const INNER_X = BOARD_X + STAND_GAP;
const INNER_Z = BOARD_Z + STAND_GAP;

/** Where the stands end, and how high their back wall stands. */
const BACK_X = INNER_X + STAND_DEPTH + 1;
const BACK_Z = INNER_Z + STAND_DEPTH + 1;
const WALL_HEIGHT = STAND_HIGH + 3;

const ROOF_DEPTH = 11;
const ROOF_Y = WALL_HEIGHT + 1.4;
const ROOF_COLOR = '#11161f';

const PYLON_HEIGHT = 30;
const LAMP_COLOR = '#fff6d8';

const ROWS = 12;
const STEP_DEPTH = STAND_DEPTH / (ROWS - 1);
/** Along the row, in metres — close enough that the stand reads as full. */
const SEAT_SPACING = 1.2;
const PERSON_H = 0.78;

/** Shirts in the crowd. Muted, so nobody is mistaken for a player. */
const CROWD_COLORS = [
  '#d8dde8',
  '#9aa4b8',
  '#5d6a78',
  '#8d6b52',
  '#c0563f',
  '#3f5c86',
  '#6b7f5a',
  '#2f3542',
  '#b4a06a',
  '#7a5c7d',
];

/** Small deterministic generator, so the crowd is the same every kick-off. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rowHeight(row: number): number {
  return STAND_LOW + (row / (ROWS - 1)) * (STAND_HIGH - STAND_LOW);
}

function rowDepth(row: number): number {
  return (row / (ROWS - 1)) * STAND_DEPTH;
}

interface Seat {
  x: number;
  y: number;
  z: number;
  color: number;
  scale: number;
  /** Offsets this person's bob, so the stand shifts rather than pulses as one. */
  phase: number;
}

/**
 * Fills the four stands. Side stands run the full length of the ground and the ends
 * run its full width, so the two overlap in the corners instead of leaving a notch.
 */
function buildCrowd(): Seat[] {
  const random = makeRandom(0x5eed);
  const seats: Seat[] = [];

  const stand = (axis: 'x' | 'z', sign: 1 | -1) => {
    const inner = axis === 'x' ? INNER_X : INNER_Z;
    const span = axis === 'x' ? BACK_Z : BACK_X;
    const count = Math.floor((span * 2) / SEAT_SPACING);

    for (let row = 0; row < ROWS; row += 1) {
      const out = inner + rowDepth(row);
      const height = rowHeight(row);
      for (let seat = 0; seat < count; seat += 1) {
        // A few gaps, the way a real stand is never quite full.
        if (random() < 0.07) continue;
        const along = -span + seat * SEAT_SPACING + (random() - 0.5) * 0.4;
        const depth = (out + (random() - 0.5) * 0.4) * sign;
        seats.push({
          x: axis === 'x' ? depth : along,
          y: height + PERSON_H / 2,
          z: axis === 'x' ? along : depth,
          color: Math.floor(random() * CROWD_COLORS.length),
          scale: 0.85 + random() * 0.3,
          phase: random() * Math.PI * 2,
        });
      }
    }
  };

  stand('x', -1);
  stand('x', 1);
  stand('z', -1);
  stand('z', 1);
  return seats;
}

interface Step {
  position: [number, number, number];
  scale: [number, number, number];
}

/** The terracing itself: one solid tread per row, stepping up and away. */
function buildSteps(): Step[] {
  const steps: Step[] = [];
  for (const sign of [-1, 1] as const) {
    for (let row = 0; row < ROWS; row += 1) {
      const height = rowHeight(row);
      const out = INNER_X + rowDepth(row);
      steps.push({
        position: [sign * out, height / 2, 0],
        scale: [STEP_DEPTH, height, BACK_Z * 2],
      });
    }
  }
  for (const sign of [-1, 1] as const) {
    for (let row = 0; row < ROWS; row += 1) {
      const height = rowHeight(row);
      const out = INNER_Z + rowDepth(row);
      steps.push({
        position: [0, height / 2, sign * out],
        scale: [BACK_X * 2, height, STEP_DEPTH],
      });
    }
  }
  return steps;
}

const CROWD = buildCrowd();
const STEPS = buildSteps();

/** The hoarding artwork, drawn once into a canvas rather than shipped as a file. */
function makeBoardTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c1018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panels = ['FC ALL-STAR', 'NUMERO'];
  const width = canvas.width / panels.length;
  panels.forEach((text, index) => {
    const left = index * width;
    if (index % 2 === 1) {
      ctx.fillStyle = '#16202e';
      ctx.fillRect(left, 0, width, canvas.height);
    }
    ctx.fillStyle = index % 2 === 0 ? '#c6f23a' : '#ffffff';
    ctx.font = 'italic 900 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + width / 2, canvas.height / 2 + 2);
  });

  // A lit strip along the bottom, which is what makes it read as a hoarding.
  ctx.fillStyle = 'rgba(198, 242, 58, 0.55)';
  ctx.fillRect(0, canvas.height - 10, canvas.width, 10);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Metres of hoarding the artwork travels each second, as an LED ribbon would. */
const BOARD_SCROLL = 2.4;

/**
 * One hoarding. `length` decides how many times the artwork repeats along it, and
 * `facing` turns its front towards the pitch — a plane's face points down +Z, and a
 * board read from behind is a board with its wording mirrored.
 */
function Board({
  position,
  length,
  facing,
  texture,
}: {
  position: [number, number, number];
  length: number;
  facing: number;
  texture: CanvasTexture;
}) {
  const own = useMemo(() => {
    const copy = texture.clone();
    copy.needsUpdate = true;
    copy.wrapS = RepeatWrapping;
    copy.repeat.set(Math.max(1, Math.round(length / 12)), 1);
    return copy;
  }, [texture, length]);

  useFrame((_, delta) => {
    own.offset.x = (own.offset.x + (delta * BOARD_SCROLL) / 12) % 1;
  });

  return (
    <mesh position={position} rotation={[0, facing, 0]}>
      <planeGeometry args={[length, BOARD_HEIGHT]} />
      <meshBasicMaterial map={own} side={DoubleSide} />
    </mesh>
  );
}

/** A floodlight in one corner: a mast with a lit panel on top. */
function Pylon({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, PYLON_HEIGHT / 2, 0]}>
        <boxGeometry args={[1.1, PYLON_HEIGHT, 1.1]} />
        <meshLambertMaterial color={STEP_COLOR} />
      </mesh>
      <mesh position={[0, PYLON_HEIGHT + 1.4, 0]} rotation={[0, Math.atan2(-x, -z), 0]}>
        <boxGeometry args={[8, 3.2, 0.6]} />
        <meshBasicMaterial color={LAMP_COLOR} />
      </mesh>
    </group>
  );
}

/** How often the crowd's bob is rewritten. Far cheaper than every frame, and at this
 *  distance the difference is invisible. */
const CROWD_TICK = 1 / 15;

export default function Stadium3D() {
  const crowd = useRef<InstancedMesh>(null);
  const steps = useRef<InstancedMesh>(null);
  const since = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const texture = useMemo(() => makeBoardTexture(), []);

  useLayoutEffect(() => {
    const color = new Color();

    const crowdMesh = crowd.current;
    if (crowdMesh) {
      for (let index = 0; index < CROWD.length; index += 1) {
        const seat = CROWD[index]!;
        dummy.position.set(seat.x, seat.y, seat.z);
        dummy.scale.set(1, seat.scale, 1);
        dummy.updateMatrix();
        crowdMesh.setMatrixAt(index, dummy.matrix);
        crowdMesh.setColorAt(index, color.set(CROWD_COLORS[seat.color]!));
      }
      crowdMesh.instanceMatrix.needsUpdate = true;
      if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
    }

    const stepMesh = steps.current;
    if (stepMesh) {
      for (let index = 0; index < STEPS.length; index += 1) {
        const step = STEPS[index]!;
        dummy.position.set(...step.position);
        dummy.scale.set(...step.scale);
        dummy.updateMatrix();
        stepMesh.setMatrixAt(index, dummy.matrix);
      }
      stepMesh.instanceMatrix.needsUpdate = true;
    }
  }, [dummy]);

  // The stand never sits perfectly still, so it shifts gently and out of step.
  useFrame(({ clock }, delta) => {
    since.current += delta;
    if (since.current < CROWD_TICK) return;
    since.current = 0;

    const mesh = crowd.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    for (let index = 0; index < CROWD.length; index += 1) {
      const seat = CROWD[index]!;
      dummy.position.set(seat.x, seat.y + Math.sin(time * 2.1 + seat.phase) * 0.07, seat.z);
      dummy.scale.set(1, seat.scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const sideLength = BACK_Z * 2;
  const endLength = BOARD_X * 2;

  return (
    <group>
      {/* Terracing, then the back of each stand so the view stops at the stadium. */}
      <instancedMesh ref={steps} args={[undefined, undefined, STEPS.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={STEP_COLOR} />
      </instancedMesh>

      {([-1, 1] as const).map((sign) => (
        <mesh key={`side${sign}`} position={[sign * BACK_X, WALL_HEIGHT / 2, 0]}>
          <boxGeometry args={[1, WALL_HEIGHT, BACK_Z * 2]} />
          <meshLambertMaterial color={STAND_COLOR} />
        </mesh>
      ))}
      {([-1, 1] as const).map((sign) => (
        <mesh key={`end${sign}`} position={[0, WALL_HEIGHT / 2, sign * BACK_Z]}>
          <boxGeometry args={[BACK_X * 2, WALL_HEIGHT, 1]} />
          <meshLambertMaterial color={STAND_COLOR} />
        </mesh>
      ))}

      {/* Roofs, reaching in over the back rows. */}
      {([-1, 1] as const).map((sign) => (
        <mesh key={`sideRoof${sign}`} position={[sign * (BACK_X - ROOF_DEPTH / 2), ROOF_Y, 0]}>
          <boxGeometry args={[ROOF_DEPTH, 0.7, BACK_Z * 2]} />
          <meshLambertMaterial color={ROOF_COLOR} />
        </mesh>
      ))}
      {([-1, 1] as const).map((sign) => (
        <mesh key={`endRoof${sign}`} position={[0, ROOF_Y, sign * (BACK_Z - ROOF_DEPTH / 2)]}>
          <boxGeometry args={[BACK_X * 2, 0.7, ROOF_DEPTH]} />
          <meshLambertMaterial color={ROOF_COLOR} />
        </mesh>
      ))}

      {/* Everyone in them, in one draw call. */}
      <instancedMesh ref={crowd} args={[undefined, undefined, CROWD.length]} frustumCulled={false}>
        <boxGeometry args={[0.42, PERSON_H, 0.38]} />
        <meshLambertMaterial />
      </instancedMesh>

      <Pylon x={-BACK_X} z={-BACK_Z} />
      <Pylon x={BACK_X} z={-BACK_Z} />
      <Pylon x={-BACK_X} z={BACK_Z} />
      <Pylon x={BACK_X} z={BACK_Z} />

      {/* Hoardings. */}
      <Board
        position={[-BOARD_X, BOARD_HEIGHT / 2, 0]}
        length={sideLength}
        facing={Math.PI / 2}
        texture={texture}
      />
      <Board
        position={[BOARD_X, BOARD_HEIGHT / 2, 0]}
        length={sideLength}
        facing={-Math.PI / 2}
        texture={texture}
      />
      <Board
        position={[0, BOARD_HEIGHT / 2, -BOARD_Z]}
        length={endLength}
        facing={0}
        texture={texture}
      />
      <Board
        position={[0, BOARD_HEIGHT / 2, BOARD_Z]}
        length={endLength}
        facing={Math.PI}
        texture={texture}
      />
    </group>
  );
}
