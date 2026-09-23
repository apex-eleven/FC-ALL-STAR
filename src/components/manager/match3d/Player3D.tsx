import { memo } from 'react';
import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  MeshLambertMaterial,
  SphereGeometry,
  type Group,
  type Mesh,
  type Object3D,
} from 'three';
import type { HairStyle, PlayerAppearance } from './PlayerAppearance';
import { makeDetailParts, type DetailLevel, type DetailParts } from './PlayerLOD';
import { contactShadowGeometry, contactShadowMaterial } from './PlayerShadow';

/**
 * One footballer, built from primitives on a joint hierarchy:
 *
 *   root ─ pelvis ─┬─ hip ─ thigh ─ knee ─ calf ─ ankle ─ boot        (× 2)
 *                  └─ spine ─┬─ chest, collar
 *                            ├─ neck ─ head ─ face, hair
 *                            └─ shoulder ─ upper arm ─ elbow ─ forearm ─ hand   (× 2)
 *
 * Proportions are a real adult's, roughly 1.80 m at about seven and a half heads,
 * so the silhouette reads as a person from the gameplay camera rather than as a
 * mascot. The torso is an elliptical cylinder rather than a box so it has a front, a
 * side and a top that the sun lights differently; the limbs are capsules for the
 * same reason. The `PlayerAppearance` scales the build, the limbs and the whole
 * body, and picks every colour.
 *
 * Every geometry and every material is shared by all twenty-two players: the parts
 * below are the only ones that exist, whatever the squad looks like. Nothing here
 * animates itself — the stage writes the joint rotations each frame, so this file
 * stays a body and not a controller.
 */

/** Hip height, before the leg-length scale. Everything else is measured from it. */
export const HIP_Y = 0.95;
/** Top of the head, standing, before the body scale. */
export const BODY_TOP = 1.8;

const G = {
  pelvis: new BoxGeometry(0.3, 0.17, 0.2),
  shortsLeg: new CylinderGeometry(0.09, 0.1, 0.19, 10),
  // Elliptical cylinders: round enough to shade, flat enough to read as a torso.
  abdomen: new CylinderGeometry(0.15, 0.145, 0.22, 12),
  chest: new CylinderGeometry(0.2, 0.16, 0.32, 12),
  shoulder: new SphereGeometry(0.06, 10, 8),
  collar: new CylinderGeometry(0.078, 0.078, 0.03, 10),
  neck: new CylinderGeometry(0.045, 0.052, 0.09, 8),
  head: new SphereGeometry(0.105, 14, 12),
  // Caps of a sphere a shade bigger than the head, open at the face: how far down
  // they reach is what separates a crop from a mop.
  hairShort: new SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hairBuzz: new SphereGeometry(0.108, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.8),
  nose: new SphereGeometry(0.018, 6, 5),
  eye: new SphereGeometry(0.012, 6, 5),
  upperArm: new CapsuleGeometry(0.05, 0.2, 3, 8),
  cuff: new CylinderGeometry(0.054, 0.054, 0.03, 8),
  forearm: new CapsuleGeometry(0.043, 0.17, 3, 8),
  hand: new SphereGeometry(0.05, 8, 6),
  glove: new SphereGeometry(0.062, 8, 6),
  thigh: new CapsuleGeometry(0.075, 0.3, 3, 8),
  calf: new CapsuleGeometry(0.058, 0.3, 3, 8),
  sockTop: new CylinderGeometry(0.064, 0.064, 0.05, 8),
  boot: new BoxGeometry(0.1, 0.07, 0.26),
  sole: new BoxGeometry(0.106, 0.018, 0.27),
};

const SOLE_COLOR = '#0c0e12';
const EYE_COLOR = '#151210';

/** One material per colour, reused across the whole pitch. */
const materials = new Map<string, MeshLambertMaterial>();

function mat(color: string): MeshLambertMaterial {
  let found = materials.get(color);
  if (!found) {
    found = new MeshLambertMaterial({ color });
    materials.set(color, found);
  }
  return found;
}

/** The joints the stage drives. Kept as plain fields so no frame allocates. */
export interface PlayerRig {
  root: Group | null;
  /** The chest and everything it carries, for leaning and twisting the upper body. */
  spine: Group | null;
  /** The head, for looking at the ball. */
  neck: Group | null;
  hipL: Group | null;
  hipR: Group | null;
  kneeL: Group | null;
  kneeR: Group | null;
  ankleL: Group | null;
  ankleR: Group | null;
  shoulderL: Group | null;
  shoulderR: Group | null;
  elbowL: Group | null;
  elbowR: Group | null;
  /** The soft shadow on the grass. Sits beside the body, not under it, so it never lifts. */
  contact: Mesh | null;
  /** What each level of detail switches. */
  parts: DetailParts;
  /** The level currently applied, so the flags are only rewritten on a change. */
  lod: DetailLevel | -1;
  /** Stride position, advanced by the stage from the engine's speed and the render clock. */
  phase: number;
  /**
   * The heading the body is drawn at. Normally the adapter's smoothed engine facing;
   * a celebration turns it to the camera. Position, velocity and speed are not kept
   * here — they come from `PlayerVisualAdapter`, never from frame-to-frame deltas.
   */
  heading: number;
  /** How fast they are turning, smoothed, so the body can lean into it. */
  turning: number;
  /** Where the head is pointed, smoothed, so it does not snap between targets. */
  lookY: number;
}

