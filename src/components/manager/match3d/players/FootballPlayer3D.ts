import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { LOD_FAR, type DetailLevel } from '../PlayerLOD';
import type { KitMaterial, LookMaterials } from './KitMaterial';
import type { HairStyle, PlayerLook } from './playerAppearance';
import type {
  AnimationClipId,
  AnimationCommand,
  LocomotionState,
} from './FootballAnimationStateMachine';
import type { LoadedPlayerAsset } from './playerAssets';

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
 *                Standing loops (IDLE, GK_READY) play at their own speed instead.
 *   action       the command's one-shot, at its normalised time and weight over the
 *                locomotion. A new `action.seq` restarts the clip; the same seq carries
 *                on — nothing restarts per frame.
 *
 * Every action is created and played once, paused, at construction; per frame only
 * `time` and weights change, then `mixer.update(0)` poses the bones. Nothing is
 * allocated per frame.
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
]);

/** States whose clip plays on the spot and keeps its own time. */
const STANDING: ReadonlySet<LocomotionState> = new Set<LocomotionState>(['IDLE', 'GK_READY']);

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

export class FootballPlayer3D {
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

  /** State → action. States sharing a clip (a substitute) share its action. */
  private readonly actions = new Map<AnimationClipId, AnimationAction>();
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

    this.mixer = new AnimationMixer(this.model);
    for (const [id, clip] of asset.resolved.clips) {
      const action = this.mixer.clipAction(clip);
      if (!this.actions.has(id)) {
        const oneShot = !(id === 'IDLE' || id === 'WALK' || id === 'JOG' || id === 'RUN' || id === 'SPRINT' || id === 'GK_READY');
        action.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
        action.clampWhenFinished = true;
        action.play();
        action.paused = true;
        action.setEffectiveWeight(0);
      }
      this.actions.set(id, action);
    }
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

    const keeper = command.isKeeper;
    const current = this.locomotionAction(command.locomotion.state, keeper);
    const previous = this.locomotionAction(command.locomotion.previous, keeper) ?? current;

    // A keeper action sent to anyone else is ignored: locomotion only.
    let actionState = command.action.state;
    if (actionState !== null && KEEPER_ONLY.has(actionState) && !keeper) actionState = null;
    const action = actionState !== null ? (this.actions.get(actionState) ?? null) : null;

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
    this.applyLevel(level);
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
    this.meshes.length = 0;
    this.weighted0 = this.weighted1 = this.weighted2 = null;
  }
}
