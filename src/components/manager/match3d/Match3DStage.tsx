import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Vector3, type DirectionalLight, type Mesh } from 'three';
import type { MatchEngine } from '@/features/manager/matchEngine';
import Pitch3D from './Pitch3D';
import Stadium3D from './Stadium3D';
import Player3D, { BODY_TOP, makeRig, type PlayerRig } from './Player3D';
import { appearanceOf } from './PlayerAppearance';
import { applyDetailLevel, levelForDistance } from './PlayerLOD';
import { CONTACT_Y } from './PlayerShadow';
import {
  ACTION_SECONDS,
  ActionWatcher,
  actionHoldsHead,
  actionPose,
  actionWeight,
  blendPose,
  makePose,
  stridePose,
  type ActionTrigger,
  type PlayerAction,
  type Pose,
} from './AnimationController';
import {
  bounceHeight,
  engineToWorldX,
  engineToWorldZ,
  flightHeight,
  shotEndHeight,
} from './Match3DAdapter';
import styles from './Match3DStage.module.css';

/**
 * A read-only 3D view of a match that is already running.
 *
 * It renders the SAME `MatchEngine` instance the 2D screen owns and never calls
 * `step()` — there is one simulation and this is a second way of looking at it.
 *
 * The camera is the broadcast one from the reference shot: low, outside the near
 * touchline, panning along the pitch rather than looking down on it. Facing, strides
 * and the passing, shooting, tackling and diving are all read off what the engine
 * already publishes, so it is never asked for anything new.
 */

export interface Match3DStageProps {
  engine: MatchEngine;
}

/** Set true to bring back the coordinate read-out used to prove the mapping. */
const SHOW_DEBUG = false;

/**
 * A long lens, which is what a televised match is shot on: it sits the camera well
 * back outside the touchline and still fills the frame with the players, and it
 * flattens the pitch the way the reference shot is flattened.
 */
const CAMERA_FOV = 26;
/** Outside the touchline (−34) and low, the way a touchline camera sits. */
const CAMERA_X = -44;
const CAMERA_Y = 11;
/** How much of the ball's across-pitch position the camera leans into. */
const CAMERA_LEAN = 0.15;
/** Bigger follows harder; the ball is quick and an undamped camera is unwatchable. */
const FOLLOW = 2.4;
/** Chest height, so the players sit in the middle of the frame. */
const LOOK_HEIGHT = 1.4;
/**
 * How far along the touchline the camera may slide. A televised match is shot from
 * one position near the halfway line that pans to the corners rather than running
 * along with the ball, and panning keeps the pitch in frame where tracking does not.
 */
const CAMERA_RAIL = 22;

const BALL_RADIUS = 0.15;
/** Roughly a sprint, in metres a second — the stride runs at full tilt here. */
const TOP_SPEED = 8;
/**
 * Below this they are not running anywhere, they are shuffling, and the direction of
 * a shuffle is noise: the engine nudges a player a few millimetres towards a mark
 * that itself moves with the ball, which flips the heading by up to a right angle
 * from one frame to the next. Under it they turn to watch the ball instead.
 */
const RUN_SPEED = 1.2;
/** Nobody spins on the spot. Radians a second. */
const TURN_RATE = 5.5;
/** How hard the velocity average pulls towards the latest frame. Higher is twitchier. */
const VELOCITY_EASE = 5;
/** A jump this big in one frame is the engine placing them, not a run. */
const TELEPORT = 1.5;
/** Metres covered per full two-step cycle, walking and flat out. */
const STRIDE_WALK = 1.5;
const STRIDE_RUN = 3.3;
/** How far the head will turn to follow the ball, either way. Radians. */
const LOOK_LIMIT = 1.1;
/** How quickly the gaze settles on a new target. */
const LOOK_EASE = 6;
/** How much a runner leans into a turn: radians of lean per radian a second. */
const TURN_LEAN = 0.04;

const MARKER_COLOR = '#38e8ff';

