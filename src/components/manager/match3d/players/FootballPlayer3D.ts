import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type AnimationAction,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { makePose, makePoseScratch, proceduralOverlay, turnWeight } from '../AnimationController';
import { footedOf } from '../PlayerAppearance';
import { LOD_FAR, type DetailLevel } from '../PlayerLOD';
import type { KitMaterial, LookMaterials } from './KitMaterial';
import type { HairStyle, PlayerLook } from './playerAppearance';
import {
  LOCOMOTION_CLIPS,
  type AnimationClipId,
  type AnimationCommand,
  type LocomotionState,
} from './FootballAnimationStateMachine';
import type { LoadedPlayerAsset } from './playerAssets';
import type { Grip, HandsSource } from './heldBall';
import { ProceduralSkeletonLayer } from './ProceduralSkeletonLayer';

/**
 * One realistic footballer: a clone of the shared GLB with its own bones and its own
 * AnimationMixer, driven by the `AnimationCommand` the state machine already wrote.
 *
 * No animation logic lives here — which state, how far in, how much weight is the
 * command's. This only turns it into mixer weights and clip times:
 *
 *   locomotion   the command's state (and the one it is fading from) at the
 *                command's blend, LOCKED to the command's gait phase, so blended
 *                loops stay in step and the feet follow the ground the engine covers.
 *                Standing loops (IDLE, GK_READY, TURN) play at their own speed instead.
 *   action       the command's one-shot, at its normalised time and weight over the
 *                locomotion. A new `action.seq` restarts the clip; the same seq carries
 *                on — nothing restarts per frame.
 *
 * Every action is created and played once, paused, at construction; per frame only
 * `time` and weights change, then `mixer.update(0)` poses the bones. Nothing is
 * allocated per frame.
 *
 * Clips are found by logical state through the registry in playerAssets
 * (`CLIP_REGISTRY`, `VARIANT_CLIP_NAMES`) — nothing here knows a clip's name. A
 * state the model has no clip for is not dropped: the locomotion clip plays and the
 * procedural pose for the rest (the action, or the TURN pivot) is laid over the
 * model's bones by `ProceduralSkeletonLayer`. An action with takes (a celebration, a
 * keeper's catch or distribution) plays the take's own clip, or the action's one clip,
 * or the procedural pose.
 *
 * A keeper with the ball in their hands says where the hands are (`gripPoint`), read
 * off this frame's bones, so the stage can draw the ball in them.
 *
 * The look — kit, skin, hair, boots, gloves, sleeves, number, stature — is the
 * player's `PlayerLook`, applied once here: the body gets its own `KitMaterial` when
 * the model ships kit masks (one shared shader program for everyone), the matching
 * `Hair_*` variant is shown and tinted, `Gloves` only on a keeper. Where the model has
 * no masks or variants, its own materials and meshes are left as they are.
 *
 * One mixer per player, deliberately: three can drive many roots from one mixer
 * (`clipAction(clip, root)`), but a mixer per body keeps each player's bindings
 * self-contained — `uncacheRoot` releases exactly one player, and one bad body cannot
 * disturb the others. All mixers are still updated from the stage's single frame loop.
 */

const KEEPER_ONLY: ReadonlySet<AnimationClipId> = new Set<AnimationClipId>([
  'GK_READY',
  'GK_DIVE_LEFT',
  'GK_DIVE_RIGHT',
  'GK_CATCH',
  'GK_DISTRIBUTE',
]);

/** States whose clip plays on the spot and keeps its own time. */
const STANDING: ReadonlySet<LocomotionState> = new Set<LocomotionState>(['IDLE', 'GK_READY', 'TURN']);

/** Shared by every body: an update runs start to finish before the next begins. */
const overlayScratch = makePoseScratch();
const overlayDelta = makePose();
const handA = new Vector3();
const handB = new Vector3();
const reachA = new Vector3();
const reachB = new Vector3();
/**
 * How far past the wrist bone a ball held in one hand sits, towards the fingers, and
 * how far past the midpoint of the wrists one held in both: metres at stature 1.
 */
const ONE_HAND_REACH = 0.1;
const TWO_HAND_REACH = 0.05;

const LOD_SUFFIX = /_LOD([0-2])$/i;
const HAIR_MESH = /^Hair_(Short|Buzz|Long|Curly)/i;
const GLOVE_MESH = /^Gloves?(\b|_)/i;
/** When the model lacks a style, the nearest it has. */
const HAIR_FALLBACK: Record<HairStyle, readonly HairStyle[]> = {
  short: ['short', 'buzz', 'curly', 'long'],
  buzz: ['buzz', 'short', 'curly', 'long'],
  long: ['long', 'curly', 'short', 'buzz'],
  curly: ['curly', 'short', 'long', 'buzz'],
};

