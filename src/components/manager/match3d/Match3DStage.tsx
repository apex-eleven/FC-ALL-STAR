import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Vector3, type DirectionalLight, type Mesh } from 'three';
import type { EnginePlayer, MatchEngine } from '@/features/manager/matchEngine';
import Pitch3D from './Pitch3D';
import Stadium3D from './Stadium3D';
import Player3D, { BODY_TOP, makeRig, type PlayerRig } from './Player3D';
import { appearanceOf, type PlayerAppearance } from './PlayerAppearance';
import { applyDetailLevel, levelForDistance } from './PlayerLOD';
import { CONTACT_Y } from './PlayerShadow';
import { commandPose, makePose, makePoseScratch, type Pose } from './AnimationController';
import {
  bounceHeight,
  engineToWorldX,
  engineToWorldZ,
  flightHeight,
  shotEndHeight,
} from './Match3DAdapter';
import { PlayerVisualAdapter } from './players/PlayerVisualAdapter';
import { FootballAnimationStateMachine } from './players/FootballAnimationStateMachine';
import { shortestAngle } from './players/visualMath';
import styles from './Match3DStage.module.css';

/**
 * A read-only 3D view of a match that is already running.
 *
 * It renders the SAME `MatchEngine` instance the 2D screen owns and never calls
 * `step()` — there is one simulation and this is a second way of looking at it.
 *
 * Everything about the players comes through `PlayerVisualAdapter`: positions
 * interpolated between the engine's 20 Hz steps, the engine's own velocity, speed,
 * facing, movement state and decision, and actions taken from the engine's events.
 * What the body does with that is decided by one `FootballAnimationStateMachine` per
 * player, whose `AnimationCommand` the procedural poses then draw.
 * Players are identified by id throughout — never by where they sit in an array —
 * so a substitution or a red card can never hand one player's body to another.
 *
 * The camera is the broadcast one from the reference shot: low, outside the near
 * touchline, panning along the pitch rather than looking down on it.
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
/**
 * The fastest the drawn body turns, radians per simulation second. Above the engine's
 * own 9 rad/s, so it never holds back the engine's facing; it only paces the turns the
 * view makes on its own — to the camera for a celebration, and back again.
 */
const TURN_RATE = 12;
/** How far the head will turn to follow the ball, either way. Radians. */
const LOOK_LIMIT = 1.1;
/** How quickly the gaze settles on a new target, per simulation second. */
const LOOK_EASE = 6;

const MARKER_COLOR = '#38e8ff';

