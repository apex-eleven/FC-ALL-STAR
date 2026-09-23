import { Group } from 'three';
import type { DetailLevel } from '../PlayerLOD';
import { LookMaterials } from './KitMaterial';
import type { PlayerLook } from './playerAppearance';
import { FootballAnimationStateMachine, type AnimationCommand } from './FootballAnimationStateMachine';
import { FootballPlayer3D } from './FootballPlayer3D';
import {
  loadPlayerAsset,
  type LoadedPlayerAsset,
  type PlayerAssetResult,
  type PlayerAssetStatus,
} from './playerAssets';

/**
 * The twenty-two players, as the renderer sees them — keyed by player id, never by
 * array position.
 *
 * Each player has one runtime for as long as they are on the pitch: their animation
 * state machine, their `PlayerLook` (resolved once, by id), their heading and gaze, and — once the realistic model
 * has loaded — their `FootballPlayer3D`. Until then, or whenever the model is missing,
 * invalid or fails, `fallback` is true and the stage draws the procedural `Player3D`
 * for them instead; identity, animation state and heading carry across unchanged,
 * because they live here and not in either body.
 *
 * Imperative on purpose: one object, updated from the stage's single frame loop. The
 * GLB bodies hang off `group`, which React mounts once as a <primitive>.
 */

export interface FootballPlayerRuntime {
  readonly id: string;
  /** This player's animation state machine. A substitute gets a new one. */
  readonly machine: FootballAnimationStateMachine;
  /** Resolved once for this id; a substitute is a new id with its own. */
  readonly look: PlayerLook;
  isActive: boolean;
  /** Drawn by the procedural Player3D (no model, or the model cannot be used). */
  fallback: boolean;
  /** The realistic body, when the model is ready. */
  body: FootballPlayer3D | null;
  /** The heading the body is drawn at, eased towards the command's. */
  heading: number;
  /** Where the head is turned to watch the ball (procedural body). */
  lookY: number;
}

type LoadAsset = () => Promise<PlayerAssetResult>;

export class PlayerPool {
  /** Mounted once into the scene; GLB bodies are added and removed here. */
  readonly group = new Group();

  private readonly runtimes = new Map<string, FootballPlayerRuntime>();
  private asset: LoadedPlayerAsset | null = null;
  /** The loaded model's shared look materials (kit textures, tinted hair and gloves). */
  private materials: LookMaterials | null = null;
  private assetStatus: PlayerAssetStatus = 'idle';
  /** The model has been asked for (once per pool). */
  private requested = false;
  /**
   * Mounted and drawing. `start`/`dispose` may run more than once on the same pool —
   * React's StrictMode mounts, unmounts and remounts every effect in development — so
   * stopping never breaks a later start.
   */
  private live = false;
  /** Set when a body threw at runtime: the model is abandoned for the rest of the match. */
  private degraded = false;

  constructor() {
    this.group.name = 'PlayerPool';
  }

  /** How the realistic model stands: 'ready' means GLB bodies are being drawn. */
  get status(): PlayerAssetStatus {
    return this.degraded ? 'error' : this.assetStatus;
  }

  /** Players currently drawn by the realistic model. */
  get modelBodies(): number {
    let count = 0;
    for (const runtime of this.runtimes.values()) if (runtime.body) count += 1;
    return count;
  }

  get size(): number {
    return this.runtimes.size;
  }

  /**
   * Starts looking for the model — called when the 3D match mounts, never before. The
   * procedural players keep playing while it loads, and for good if it never does.
   */
  start(load: LoadAsset = loadPlayerAsset): void {
    this.live = true;
    if (this.requested) return;
    this.requested = true;
    this.assetStatus = 'loading';
    void load().then((result) => {
      this.assetStatus = result.status;
      if (result.status !== 'ready' || !result.asset || this.degraded) return;
      this.asset = result.asset;
      this.materials = new LookMaterials(result.asset.kit);
      if (!this.live) return;
      // Everyone already on the pitch changes body now, keeping id, state and heading.
      for (const runtime of this.runtimes.values()) {
        runtime.machine.setStrideModel(result.asset.strideModel);
        this.attachBody(runtime);
      }
    });
  }

  get(id: string): FootballPlayerRuntime | undefined {
    return this.runtimes.get(id);
  }

  /**
   * The runtime for a player id, made the first time the id is seen. Allocates only
   * then — every later frame is a map lookup.
   */
  acquire(id: string, look: PlayerLook, heading: number): FootballPlayerRuntime {
    const found = this.runtimes.get(id);
    if (found) return found;
    const machine = new FootballAnimationStateMachine();
    if (this.asset) machine.setStrideModel(this.asset.strideModel);
    const runtime: FootballPlayerRuntime = {
      id,
      machine,
      look,
      isActive: true,
      fallback: true,
      body: null,
      heading,
      lookY: 0,
    };
    this.runtimes.set(id, runtime);
    this.attachBody(runtime);
    return runtime;
  }

  /** A player left the pitch (substituted, sent off): everything of theirs goes. */
  release(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.isActive = false;
    runtime.body?.dispose();
    runtime.body = null;
    this.runtimes.delete(id);
  }

  /**
   * Draws a player with the realistic body if they have one. Returns false when the
   * stage must draw the procedural body instead — no model yet, or it failed.
   */
  draw(
    runtime: FootballPlayerRuntime,
    command: AnimationCommand,
    x: number,
    z: number,
    simDelta: number,
    level: DetailLevel,
  ): boolean {
    const body = runtime.body;
    if (!body) {
      runtime.fallback = true;
      return false;
    }
    try {
      body.update(command, x, z, runtime.heading, simDelta, level);
      runtime.fallback = false;
      return true;
    } catch (error) {
      this.degrade(error);
      return false;
    }
  }

  private attachBody(runtime: FootballPlayerRuntime): void {
    if (!this.asset || this.degraded || runtime.body) return;
    if (!this.materials) this.materials = new LookMaterials(this.asset.kit);
    try {
      const body = new FootballPlayer3D(runtime.id, this.asset, runtime.look, this.materials);
      runtime.body = body;
      this.group.add(body.root);
    } catch (error) {
      this.degrade(error);
    }
  }

  /**
   * A body failed at runtime. The match must not: every player goes back to the
   * procedural body for the rest of it, and the reason goes to the console once.
   */
  private degrade(error: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    // eslint-disable-next-line no-console
    console.warn('[players] GLB player runtime failed; drawing the procedural players.', error);
    for (const runtime of this.runtimes.values()) {
      runtime.body?.dispose();
      runtime.body = null;
      runtime.fallback = true;
      runtime.machine.setStrideModel(null);
    }
    this.materials?.dispose();
    this.materials = null;
    this.asset = null;
  }

  /**
   * The view unmounted: every player's body and state go. The loaded model stays
   * cached (module-level) and a later `start` rebuilds players as they are seen.
   */
  dispose(): void {
    this.live = false;
    for (const runtime of this.runtimes.values()) {
      runtime.isActive = false;
      runtime.body?.dispose();
      runtime.body = null;
    }
    this.runtimes.clear();
    // Shared tinted materials go with the players; a later start makes them again.
    this.materials?.dispose();
    this.materials = this.asset ? new LookMaterials(this.asset.kit) : null;
  }
}