/** How hard a loose ball bounces once it lands, in metres. */
const SETTLE_ENERGY = 0.34;
/** The sun follows the ball at this height; its shadow map covers SHADOW_SPAN. */
const SUN_HEIGHT = 46;
const SHADOW_SPAN = 34;

interface ActionState {
  kind: PlayerAction | null;
  elapsed: number;
  delay: number;
  dir: number;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.length > 12 ? `${last.slice(0, 11)}…` : last;
}

/** Shortest signed way round from one angle to another. */
function angleTo(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

interface SceneProps extends Match3DStageProps {
  label: React.RefObject<HTMLDivElement>;
}

/**
 * Writes a pose onto a rig's joints. This is the one place the pose's "positive is
 * forward, positive is folded" convention meets three's rotation axes: the player
 * faces local +Z, so a forward swing is a NEGATIVE turn about X, and an arm held
 * out from the body turns about Z away from the body's centre.
 */
function applyPose(rig: PlayerRig, pose: Pose, lookY: number): void {
  if (rig.spine) rig.spine.rotation.set(pose.spineX, pose.twist, pose.spineZ);
  if (rig.neck) rig.neck.rotation.set(pose.neckX, lookY + pose.neckY, 0);
  if (rig.hipL) rig.hipL.rotation.set(-pose.hipL, 0, pose.spreadL);
  if (rig.hipR) rig.hipR.rotation.set(-pose.hipR, 0, pose.spreadR);
  if (rig.kneeL) rig.kneeL.rotation.x = pose.kneeL;
  if (rig.kneeR) rig.kneeR.rotation.x = pose.kneeR;
  if (rig.ankleL) rig.ankleL.rotation.x = pose.ankleL;
  if (rig.ankleR) rig.ankleR.rotation.x = pose.ankleR;
  if (rig.shoulderL) rig.shoulderL.rotation.set(-pose.shoulderL, 0, -pose.armOutL);
  if (rig.shoulderR) rig.shoulderR.rotation.set(-pose.shoulderR, 0, pose.armOutR);
  if (rig.elbowL) rig.elbowL.rotation.x = -pose.elbowL;
  if (rig.elbowR) rig.elbowR.rotation.x = -pose.elbowR;
}

/**
 * Everything that moves. Positions and joint angles are written straight onto the
 * three objects each frame — no React state, exactly as the 2D renderer writes
 * transforms onto its DOM nodes.
 */
function MatchObjects({ engine, label }: SceneProps) {
  const rigs = useRef<PlayerRig[]>([]);
  const actions = useRef<ActionState[]>([]);
  const ball = useRef<Mesh>(null);
  const sun = useRef<DirectionalLight>(null);
  const lastBall = useRef({ x: 0, z: 0 });
  const marker = useRef<Mesh>(null);
  /** The flight being drawn, the height it is aimed at, and the settle after it. */
  const flightSeen = useRef<object | null>(null);
  const aimedAt = useRef(BALL_RADIUS);
  const settling = useRef(false);
  const settled = useRef(0);
  const look = useRef(new Vector3(0, LOOK_HEIGHT, 0));
  const project = useRef(new Vector3());

  // Reused every frame so a match never allocates in its own loop.
  const watcher = useRef(new ActionWatcher());
  const triggers = useRef<ActionTrigger[]>([]);
  const strideOut = useRef(makePose());
  const actionOut = useRef(makePose());
  const finalOut = useRef(makePose());

  const rigAt = (index: number): PlayerRig => {
    const found = rigs.current[index];
    if (found) return found;
    const made = makeRig();
    rigs.current[index] = made;
    return made;
  };

  // Faces and kits are settled once: the same card always turns out the same.
  const appearances = useMemo(
    () => engine.players.map((player) => appearanceOf(player.id, player.side, player.keeper)),
    [engine],
  );

  useFrame(({ camera }, delta) => {
    const live = engine.players;
    const ballX = engineToWorldX(engine.ball.y);
    const ballZ = engineToWorldZ(engine.ball.x);

    // Who just passed, shot, won it or went full length.
    watcher.current.poll(engine, triggers.current);
    for (const trigger of triggers.current) {
      const index = live.findIndex((player) => player.id === trigger.playerId);
      if (index < 0) continue;
      let state = actions.current[index];
      if (!state) {
        state = { kind: null, elapsed: 0, delay: 0, dir: 1 };
        actions.current[index] = state;
      }
      state.kind = trigger.kind;
      state.elapsed = 0;
      state.delay = trigger.delay;
      state.dir = trigger.dir;
    }

    for (let index = 0; index < live.length; index += 1) {
      const player = live[index];
      const rig = rigs.current[index];
      const root = rig?.root;
      const appearance = appearances[index];
      if (!player || !rig || !root || !appearance) continue;
      const state = actions.current[index];
      const acting = state?.kind && state.delay <= 0 ? state.kind : null;

      const x = engineToWorldX(player.y);
      const z = engineToWorldZ(player.x);
      const dx = x - rig.lastX;
      const dz = z - rig.lastZ;
      rig.lastX = x;
      rig.lastZ = z;

      const travelled = Math.hypot(dx, dz);
      // The engine sometimes places a player rather than moving them — at kick-off,
      // or a keeper collecting a shot. That is not a run and must not be read as one.
      const placed = travelled > TELEPORT;

      if (placed) {
        rig.vx = 0;
        rig.vz = 0;
      } else if (delta > 0) {
        // Average the velocity. Raw frame-to-frame direction reverses by up to a
        // half-turn while the speed still reads like a sprint, because the engine
        // stops a player the moment they reach a mark that is itself moving.
        const ease = Math.min(1, delta * VELOCITY_EASE);
        rig.vx += (dx / delta - rig.vx) * ease;
        rig.vz += (dz / delta - rig.vz) * ease;
      }

      const speed = Math.hypot(rig.vx, rig.vz);
      // 0 standing, 1 flat out. Everything below is scaled by it.
      const effort = Math.min(speed / TOP_SPEED, 1);

      // Facing: where they are actually going, or — when that is nowhere — towards
      // the ball, which is where a player who has stopped is looking. A scorer turns
      // to the camera instead. Either way they can only turn so fast, and how fast
      // they are turning is kept so the body can lean into it.
      if (!placed) {
        const want =
          acting === 'celebrate'
            ? Math.atan2(camera.position.x - x, camera.position.z - z)
            : speed > RUN_SPEED
              ? Math.atan2(rig.vx, rig.vz)
              : Math.atan2(ballX - x, ballZ - z);
        const swing = angleTo(rig.heading, want);
        const most = TURN_RATE * delta;
        const step = Math.max(-most, Math.min(most, swing));
        rig.heading += step;
        if (delta > 0) rig.turning += (step / delta - rig.turning) * Math.min(1, delta * 8);
      } else {
        rig.turning = 0;
      }

      // The head follows the ball, as far as a neck turns, unless the pose owns it.
      const gaze =
        acting && actionHoldsHead(acting)
          ? 0
          : Math.max(
              -LOOK_LIMIT,
              Math.min(LOOK_LIMIT, angleTo(rig.heading, Math.atan2(ballX - x, ballZ - z))),
            );
      rig.lookY += (gaze - rig.lookY) * Math.min(1, delta * LOOK_EASE);

      // The stride is driven by ground covered, not by the clock, so the feet keep
      // up with the player instead of sliding under them.
      if (!placed) {
        const cycle = STRIDE_WALK + effort * (STRIDE_RUN - STRIDE_WALK);
        rig.phase += ((speed * delta) / cycle) * Math.PI * 2;
        // Standing still, they still breathe.
        if (effort < 0.06) rig.phase += delta * 0.9;
      }

      stridePose(strideOut.current, rig.phase, effort, appearance.keeper);
      // Leaning into the turn: heading grows turning left, and a left lean is a
      // negative roll of the spine.
      strideOut.current.spineZ -= rig.turning * TURN_LEAN * effort;
      let pose = strideOut.current;

      if (state?.kind) {
        if (state.delay > 0) {
          state.delay -= delta;
        } else {
          state.elapsed += delta;
          const progress = state.elapsed / ACTION_SECONDS[state.kind];
          if (progress >= 1) {
            state.kind = null;
          } else {
            actionPose(actionOut.current, state.kind, progress, appearance.footed, state.dir);
            blendPose(finalOut.current, strideOut.current, actionOut.current, actionWeight(progress));
            pose = finalOut.current;
          }
        }
      }

      root.position.set(x, pose.rootY * appearance.stature, z);
      root.rotation.y = rig.heading;
      applyPose(rig, pose, rig.lookY);

      // The contact shadow stays on the grass whatever the body does, and thins as
      // the feet leave the ground.
      const contact = rig.contact;
      if (contact) {
        const lift = Math.max(0, pose.rootY);
        const spread = appearance.stature * (1 - lift * 0.7);
        contact.position.set(x, CONTACT_Y, z);
        contact.scale.set(spread * appearance.build, spread, 1);
        contact.rotation.z = rig.heading;
      }

      // Detail by distance: the flags are only rewritten when the level changes.
      const level = levelForDistance(camera.position.distanceTo(root.position));
      if (level !== rig.lod) {
        rig.lod = level;
        applyDetailLevel(rig.parts, level);
      }
    }

    // Height is the one thing about the ball the engine does not know, so it is the
    // one thing worked out here. Where it is and what happens to it stay the sim's.
    const flight = engine.ball.flight;
    if (flight !== flightSeen.current) {
      if (flight) {
        aimedAt.current =
          flight.kind === 'shot'
            ? shotEndHeight(
                flight.fromX,
                flight.fromY,
                flight.toY,
                flight.outcome !== 'miss',
                BALL_RADIUS,
              )
            : BALL_RADIUS;
        settling.current = false;
      } else if (!engine.ballOwnerId) {
        // It came down with nobody on it, so let it settle rather than stop dead.
        settling.current = true;
        settled.current = 0;
      }
      flightSeen.current = flight;
    }

    let ballY = BALL_RADIUS;
    if (flight && flight.duration > 0) {
      const spread = Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY);
      ballY = flightHeight(
        flight.kind,
        spread,
        flight.elapsed / flight.duration,
        BALL_RADIUS,
        aimedAt.current,
      );
    } else if (settling.current) {
      if (engine.ballOwnerId) {
        settling.current = false;
      } else {
        settled.current += delta;
        ballY = bounceHeight(settled.current, SETTLE_ENERGY, BALL_RADIUS);
        if (settled.current > 2) settling.current = false;
      }
    }

    if (ball.current) {
      ball.current.position.set(ballX, ballY, ballZ);
      // Rolled or spun by however far it just travelled.
      const rolledX = ballX - lastBall.current.x;
      const rolledZ = ballZ - lastBall.current.z;
      ball.current.rotation.x += rolledZ / BALL_RADIUS;
      ball.current.rotation.z -= rolledX / BALL_RADIUS;
    }
    lastBall.current.x = ballX;
    lastBall.current.z = ballZ;

    // The sun rides with the play, so the shadow map only ever has to cover the part
    // of the pitch that is on screen and the shadows stay sharp.
    if (sun.current) {
      sun.current.position.set(ballX + 26, SUN_HEIGHT, ballZ + 18);
      sun.current.target.position.set(ballX, 0, ballZ);
      sun.current.target.updateMatrixWorld();
    }

    // Camera: fixed on its own side, sliding along the pitch with the play.
    const ease = 1 - Math.exp(-FOLLOW * delta);
    const railZ = Math.max(-CAMERA_RAIL, Math.min(CAMERA_RAIL, ballZ * 0.55));
    camera.position.x += (CAMERA_X + ballX * CAMERA_LEAN - camera.position.x) * ease;
    camera.position.y += (CAMERA_Y - camera.position.y) * ease;
    camera.position.z += (railZ - camera.position.z) * ease;
    look.current.x += (ballX * 0.8 - look.current.x) * ease;
    look.current.z += (ballZ - look.current.z) * ease;
    camera.lookAt(look.current);

    // The carrier: a marker over their head and their name beside it.
    const owner = live.find((player) => player.id === engine.ballOwnerId);
    const node = label.current;
    if (marker.current) marker.current.visible = owner !== undefined;
    if (owner) {
      const ox = engineToWorldX(owner.y);
      const oz = engineToWorldZ(owner.x);
      // Over the head of THIS player, however tall they are.
      const top = BODY_TOP * (appearances[live.indexOf(owner)]?.stature ?? 1);
      if (marker.current) marker.current.position.set(ox, top + 0.6, oz);
      if (node) {
        project.current.set(ox, top + 0.95, oz).project(camera);
        node.style.left = `${(project.current.x * 0.5 + 0.5) * 100}%`;
        node.style.top = `${(-project.current.y * 0.5 + 0.5) * 100}%`;
        node.style.opacity = project.current.z < 1 ? '1' : '0';
        const short = shortName(owner.name);
        if (node.textContent !== short) node.textContent = short;
      }
    } else if (node) {
      node.style.opacity = '0';
    }
  });

  return (
    <>
      {/* The sun lives here because it is driven from here. Only the players and the
          ball cast into it — putting the stands and the crowd through the shadow
          pass would double its cost for something this camera never sees. */}
      <directionalLight
        ref={sun}
        castShadow
        position={[26, SUN_HEIGHT, 18]}
        intensity={2.3}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_SPAN}
        shadow-camera-right={SHADOW_SPAN}
        shadow-camera-top={SHADOW_SPAN}
        shadow-camera-bottom={-SHADOW_SPAN}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />

      {engine.players.map((player, index) => (
        <Player3D key={player.id} rig={rigAt(index)} appearance={appearances[index]!} />
      ))}

      <mesh ref={ball} position={[0, BALL_RADIUS, 0]} castShadow>
        <sphereGeometry args={[BALL_RADIUS, 16, 12]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>

      <mesh ref={marker} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.32, 0.5, 4]} />
        <meshBasicMaterial color={MARKER_COLOR} />
      </mesh>
    </>
  );
}