export function makeRig(): PlayerRig {
  return {
    root: null,
    spine: null,
    neck: null,
    hipL: null,
    hipR: null,
    kneeL: null,
    kneeR: null,
    ankleL: null,
    ankleR: null,
    shoulderL: null,
    shoulderR: null,
    elbowL: null,
    elbowR: null,
    contact: null,
    parts: makeDetailParts(),
    lod: -1,
    phase: 0,
    heading: 0,
    turning: 0,
    lookY: 0,
  };
}

export interface Player3DProps {
  rig: PlayerRig;
  appearance: PlayerAppearance;
}

type Side = -1 | 1;

/** Registers a part with a detail group. Idempotent, because refs fire on re-attach. */
function register(list: Object3D[], node: Object3D | null): void {
  if (node && !list.includes(node)) list.push(node);
}

/** An arm, from the shoulder down. `side` is −1 for the left, +1 for the right. */
function Arm({ rig, appearance, side }: Player3DProps & { side: Side }) {
  const { kit, keeper, build, armLength } = appearance;
  // Keepers wear long sleeves and gloves; everyone else is bare from the elbow.
  const forearm = keeper ? kit.shirt : appearance.skin;
  const upper = 0.2 * armLength;
  const lower = 0.17 * armLength;
  return (
    <group
      position={[(0.19 * build + 0.012) * side, 0.265, 0]}
      ref={(node) => {
        if (side < 0) rig.shoulderL = node;
        else rig.shoulderR = node;
      }}
    >
      <mesh geometry={G.shoulder} material={mat(kit.shirt)} />
      <mesh
        geometry={G.upperArm}
        material={mat(kit.shirt)}
        position={[0, -upper * 0.75, 0]}
        scale={[1, armLength, 1]}
      />
      {!keeper && (
        <mesh
          geometry={G.cuff}
          material={mat(kit.trim)}
          position={[0, -upper * 1.35, 0]}
          ref={(node) => register(rig.parts.fine, node)}
        />
      )}
      <group
        position={[0, -upper * 1.5, 0]}
        ref={(node) => {
          if (side < 0) rig.elbowL = node;
          else rig.elbowR = node;
        }}
      >
        <mesh
          geometry={G.forearm}
          material={mat(forearm)}
          position={[0, -lower * 0.75, 0]}
          scale={[1, armLength, 1]}
        />
        {keeper ? (
          <mesh
            geometry={G.glove}
            material={mat(appearance.gloves ?? '#f4f4f4')}
            position={[0, -lower * 1.7, 0.01]}
            ref={(node) => register(rig.parts.medium, node)}
          />
        ) : (
          <mesh
            geometry={G.hand}
            material={mat(appearance.skin)}
            position={[0, -lower * 1.7, 0]}
            ref={(node) => register(rig.parts.medium, node)}
          />
        )}
      </group>
    </group>
  );
}

/** A leg, from the hip down. The shorts leg rides on the thigh so it moves with it. */
function Leg({ rig, appearance, side }: Player3DProps & { side: Side }) {
  const { kit, legLength } = appearance;
  const thigh = 0.45 * legLength;
  const shin = 0.43 * legLength;
  return (
    <group
      position={[0.095 * side, -0.02, 0]}
      ref={(node) => {
        if (side < 0) rig.hipL = node;
        else rig.hipR = node;
      }}
    >
      <mesh geometry={G.shortsLeg} material={mat(kit.shorts)} position={[0, -0.09, 0]} />
      <mesh
        geometry={G.thigh}
        material={mat(appearance.skin)}
        position={[0, -thigh * 0.55, 0]}
        scale={[1, legLength, 1]}
      />
      <group
        position={[0, -thigh, 0]}
        ref={(node) => {
          if (side < 0) rig.kneeL = node;
          else rig.kneeR = node;
        }}
      >
        <mesh
          geometry={G.calf}
          material={mat(kit.socks)}
          position={[0, -shin * 0.5, 0]}
          scale={[1, legLength, 1]}
        />
        <mesh
          geometry={G.sockTop}
          material={mat(kit.trim)}
          position={[0, -0.07, 0]}
          ref={(node) => register(rig.parts.fine, node)}
        />
        <group
          position={[0, -shin, 0]}
          ref={(node) => {
            if (side < 0) rig.ankleL = node;
            else rig.ankleR = node;
          }}
        >
          <mesh geometry={G.boot} material={mat(appearance.boots)} position={[0, -0.035, 0.06]} />
          <mesh
            geometry={G.sole}
            material={mat(SOLE_COLOR)}
            position={[0, -0.075, 0.06]}
            ref={(node) => register(rig.parts.fine, node)}
          />
        </group>
      </group>
    </group>
  );
}

