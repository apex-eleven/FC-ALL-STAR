import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Vector3, type DirectionalLight, type Mesh } from 'three';
import type { EnginePlayer, MatchEngine } from '@/features/manager/matchEngine';
import Pitch3D from './Pitch3D';
import Stadium3D from './Stadium3D';
import Player3D, { BODY_TOP, makeRig, type PlayerRig } from './Player3D';
import { proceduralAppearance, type PlayerAppearance } from './PlayerAppearance';
import { applyDetailLevel, levelForDistance } from './PlayerLOD';
import { CONTACT_Y } from './PlayerShadow';
import { commandPose, makePose, makePoseScratch, type Pose } from './AnimationController';
import {
  bounceHeight,
  engineToWorldX,
  engineToWorldZ,
  flightHeight,
  passLoft,
  shotEndHeight,
} from './Match3DAdapter';
import { PlayerVisualAdapter, type DrawnFlight } from './players/PlayerVisualAdapter';
import { PlayerPool } from './players/PlayerPool';
import { heldBallPoint } from './players/heldBall';
import MatchAudio from './MatchAudio';
import { drawMinimap, MINIMAP_RESOLUTION, type MinimapPlayer } from './MatchMinimap';
import { describeAnimation, type AnimationBody } from './players/animationDiagnostics';
import { resolvePlayerLook, type PlayerLookSources } from './players/playerAppearance';
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
 * player, held in the `PlayerPool`. The pool draws the realistic GLB body from the
 * machine's `AnimationCommand` when the model is available; otherwise — missing,
 * loading, invalid or failed — the same command drives the procedural `Player3D`.
 * Players are identified by id throughout — never by where they sit in an array —
 * so a substitution or a red card can never hand one player's body to another.
 *
 * The camera is the broadcast one from the reference shot: low, outside the near
 * touchline, panning along the pitch rather than looking down on it.
 */

export interface Match3DStageProps {
  engine: MatchEngine;
  /**
   * Where players' looks may draw on data from outside the engine — the match's kits,
   * team marks, per-player choices. Optional: without it, FC ALL-STAR's default kits
   * and each player's seeded look. Read when a player first appears.
   */
  appearance?: PlayerLookSources;
}

/** Set true to bring back the coordinate read-out used to prove the mapping. */
const SHOW_DEBUG = false;
/**
 * Set true for the animation read-out: every player's id, locomotion state, engine
 * speed, action and whether the GLB or the procedural body drew it. For development
 * only — it is off in the game, like the read-out above.
 */
const SHOW_ANIMATION_DEBUG = false;
/** How often the animation read-out is rewritten, real seconds. */
const ANIMATION_DEBUG_EVERY = 0.25;

/**
 * The broadcast camera, fitted to the reference frame rather than chosen by eye: 13
 * pitch landmarks in the reference (penalty box, six-yard box, the D, the posts, the
 * far corner) were matched by least squares to a pinhole camera, and it reproduces them
 * to 3.6 px RMS (7 px worst) on the 2048 x 942 stage. It stands 69 m back from the near
 * touchline and 33 m up, on a long lens — so the pitch fills the frame, the far stand
 * is a strip along the top, and the near touchline is out of shot.
 */
const CAMERA_FOV = 10.95;
const CAMERA_X = -103.31;
const CAMERA_Y = 33.17;
/**
 * The camera looks slightly along the pitch (0.69 deg in the fit): it stands this far
 * behind the point it aims at, measured along the touchline.
 */
const CAMERA_TRAIL = 1.27;
/**
 * Where it aims, on the grass. Along the pitch it keeps level with the ball but stops
 * AIM_END metres from either goal line — the reference frame is that stop, with the
 * ball 4 m past it. Across the pitch it holds the reference tilt (aim AIM_FAR, the far
 * touchline at y 133 with the stand a strip above it) and only tilts down once the
 * ball comes into the near half: it then aims AIM_AHEAD metres beyond the ball, which
 * keeps the ball at or above y 530 — above the minimap — until AIM_NEAR, where a ball
 * on the near touchline still sits at y 760.
 */