/** Temporary read-out, for checking the 3D numbers against the 2D screen's. */
function Match3DDebug({ engine }: Match3DStageProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 120) {
        last = now;
        const node = box.current;
        if (node) {
          const { x, y } = engine.ball;
          node.textContent = [
            `Players: ${engine.players.length}`,
            `Ball X: ${x.toFixed(2)}  ->  world Z ${engineToWorldZ(x).toFixed(2)}`,
            `Ball Y: ${y.toFixed(2)}  ->  world X ${engineToWorldX(y).toFixed(2)}`,
            `Engine minute: ${engine.minute}'`,
          ].join('\n');
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  return <div ref={box} className={styles.debug} />;
}

export default function Match3DStage({ engine }: Match3DStageProps) {
  const label = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.wrap}>
      <Canvas
        shadows
        camera={{ position: [CAMERA_X, CAMERA_Y, 0], fov: CAMERA_FOV, near: 0.1, far: 600 }}
      >
        <color attach="background" args={['#0b1014']} />
        {/* Fill from the sky above and the grass below, so a body's top surfaces
            read lighter than its undersides even where the sun does not reach. */}
        <hemisphereLight args={['#e4ecff', '#3a6b3c', 1.0]} />
        <ambientLight intensity={0.7} />
        <Pitch3D />
        <Stadium3D />
        <MatchObjects engine={engine} label={label} />
      </Canvas>
      <div ref={label} className={styles.name} />
      {SHOW_DEBUG && <Match3DDebug engine={engine} />}
    </div>
  );
}