function Hair({ rig, appearance }: Player3DProps) {
  const style: HairStyle = appearance.hairStyle;
  if (style === 'bald') return null;
  const geometry = style === 'long' ? G.hairLong : style === 'buzz' ? G.hairBuzz : G.hairShort;
  return (
    <mesh
      geometry={geometry}
      material={mat(appearance.hair)}
      position={[0, style === 'long' ? 0.108 : 0.118, -0.012]}
      scale={[0.96, style === 'buzz' ? 1.0 : 0.98, 1.02]}
      ref={(node) => register(rig.parts.medium, node)}
    />
  );
}

/** Nose and eyes: tiny, but they are what makes a head face somewhere. */
function Face({ rig, appearance }: Player3DProps) {
  const fine = (node: Object3D | null) => register(rig.parts.fine, node);
  return (
    <>
      <mesh geometry={G.nose} material={mat(appearance.skin)} position={[0, 0.088, 0.1]} ref={fine} />
      <mesh geometry={G.eye} material={mat(EYE_COLOR)} position={[-0.036, 0.115, 0.088]} ref={fine} />
      <mesh geometry={G.eye} material={mat(EYE_COLOR)} position={[0.036, 0.115, 0.088]} ref={fine} />
    </>
  );
}

/**
 * Memoised: the live screen re-renders its React tree several times a second for
 * the scoreboard, and a body whose rig and appearance have not changed has nothing
 * to reconcile — the joints are written directly by the stage each frame.
 */
const Player3D = memo(function Player3D({ rig, appearance }: Player3DProps) {
  const { kit, build, stature, legLength } = appearance;
  const hipY = HIP_Y * legLength;

  return (
    <>
      <group
        scale={[stature, stature, stature]}
        ref={(node) => {
          rig.root = node;
          if (!node) return;
          // Every mesh casts, set in one place rather than repeated on thirty parts.
          // The LOD lowers the flag again for players too far away to matter.
          node.traverse((part) => {
            if ((part as Mesh).isMesh) {
              part.castShadow = true;
              register(rig.parts.casters, part);
            }
          });
        }}
      >
        {/* Pelvis — the root of the body, everything else hangs off it. */}
        <group position={[0, hipY, 0]}>
          <mesh geometry={G.pelvis} material={mat(kit.shorts)} scale={[build, 1, 1]} />
          <Leg rig={rig} appearance={appearance} side={-1} />
          <Leg rig={rig} appearance={appearance} side={1} />

          {/* Waist, then the chest and everything it carries. */}
          <mesh
            geometry={G.abdomen}
            material={mat(kit.shirt)}
            position={[0, 0.16, 0]}
            scale={[build, 1, 0.68]}
          />
          <group
            position={[0, 0.24, 0]}
            ref={(node) => {
              rig.spine = node;
            }}
          >
            <mesh
              geometry={G.chest}
              material={mat(kit.shirt)}
              position={[0, 0.15, 0]}
              scale={[build, 1, 0.62]}
            />
            <mesh
              geometry={G.collar}
              material={mat(kit.trim)}
              position={[0, 0.315, 0]}
              ref={(node) => register(rig.parts.fine, node)}
            />
            <group position={[0, 0.32, 0]}>
              <mesh geometry={G.neck} material={mat(appearance.skin)} position={[0, 0.04, 0]} />
              <group
                position={[0, 0.085, 0]}
                ref={(node) => {
                  rig.neck = node;
                }}
              >
                <mesh
                  geometry={G.head}
                  material={mat(appearance.skin)}
                  position={[0, 0.1, 0]}
                  scale={[0.92, 1.12, 1]}
                />
                <Hair rig={rig} appearance={appearance} />
                <Face rig={rig} appearance={appearance} />
              </group>
            </group>
            <Arm rig={rig} appearance={appearance} side={-1} />
            <Arm rig={rig} appearance={appearance} side={1} />
          </group>
        </group>
      </group>

      {/* The contact shadow lives outside the body so a jump leaves it on the grass. */}
      <mesh
        geometry={contactShadowGeometry()}
        material={contactShadowMaterial()}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[stature * build, stature, 1]}
        renderOrder={1}
        ref={(node) => {
          rig.contact = node;
        }}
      />
    </>
  );
});

export default Player3D;