const AIM_END = 52.5 - 40.3;
const AIM_AHEAD = 3;
const AIM_FAR = 1.84;
const AIM_NEAR = -22;
/** Bigger follows harder; the ball is quick and an undamped camera is unwatchable. */
const FOLLOW = 2.4;
/**
 * From this far back the near stand (Stadium3D: X -42 to -61, up to 17 m with its
 * roof) stands between the camera and the pitch. A real broadcast camera sits on a
 * gantry above it; here the near clip plane does the same job: everything of the near
 * stand is within 69 m of the lens along the view, while the nearest thing that must be
 * seen — the near advertising boards — is 73 m away at the lowest aim (the touchline
 * 76 m). So nothing between the two is lost.
 */
const CAMERA_NEAR = 70;
/**
 * The detail levels (PlayerLOD) were set for a 26 deg lens. This lens magnifies by
 * tan(13)/tan(5.475), so a player is judged by the distance at which the old lens would
 * have shown them the same size.
 */
const LOD_LENS = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) / Math.tan(13 * (Math.PI / 180));

const BALL_RADIUS = 0.15;
/**
 * Into a keeper's hands and out of them the drawn ball changes what it follows (the
 * flight, the hands, the flight again): over this long, simulation seconds, it eases
 * from where it was drawn to where it now belongs, rather than jump the gap.
 */
const HANDOFF_S = 0.12;
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
/**
 * Where each celebration take turns relative to the camera, radians: the take is the
 * player's own (seeded from their id), so a group celebrating does not all square up
 * to the lens at once.
 */
const CELEBRATION_FACING: readonly number[] = [0, 0.55, -0.5];

/** The carrier's marker over their head, and the ring at their feet (sampled from the reference). */
const MARKER_COLOR = '#0f9a78';
const RING_COLOR = '#f0dc1a';
/**
 * Whose names are shown under them: 'all' (everyone), or 'focus' — the reference's own
 * choice, the player on the ball and the two keepers.
 */
const NAME_TAGS: 'all' | 'focus' = 'all';
/** The minimap on the stage (reference: 375 x 220 px at x 838, y 644). */
const MINIMAP_W = 375;
const MINIMAP_H = 220;
/**
 * The stage, and the minimap-and-bar panel on it (x 832-1222, from y 644 down): a name
 * tag that would fall behind the panel is hidden rather than shown through it.
 */
const STAGE_W = 2048;
const STAGE_H = 942;
const PANEL_LEFT = 832 - 60;
const PANEL_RIGHT = 1222 + 60;
const PANEL_TOP = 644;
const TAG_HEIGHT = 34;

/** The opening whistle is only blown if the view is there from (about) the start. Seconds. */
const OPENING_WHISTLE_WINDOW = 3;
/** The carrier's ring sits just off the grass so it never flickers into it. */
const RING_Y = 0.03;
/**
 * The crowd starts to lift once the ball is EXCITEMENT_FROM metres from the halfway
 * line and is at full voice EXCITEMENT_SPAN further on — around the penalty spot.
 */
const EXCITEMENT_FROM = 22;
const EXCITEMENT_SPAN = 20;

/** How hard a loose ball bounces once it lands, in metres. */
const SETTLE_ENERGY = 0.34;
/** The sun follows the ball at this height; its shadow map covers SHADOW_SPAN. */
const SUN_HEIGHT = 46;
const SHADOW_SPAN = 34;

/** A player's name as the engine has it, by id — empty for an id it does not know. */
function nameOf(engine: MatchEngine, id: string): string {
  for (const player of engine.players) if (player.id === id) return player.name;
  return '';
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.length > 12 ? `${last.slice(0, 11)}…` : last;
}

interface StageOverlay {
  names: React.RefObject<HTMLDivElement>;
  minimap: React.RefObject<HTMLCanvasElement>;
  barPosition: React.RefObject<HTMLSpanElement>;
  barNumber: React.RefObject<HTMLSpanElement>;
  barName: React.RefObject<HTMLSpanElement>;
}