/**
 * Where in its standing loop a player starts, 0..1, from their id — so twenty-two
 * players who all stand still at kick-off do not breathe in unison.
 */
function standingOffset(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 8) & 0xffff) / 0x10000;
}

export class FootballPlayer3D implements HandsSource {
  readonly id: string;
  /** Placed at the player's spot, turned to their heading, scaled to their stature. */
  readonly root: Group;
  /** This player's clone of the model — the mixer's root. */
  readonly model: Object3D;
  readonly mixer: AnimationMixer;
  /** The look this body wears, for its whole life on the pitch. */
  readonly look: PlayerLook;
  /** The hair style actually shown (the look's, or the nearest the model has). */
  readonly hairShown: HairStyle | null;
  /** Whether the kit is drawn by a KitMaterial (the model shipped masks). */
  readonly kitApplied: boolean;
  /** The kicking foot, from the id — the same one the procedural body uses. */
  readonly footed: -1 | 1;

  /** State → action. States sharing a clip (a substitute) share its action. */
  private readonly actions = new Map<AnimationClipId, AnimationAction>();
  /** Per action with takes, the takes that have a clip of their own, by variant. */
  private readonly variants = new Map<AnimationClipId, (AnimationAction | null)[]>();
  /** Wrist and first knuckle bones, left then right; null where the model has none. */
  private readonly hands: [Object3D | null, Object3D | null];
  private readonly knuckles: [Object3D | null, Object3D | null];
  /** Procedural poses laid on the bones for what the model has no clip for. */
  private readonly layer: ProceduralSkeletonLayer;
  /** Whether part of last frame's pose was procedural (a missing clip), for diagnostics. */
  drawnByPose = false;
  private readonly meshes: Mesh[] = [];
  /** Meshes per level, when the model carries _LOD0/_LOD1/_LOD2 variants. */
  private readonly lodMeshes: [Mesh[], Mesh[], Mesh[]] = [[], [], []];
  private lod: DetailLevel | -1 = -1;
  /** Meshes the look hides (other hair styles, gloves on an outfield player). */
  private readonly hiddenByLook = new Set<Mesh>();
  private readonly ownMaterials: KitMaterial[] = [];

  /** The actions given weight last frame, cleared before the next is written. */
  private weighted0: AnimationAction | null = null;
  private weighted1: AnimationAction | null = null;
  private weighted2: AnimationAction | null = null;
  private actionSeq = 0;
  /** Own clock for standing loops, in simulation seconds (see `standingOffset`). */
  private standingTime = 0;
  private readonly standingPhase: number;