/** How hard a loose ball bounces once it lands, in metres. */
const SETTLE_ENERGY = 0.34;
/** The sun follows the ball at this height; its shadow map covers SHADOW_SPAN. */
const SUN_HEIGHT = 46;
const SHADOW_SPAN = 34;

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.length > 12 ? `${last.slice(0, 11)}…` : last;
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
  // One adapter per match. It is the only thing here that reads the engine's players.
  const adapter = useMemo(() => new PlayerVisualAdapter(engine), [engine]);

  // Bodies and looks, by player id. A substitute is a new id and gets a new rig and a
  // look seeded from their own id; a red card removes one id and moves nobody else.
  const rigs = useRef(new Map<string, PlayerRig>());
  const appearances = useRef(new Map<string, PlayerAppearance>());
  // One animation state machine per player id, made the first frame they are seen and
  // dropped when they leave — a substitute never starts from anyone else's state.
  const machines = useRef(new Map<string, FootballAnimationStateMachine>());

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
  const scratch = useRef(makePoseScratch());
  const finalOut = useRef<Pose>(makePose());

  const rigFor = (id: string): PlayerRig => {
    const found = rigs.current.get(id);
    if (found) return found;
    const made = makeRig();
    rigs.current.set(id, made);
    return made;
  };

  // Faces and kits are settled once per id: the same card always turns out the same.
  const appearanceFor = (player: EnginePlayer): PlayerAppearance => {
    const found = appearances.current.get(player.id);
    if (found) return found;
    const made = appearanceOf(player.id, player.side, player.keeper);
    appearances.current.set(player.id, made);
    return made;
  };

  useFrame(({ camera }, delta) => {
    adapter.update(delta);

    // Whoever left the pitch this frame: hide them now, rather than leave the body
    // standing until React next re-renders the list, and forget their rig and look.
    for (const id of adapter.removed) {
      const gone = rigs.current.get(id);
      if (gone?.root) gone.root.visible = false;
      if (gone?.contact) gone.contact.visible = false;
      rigs.current.delete(id);
      appearances.current.delete(id);
      machines.current.delete(id);
    }

    // Everything below moves by SIMULATION time, so x2 and x4 run the legs and the
    // actions faster with the play and a pause freezes them with it.
    const simDelta = adapter.renderDelta;
    const renderTime = adapter.renderTime;
    const ballX = adapter.ball.x;
    const ballZ = adapter.ball.z;

    for (const runtime of adapter.players) {
      const rig = rigs.current.get(runtime.id);
      const root = rig?.root;
      const appearance = appearances.current.get(runtime.id);
      // Not mounted yet: React adds the body on its next pass, a fraction of a second.
      if (!rig || !root || !appearance) continue;
      const visual = runtime.visual;
      const x = visual.position.x;
      const z = visual.position.z;

      let machine = machines.current.get(runtime.id);
      if (!machine) {
        machine = new FootballAnimationStateMachine();
        machines.current.set(runtime.id, machine);
      }
      // Visual data in, animation command out — in simulation time, so x4 plays
      // everything four times as fast and a pause (simDelta 0) freezes it.
      const command = machine.update(visual, renderTime, simDelta);

      // Facing is the engine's. The view only overrides it to turn a scorer to the
      // camera, and turns at a bounded rate so it never snaps.
      if (visual.placed) {
        rig.heading = command.facing.heading;
      } else {
        const want = command.action.facesCamera
          ? Math.atan2(camera.position.x - x, camera.position.z - z)
          : command.facing.heading;
        const most = TURN_RATE * simDelta;
        rig.heading += Math.max(-most, Math.min(most, shortestAngle(rig.heading, want)));
      }

      // The head follows the ball, as far as a neck turns, unless the action owns it.
      const gaze = command.action.holdsHead
        ? 0
        : Math.max(
            -LOOK_LIMIT,
            Math.min(LOOK_LIMIT, shortestAngle(rig.heading, Math.atan2(ballX - x, ballZ - z))),
          );
      rig.lookY += (gaze - rig.lookY) * Math.min(1, simDelta * LOOK_EASE);

      const pose = finalOut.current;
      commandPose(pose, command, appearance.footed, scratch.current);

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
    // The flight is read live, so it is wound back by the adapter's lag to match the
    // interpolated ball and players being drawn.
    const flight = engine.ball.flight;
    const ownerId = adapter.ball.ownerId;
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
        Math.max(0, flight.elapsed - adapter.lag) / flight.duration,
        BALL_RADIUS,
        aimedAt.current,
      );
    } else if (settling.current) {
      if (ownerId) {
        settling.current = false;
      } else {
        settled.current += simDelta;
        ballY = bounceHeight(settled.current, SETTLE_ENERGY, BALL_RADIUS);
        if (settled.current > 2) settling.current = false;
      }
    }

    if (ball.current) {
      ball.current.position.set(ballX, ballY, ballZ);
      // Rolled or spun by however far it just travelled — unless it was just placed.
      if (!adapter.ball.placed) {
        ball.current.rotation.x += (ballZ - lastBall.current.z) / BALL_RADIUS;
        ball.current.rotation.z -= (ballX - lastBall.current.x) / BALL_RADIUS;
      }
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

    // Camera: fixed on its own side, sliding along the pitch with the play. Eased in
    // real time — it is the viewer's eye, not part of the match.
    const ease = 1 - Math.exp(-FOLLOW * delta);
    const railZ = Math.max(-CAMERA_RAIL, Math.min(CAMERA_RAIL, ballZ * 0.55));
    camera.position.x += (CAMERA_X + ballX * CAMERA_LEAN - camera.position.x) * ease;
    camera.position.y += (CAMERA_Y - camera.position.y) * ease;
    camera.position.z += (railZ - camera.position.z) * ease;
    look.current.x += (ballX * 0.8 - look.current.x) * ease;
    look.current.z += (ballZ - look.current.z) * ease;
    camera.lookAt(look.current);

    // The carrier: a marker over their head and their name beside it — the carrier at
    // the moment being drawn, so it never runs ahead of the interpolated players.
    const carrier = ownerId ? adapter.get(ownerId) : undefined;
    const node = label.current;
    if (marker.current) marker.current.visible = carrier !== undefined;
    if (carrier) {
      const ox = carrier.visual.position.x;
      const oz = carrier.visual.position.z;
      // Over the head of THIS player, however tall they are.
      const top = BODY_TOP * (appearances.current.get(carrier.id)?.stature ?? 1);
      if (marker.current) marker.current.position.set(ox, top + 0.6, oz);
      if (node) {
        project.current.set(ox, top + 0.95, oz).project(camera);
        node.style.left = `${(project.current.x * 0.5 + 0.5) * 100}%`;
        node.style.top = `${(-project.current.y * 0.5 + 0.5) * 100}%`;
        node.style.opacity = project.current.z < 1 ? '1' : '0';
        let name = '';
        for (const player of engine.players) {
          if (player.id === carrier.id) {
            name = player.name;
            break;
          }
        }
        const short = shortName(name);
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

      {/* Keyed and rigged by id. The list itself is React's, and changes only when the
          roster does; everything that moves is written by the frame loop above. */}
      {engine.players.map((player) => (
        <Player3D key={player.id} rig={rigFor(player.id)} appearance={appearanceFor(player)} />
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