interface SceneProps extends Match3DStageProps {
  /** The DOM drawn over the 3D view: name tags, minimap and the ball-carrier bar. */
  overlay: StageOverlay;
  /** The match's sound, played from the adapter's cues. */
  audio: MatchAudio;
  /** The animation read-out, when SHOW_ANIMATION_DEBUG is on. */
  diagnostics: React.RefObject<HTMLPreElement>;
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
function MatchObjects({ engine, overlay, audio, appearance, diagnostics }: SceneProps) {
  // One adapter per match. It is the only thing here that reads the engine's players.
  const adapter = useMemo(() => new PlayerVisualAdapter(engine), [engine]);

  // Every player's animation state, heading and (once the model loads) realistic
  // body, by player id. It starts looking for the model when the 3D view mounts.
  const pool = useMemo(() => new PlayerPool(), [engine]);
  useEffect(() => {
    pool.start();
    return () => pool.dispose();
  }, [pool]);

  // The procedural bodies and looks, by player id: the fallback body, and the look
  // both bodies share. A substitute is a new id and gets a new rig and a look seeded
  // from their own id; a red card removes one id and moves nobody else.
  const rigs = useRef(new Map<string, PlayerRig>());
  const appearances = useRef(new Map<string, PlayerAppearance>());

  const ball = useRef<Mesh>(null);
  const sun = useRef<DirectionalLight>(null);
  const lastBall = useRef({ x: 0, z: 0 });
  const marker = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  /** Minimap points, reused every frame; and who the carrier bar shows. */
  const dots = useRef<MinimapPlayer[]>([]);
  const barShows = useRef<string | null>(null);
  /** The flight being drawn, the height it is aimed at (a pass: how high it is lifted), and the settle after it. */
  const flightSeen = useRef<DrawnFlight | null>(null);
  const aimedAt = useRef(BALL_RADIUS);
  const lofted = useRef(0);
  const settling = useRef(false);
  const settled = useRef(0);
  /** A keeper holding the ball: the point in their hands, and the ease across a handoff. */
  const held = useRef(new Vector3());
  const heldBy = useRef<string | null>(null);
  const drawnBall = useRef(new Vector3());
  const handoff = useRef({ x: 0, y: 0, z: 0, left: 0 });
  const look = useRef(new Vector3(AIM_FAR, 0, 0));
  /** Name tags by player id, and the ids tagged this frame. */
  const tags = useRef(new Map<string, HTMLDivElement>());
  /** The opening whistle is blown once, when play first moves. */
  const openingBlown = useRef(false);
  const tagSeen = useRef(new Set<string>());
  // A new match (or leaving the view) starts from a clean layer.
  useEffect(() => {
    const made = tags.current;
    return () => {
      for (const tag of made.values()) tag.remove();
      made.clear();
    };
  }, [engine]);
  const project = useRef(new Vector3());

  // Reused every frame so a match never allocates in its own loop.
  const scratch = useRef(makePoseScratch());
  const finalOut = useRef<Pose>(makePose());
  /** The animation read-out: when it was last written, and its lines. */
  const debugAt = useRef(-Infinity);
  const debugLines = useRef<string[]>([]);

  const rigFor = (id: string): PlayerRig => {
    const found = rigs.current.get(id);
    if (found) return found;
    const made = makeRig();
    rigs.current.set(id, made);
    return made;
  };

  // Faces and kits are settled once per id: the same card always turns out the same.
  // Called from render (for the procedural body) and from the frame loop (for a
  // player React has not rendered yet) — both get the one seeded look.
  //
  // The look is resolved ONCE per id, from what the engine knows about that player —
  // side, keeper role, shirt number, bench slot — and shared by both bodies: the
  // realistic one wears it, the procedural one adds only its limb proportions.
  const sources = useRef(appearance ?? {});
  sources.current = appearance ?? {};
  const appearanceFor = (id: string): PlayerAppearance => {
    const found = appearances.current.get(id);
    if (found) return found;
    const agent = adapter.get(id)?.agent ?? engine.core.players.find((candidate) => candidate.id === id);
    const seat: EnginePlayer | undefined = agent ? undefined : engine.players.find((candidate) => candidate.id === id);
    const look = resolvePlayerLook(
      {
        id,
        side: agent?.side ?? seat?.side ?? 'home',
        isKeeper: agent ? agent.role === 'gk' : (seat?.keeper ?? false),
        shirtNumber: agent?.shirtNumber ?? 0,
        slotId: agent?.slotId,
      },
      sources.current,
    );
    const made = proceduralAppearance(look);
    appearances.current.set(id, made);
    return made;
  };

  useFrame(({ camera, clock }, delta) => {
    adapter.update(delta);

    // Whoever left the pitch this frame: hide their procedural body now, rather than
    // leave it standing until React next re-renders the list, and release everything
    // else of theirs — rig, look, animation state, realistic body.
    for (const id of adapter.removed) {
      const gone = rigs.current.get(id);
      if (gone?.root) gone.root.visible = false;
      if (gone?.contact) gone.contact.visible = false;
      rigs.current.delete(id);
      appearances.current.delete(id);
      pool.release(id);
    }

    // Everything below moves by SIMULATION time, so x2 and x4 run the legs and the
    // actions faster with the play and a pause freezes them with it.
    const simDelta = adapter.renderDelta;
    const renderTime = adapter.renderTime;
    const ballX = adapter.ball.x;
    const ballZ = adapter.ball.z;
    const cam = camera.position;
    const debugNode = SHOW_ANIMATION_DEBUG ? diagnostics.current : null;
    const describe = debugNode !== null && clock.elapsedTime - debugAt.current >= ANIMATION_DEBUG_EVERY;
    if (describe) {
      debugAt.current = clock.elapsedTime;
      debugLines.current.length = 0;
    }

    const holderId = adapter.ball.inHandsOf;
    let holding = false;
    for (const runtime of adapter.players) {
      const visual = runtime.visual;
      const x = visual.position.x;
      const z = visual.position.z;
      const look = appearanceFor(runtime.id);
      const player = pool.acquire(runtime.id, look, visual.heading);

      // Visual data in, animation command out — in simulation time, so x4 plays
      // everything four times as fast and a pause (simDelta 0) freezes it.
      const command = player.machine.update(visual, renderTime, simDelta);

      // Facing is the engine's. The view only overrides it to turn a scorer to the
      // camera, or a keeper to where they are throwing it (the action's aim), and turns
      // at a bounded rate so it never snaps.
      if (visual.placed) {
        player.heading = command.facing.heading;
      } else {
        const want = command.action.facesCamera
          ? Math.atan2(cam.x - x, cam.z - z) + (CELEBRATION_FACING[command.action.variant] ?? 0)
          : (command.action.aim ?? command.facing.heading);
        const most = TURN_RATE * simDelta;
        player.heading += Math.max(-most, Math.min(most, shortestAngle(player.heading, want)));
      }

      // The head follows the ball, as far as a neck turns, unless the action owns it.
      const gaze = command.action.holdsHead
        ? 0
        : Math.max(
            -LOOK_LIMIT,
            Math.min(LOOK_LIMIT, shortestAngle(player.heading, Math.atan2(ballX - x, ballZ - z))),
          );
      player.lookY += (gaze - player.lookY) * Math.min(1, simDelta * LOOK_EASE);

      // Detail by distance, the same thresholds for either body.
      const level = levelForDistance(Math.hypot(cam.x - x, cam.y, cam.z - z) * LOD_LENS);

      // The realistic body if the model is there; otherwise the procedural one.
      const modelDrawn = pool.draw(player, command, x, z, simDelta, level);

      // A keeper with the ball in their hands: it is drawn there, off this frame's pose.
      if (runtime.id === holderId) {
        heldBallPoint(held.current, command, x, z, player.heading, look.stature, modelDrawn ? player.body : null);
        holding = true;
      }

      if (describe) {
        const body: AnimationBody = modelDrawn ? (player.body?.drawnByPose ? 'GLB+POSE' : 'GLB') : 'PROCEDURAL';
        debugLines.current.push(
          describeAnimation({ id: runtime.id, shirtNumber: look.shirtNumber, speed: visual.speed, command, body }),
        );
      }

      const rig = rigs.current.get(runtime.id);
      const root = rig?.root;
      let lift = 0;
      if (rig && root) {
        root.visible = !modelDrawn;
        if (!modelDrawn) {
          const pose = finalOut.current;
          commandPose(pose, command, look.footed, scratch.current);
          root.position.set(x, pose.rootY * look.stature, z);
          root.rotation.y = player.heading;
          applyPose(rig, pose, player.lookY);
          lift = Math.max(0, pose.rootY);
          // The flags are only rewritten when the level changes.
          if (level !== rig.lod) {
            rig.lod = level;
            applyDetailLevel(rig.parts, level);
          }
        }
      }

      // The contact shadow stays on the grass under either body, and thins as the
      // feet leave the ground.
      const contact = rig?.contact;
      if (contact) {
        const spread = look.stature * (1 - lift * 0.7);
        contact.position.set(x, CONTACT_Y, z);
        contact.scale.set(spread * look.build, spread, 1);
        contact.rotation.z = player.heading;
      }
    }

    if (describe && debugNode) debugNode.textContent = debugLines.current.join('\n');

    // Height is the one thing about the ball the engine does not know, so it is the
    // one thing worked out here. Where it is and what happens to it stay the sim's.
    // The flight is the adapter's drawn one: on the same timeline as the ball and the
    // players, held at the foot until the strike reaches it.
    const flight = adapter.ball.flight;
    const ownerId = adapter.ball.ownerId;
    if (flight !== flightSeen.current) {
      if (flight) {
        aimedAt.current =
          flight.kind === 'shot'
            ? shotEndHeight(flight.fromX, flight.fromY, flight.toY, flight.onTarget, BALL_RADIUS)
            : BALL_RADIUS;
        // Out of a keeper's hands it bows as it was thrown (or kicked); otherwise as passed.
        lofted.current =
          flight.loft ?? (flight.kind === 'pass' ? passLoft(flight.fromX, flight.fromY, flight.toX, flight.toY) : 0);
        settling.current = false;
      } else if (!ownerId && (flightSeen.current?.kind === 'shot' || lofted.current > 0)) {
        // It came down with nobody on it, so let it settle rather than stop dead. A pass
        // played along the ground just rolls on.
        settling.current = true;
        settled.current = 0;
      }
      flightSeen.current = flight;
    }

    let ballY = BALL_RADIUS;
    if (flight && flight.duration > 0) {
      const spread = Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY);
      // Out of a keeper's hands it leaves from the hand (or boot) that plays it.
      ballY = flightHeight(
        flight.kind,
        spread,
        flight.elapsed / flight.duration,
        flight.startHeight ?? BALL_RADIUS,
        aimedAt.current,
        lofted.current,
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

    // Where it belongs this frame: in the keeper's hands, or where the flight has it.
    const drawn = drawnBall.current;
    if (holding) drawn.copy(held.current);
    else drawn.set(ballX, ballY, ballZ);
    const blend = handoff.current;
    const heldNow = holding ? holderId : null;
    if (heldNow !== heldBy.current) {
      // Into or out of the hands: ease across from where it was last drawn.
      heldBy.current = heldNow;
      const shown = ball.current?.position;
      if (shown && !adapter.ball.placed) {
        blend.x = shown.x - drawn.x;
        blend.y = shown.y - drawn.y;
        blend.z = shown.z - drawn.z;
        blend.left = HANDOFF_S;
      } else {
        blend.left = 0;
      }
    }
    if (blend.left > 0) {
      const share = blend.left / HANDOFF_S;
      drawn.x += blend.x * share;
      drawn.y += blend.y * share;
      drawn.z += blend.z * share;
      blend.left = Math.max(0, blend.left - simDelta);
    }

    if (ball.current) {
      ball.current.position.copy(drawn);
      // Rolled or spun by however far it just travelled — unless it was just placed, or
      // is held.
      if (!adapter.ball.placed && !holding) {
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
    const aimZ = Math.max(AIM_END - 52.5, Math.min(52.5 - AIM_END, ballZ));
    const aimX = Math.max(AIM_NEAR, Math.min(AIM_FAR, ballX + AIM_AHEAD));
    look.current.x += (aimX - look.current.x) * ease;
    look.current.z += (aimZ - look.current.z) * ease;
    camera.position.set(CAMERA_X, CAMERA_Y, look.current.z - CAMERA_TRAIL);
    camera.lookAt(look.current);

    // The carrier: a marker over their head — the carrier at the moment being drawn,
    // so it never runs ahead of the interpolated players.
    const carrier = ownerId ? adapter.get(ownerId) : undefined;
    if (marker.current) marker.current.visible = carrier !== undefined;
    if (ring.current) ring.current.visible = carrier !== undefined;
    if (carrier) {
      if (ring.current) ring.current.position.set(carrier.visual.position.x, RING_Y, carrier.visual.position.z);
      // Over the head of THIS player, however tall they are.
      const top = BODY_TOP * (appearances.current.get(carrier.id)?.stature ?? 1);
      if (marker.current) marker.current.position.set(carrier.visual.position.x, top + 0.6, carrier.visual.position.z);
    }

    // Names on the grass just under the players, as the reference writes them.
    const layer = overlay.names.current;
    if (layer) {
      const shown = tagSeen.current;
      shown.clear();
      for (const player of adapter.players) {
        let tag = tags.current.get(player.id);
        if (!tag) {
          tag = document.createElement('div');
          tag.className = styles.tag ?? '';
          tag.textContent = shortName(nameOf(engine, player.id));
          layer.appendChild(tag);
          tags.current.set(player.id, tag);
        }
        shown.add(player.id);
        const wanted = NAME_TAGS === 'all' || player.visual.isKeeper || player.id === carrier?.id;
        project.current.set(player.visual.position.x, 0, player.visual.position.z).project(camera);
        const sx = (project.current.x * 0.5 + 0.5) * STAGE_W;
        const sy = (-project.current.y * 0.5 + 0.5) * STAGE_H;
        const underPanel = sx > PANEL_LEFT && sx < PANEL_RIGHT && sy > PANEL_TOP - TAG_HEIGHT;
        const onScreen =
          wanted &&
          !underPanel &&
          project.current.z < 1 &&
          Math.abs(project.current.x) < 1.1 &&
          Math.abs(project.current.y) < 1.1;
        tag.style.opacity = onScreen ? '1' : '0';
        if (!onScreen) continue;
        tag.style.left = `${(project.current.x * 0.5 + 0.5) * 100}%`;
        tag.style.top = `${(-project.current.y * 0.5 + 0.5) * 100}%`;
      }
      // Anyone who has left the pitch (substituted, sent off) takes their tag with them.
      if (tags.current.size !== shown.size) {
        for (const [id, tag] of tags.current) {
          if (shown.has(id)) continue;
          tag.remove();
          tags.current.delete(id);
        }
      }
    }

    // The minimap: everyone where they are being drawn, and the ball.
    const map = overlay.minimap.current?.getContext('2d');
    if (map) {
      const list = dots.current;
      let count = 0;
      for (const player of adapter.players) {
        const dot = list[count] ?? (list[count] = { x: 0, z: 0, home: true });
        dot.x = player.visual.position.x;
        dot.z = player.visual.position.z;
        dot.home = player.visual.side === 'home';
        count += 1;
      }
      list.length = count;
      drawMinimap(map, list, ballX, ballZ);
    }

    // The bar under it: whoever last had the ball — their position, shirt number, name.
    if (carrier && carrier.id !== barShows.current) {
      barShows.current = carrier.id;
      const seat = engine.players.find((player) => player.id === carrier.id);
      if (overlay.barPosition.current) overlay.barPosition.current.textContent = seat?.position ?? '';
      if (overlay.barNumber.current) overlay.barNumber.current.textContent = String(carrier.agent.shirtNumber || '');
      if (overlay.barName.current) overlay.barName.current.textContent = shortName(seat?.name ?? '');
    }

    // Sound: every cue that has come due on the drawn timeline, panned to where on
    // screen it happened, and a crowd that grows louder as the ball nears a goal.
    for (let cue = adapter.takeCue(); cue; cue = adapter.takeCue()) {
      project.current.set(cue.x, 0, cue.z).project(camera);
      audio.play(cue.kind, project.current.z < 1 ? project.current.x : 0, cue.power);
    }
    const running = adapter.simulationRate > 0.2;
    // The first kick-off happens before this view exists, so its whistle is blown here.
    if (running && !openingBlown.current) {
      openingBlown.current = true;
      if (adapter.renderTime < OPENING_WHISTLE_WINDOW) audio.play('whistle_kickoff', 0, 1);
    }
    audio.frame((Math.abs(ballZ) - EXCITEMENT_FROM) / EXCITEMENT_SPAN, running);
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

      {/* The realistic bodies, added and removed by the pool as players come and go. */}
      <primitive object={pool.group} />

      {/* The procedural bodies — the fallback, hidden for any player the model draws.
          Keyed and rigged by id; the list is React's and changes only when the roster
          does; everything that moves is written by the frame loop above. */}
      {engine.players.map((player) => (
        <Player3D
          key={player.id}
          rig={rigFor(player.id)}
          appearance={appearanceFor(player.id)}
        />
      ))}

      <mesh ref={ball} position={[0, BALL_RADIUS, 0]} castShadow>
        <sphereGeometry args={[BALL_RADIUS, 16, 12]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>

      <mesh ref={marker} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.32, 0.5, 4]} />
        <meshBasicMaterial color={MARKER_COLOR} />
      </mesh>

      {/* The ring at the carrier's feet: 1.6 m across in the reference. */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <ringGeometry args={[0.7, 0.8, 48]} />
        <meshBasicMaterial color={RING_COLOR} transparent opacity={0.95} depthWrite={false} />
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

export default function Match3DStage({ engine, appearance }: Match3DStageProps) {
  const diagnostics = useRef<HTMLPreElement>(null);
  const names = useRef<HTMLDivElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const barPosition = useRef<HTMLSpanElement>(null);
  const barNumber = useRef<HTMLSpanElement>(null);
  const barName = useRef<HTMLSpanElement>(null);
  const overlay = useMemo<StageOverlay>(() => ({ names, minimap, barPosition, barNumber, barName }), []);

  // One sound system per match, started with the view and closed with it.
  const audio = useMemo(() => new MatchAudio(), [engine]);
  useEffect(() => {
    audio.start();
    return () => audio.dispose();
  }, [audio]);

  return (
    <div className={styles.wrap}>
      <Canvas
        shadows
        camera={{ position: [CAMERA_X, CAMERA_Y, -CAMERA_TRAIL], fov: CAMERA_FOV, near: CAMERA_NEAR, far: 700 }}
      >
        <color attach="background" args={['#0b1014']} />
        {/* Fill from the sky above and the grass below, so a body's top surfaces
            read lighter than its undersides even where the sun does not reach. */}
        <hemisphereLight args={['#e4ecff', '#3a6b3c', 1.0]} />
        <ambientLight intensity={0.7} />
        <Pitch3D />
        <Stadium3D />
        <MatchObjects engine={engine} overlay={overlay} audio={audio} appearance={appearance} diagnostics={diagnostics} />
      </Canvas>
      <div ref={names} className={styles.names} />
      <canvas
        ref={minimap}
        className={styles.minimap}
        width={MINIMAP_W * MINIMAP_RESOLUTION}
        height={MINIMAP_H * MINIMAP_RESOLUTION}
      />
      <div className={styles.carrierBar}>
        <span className={styles.carrierBadges}>
          <span ref={barPosition} className={`${styles.diamond} ${styles.diamondGold}`} />
          <span ref={barNumber} className={`${styles.diamond} ${styles.diamondSilver}`} />
        </span>
        <span className={styles.carrierName}>
          <span ref={barName} />
        </span>
      </div>
      {SHOW_DEBUG && <Match3DDebug engine={engine} />}
      {SHOW_ANIMATION_DEBUG && <pre ref={diagnostics} className={styles.animDebug} />}
    </div>
  );
}