  constructor(id: string, asset: LoadedPlayerAsset, look: PlayerLook, materials: LookMaterials) {
    this.id = id;
    this.look = look;
    this.footed = footedOf(id);
    this.standingPhase = standingOffset(id);
    this.model = asset.clone();
    this.root = new Group();
    this.root.name = `player:${id}`;
    this.root.add(this.model);
    // Stature, once: 1.00 = the model's 1.80 m.
    this.root.scale.setScalar(look.stature);

    const hair = new Map<HairStyle, Mesh[]>();
    const gloves: Mesh[] = [];
    const body: Mesh[] = [];
    this.model.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      this.meshes.push(mesh);
      const lod = LOD_SUFFIX.exec(mesh.name);
      if (lod) this.lodMeshes[Number(lod[1]) as 0 | 1 | 2].push(mesh);
      const hairMatch = HAIR_MESH.exec(mesh.name);
      if (hairMatch) {
        const style = hairMatch[1]!.toLowerCase() as HairStyle;
        hair.set(style, [...(hair.get(style) ?? []), mesh]);
      } else if (GLOVE_MESH.test(mesh.name)) {
        gloves.push(mesh);
      } else {
        body.push(mesh);
      }
    });

    // Hair: the look's style (or the nearest the model has), tinted to the look's colour.
    const shown = hair.size > 0 ? (HAIR_FALLBACK[look.hairStyle].find((style) => hair.has(style)) ?? null) : null;
    this.hairShown = shown;
    for (const [style, meshes] of hair) {
      for (const mesh of meshes) {
        if (style === shown) mesh.material = this.tinted(materials, mesh.material, look.hairColor);
        else this.hideByLook(mesh);
      }
    }
    // Gloves: a keeper's, in the look's colour; nobody else wears them.
    for (const mesh of gloves) {
      if (look.gloves) mesh.material = this.tinted(materials, mesh.material, look.gloves);
      else this.hideByLook(mesh);
    }
    // The body: its own kit material over the model's maps — only if the model ships masks.
    let applied = false;
    for (const mesh of body) {
      if (Array.isArray(mesh.material)) continue;
      const kit = materials.body(mesh.material, look);
      if (!kit) break;
      mesh.material = kit;
      this.ownMaterials.push(kit);
      applied = true;
    }
    this.kitApplied = applied;

    // Measured from the bind pose, before any clip moves a bone.
    this.layer = new ProceduralSkeletonLayer(this.root, this.model, asset.skeleton.bones);
    const bone = (name: string | undefined): Object3D | null => (name ? (this.model.getObjectByName(name) ?? null) : null);
    const named = asset.skeleton.bones;
    this.hands = [bone(named.L_Hand), bone(named.R_Hand)];
    this.knuckles = [bone(named.L_Fingers1), bone(named.R_Fingers1)];

    this.mixer = new AnimationMixer(this.model);
    for (const [id, clip] of asset.resolved.clips) {
      const action = this.mixer.clipAction(clip);
      // A state that borrows another's clip shares its action, set up once, as a loop
      // if any state playing it is locomotion.
      if (!this.actions.has(id)) this.prepare(action, !(id in LOCOMOTION_CLIPS));
      this.actions.set(id, action);
    }
    for (const [id, clips] of asset.resolved.variants) {
      const takes = clips.map((clip) => {
        const action = clip ? this.mixer.clipAction(clip) : null;
        if (action) this.prepare(action, true);
        return action;
      });
      this.variants.set(id, takes);
    }
  }

  /** Played once, paused, at no weight: from here on only its time and weight change. */
  private prepare(action: AnimationAction, oneShot: boolean): void {
    action.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    action.setEffectiveWeight(0);
  }

  private tinted(materials: LookMaterials, material: Material | Material[], color: string): Material | Material[] {
    return Array.isArray(material) ? material : materials.tint(material, color);
  }

  private hideByLook(mesh: Mesh): void {
    mesh.visible = false;
    this.hiddenByLook.add(mesh);
  }

  /** Whether the model has a clip (its own or a substitute's) for a state. */
  has(state: AnimationClipId): boolean {
    return this.actions.has(state);
  }

  /** A locomotion state this player may play, after the keeper guard. */
  private locomotionAction(state: LocomotionState, keeper: boolean): AnimationAction | null {
    const guarded: LocomotionState = !keeper && state === 'GK_READY' ? 'IDLE' : state;
    return this.actions.get(guarded) ?? this.actions.get('IDLE') ?? null;
  }

  /**
   * Poses the body for one frame. `simDelta` is the adapter's render-clock step, so a
   * pause freezes standing loops too.
   */
  update(
    command: AnimationCommand,
    x: number,
    z: number,
    heading: number,
    simDelta: number,
    level: DetailLevel,
  ): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = heading;
    // Last frame's procedural change comes off before the mixer poses the bones.
    this.layer.restore();

    const keeper = command.isKeeper;
    const current = this.locomotionAction(command.locomotion.state, keeper);
    const previous = this.locomotionAction(command.locomotion.previous, keeper) ?? current;

    // A keeper action sent to anyone else is ignored: locomotion only.
    let actionState = command.action.state;
    if (actionState !== null && KEEPER_ONLY.has(actionState) && !keeper) actionState = null;
    let action = actionState !== null ? (this.actions.get(actionState) ?? null) : null;
    if (actionState !== null) action = this.variants.get(actionState)?.[command.action.variant] ?? action;
    // What the clips cannot show, the procedural pose will.
    const actionByPose = actionState !== null && action === null && command.action.weight > 0;
    const turnByPose = !this.actions.has('TURN') && turnWeight(command) > 0;

    // Clear last frame's weights; the three written below replace them.
    this.weighted0?.setEffectiveWeight(0);
    this.weighted1?.setEffectiveWeight(0);
    this.weighted2?.setEffectiveWeight(0);
    this.weighted0 = this.weighted1 = this.weighted2 = null;

    const actionWeight = action ? command.action.weight : 0;
    const locomotionWeight = 1 - actionWeight;

    if (current) {
      const standing = STANDING.has(command.locomotion.state);
      if (standing) this.standingTime += simDelta;
      const blend = command.locomotion.blend;
      const fading = previous !== null && previous !== current && blend < 1;
      this.placeLoop(current, standing, command.locomotion.phase);
      current.setEffectiveWeight(locomotionWeight * (fading ? blend : 1));
      this.weighted0 = current;
      if (fading && previous) {
        this.placeLoop(previous, STANDING.has(command.locomotion.previous), command.locomotion.phase);
        previous.setEffectiveWeight(locomotionWeight * (1 - blend));
        this.weighted1 = previous;
      }
    }

    if (action) {
      if (command.action.seq !== this.actionSeq) {
        // A new action from the state machine: restart its clip, once.
        this.actionSeq = command.action.seq;
        action.reset();
        action.paused = true;
      }
      // The clip is fitted to the action's length in the state machine, which is timed
      // against the engine's events (STEP 6 aligns the two from the clip metadata).
      action.time = Math.min(command.action.normalizedTime, 0.999) * action.getClip().duration;
      action.setEffectiveWeight(actionWeight);
      this.weighted2 = action;
    }

    this.mixer.update(0);
    this.drawnByPose =
      (actionByPose || turnByPose) &&
      this.layer.jointCount > 0 &&
      proceduralOverlay(overlayDelta, command, this.footed, overlayScratch, turnByPose, actionByPose);
    if (this.drawnByPose) this.layer.apply(overlayDelta);
    this.applyLevel(level);
  }

  /**
   * Where a ball held in `grip` sits this frame, world metres: past the wrist towards
   * the fingers for one hand, between the wrists for both. Read after `update` (the
   * bones are posed there). False when the model has no hand bones for it.
   */
  gripPoint(out: Vector3, grip: Grip): boolean {
    if (grip === 'both') {
      if (!this.reach(handA, reachA, 0) || !this.reach(handB, reachB, 1)) return false;
      out.addVectors(handA, handB).multiplyScalar(0.5);
      reachA.add(reachB);
      if (reachA.lengthSq() > 1e-8) out.addScaledVector(reachA.normalize(), TWO_HAND_REACH * this.look.stature);
      return true;
    }
    if (!this.reach(out, reachA, grip === 'left' ? 0 : 1)) return false;
    if (reachA.lengthSq() > 1e-8) out.addScaledVector(reachA.normalize(), ONE_HAND_REACH * this.look.stature);
    return true;
  }

  /** A wrist's world position into `at`, and the way to its knuckle (zero without one) into `towards`. */
  private reach(at: Vector3, towards: Vector3, side: 0 | 1): boolean {
    const hand = this.hands[side];
    if (!hand) return false;
    hand.updateWorldMatrix(true, false);
    hand.getWorldPosition(at);
    const knuckle = this.knuckles[side];
    if (knuckle) {
      knuckle.updateWorldMatrix(true, false);
      knuckle.getWorldPosition(towards).sub(at);
    } else {
      towards.set(0, 0, 0);
    }
    return true;
  }

  /** Moving loops follow the shared gait phase; standing loops keep their own time. */
  private placeLoop(action: AnimationAction, standing: boolean, phase: number): void {
    const duration = action.getClip().duration;
    if (duration <= 0) return;
    action.time = standing
      ? (this.standingTime + this.standingPhase * duration) % duration
      : phase * duration;
  }

  /**
   * The existing distance levels: shadow casting drops at the far level as it does
   * for the procedural body, and _LOD meshes switch where the model has them. A model
   * with one mesh set uses it at every distance — no geometry is invented.
   */
  private applyLevel(level: DetailLevel): void {
    if (level === this.lod) return;
    this.lod = level;
    const casts = level !== LOD_FAR;
    for (const mesh of this.meshes) mesh.castShadow = casts;
    const sets = this.lodMeshes;
    if (sets[0].length + sets[1].length + sets[2].length === 0) return;
    // The nearest level the model provides at or below this one's detail.
    let chosen: number = level;
    while (chosen > 0 && sets[chosen]!.length === 0) chosen -= 1;
    while (chosen < 2 && sets[chosen]!.length === 0) chosen += 1;
    for (let index = 0; index < 3; index += 1) {
      for (const mesh of sets[index]!) mesh.visible = index === chosen && !this.hiddenByLook.has(mesh);
    }
  }

  /**
   * Releases this player only. Geometry, textures and shared materials belong to the
   * master and stay for the other players.
   */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
    // This player's own kit material; the tinted hair/glove materials are shared.
    for (const material of this.ownMaterials) material.dispose();
    this.ownMaterials.length = 0;
    this.hiddenByLook.clear();
    this.actions.clear();
    this.variants.clear();
    this.meshes.length = 0;
    this.weighted0 = this.weighted1 = this.weighted2 = null;
  }
}
