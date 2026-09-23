import {
  Box3,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  Texture,
  type AnimationClip,
  type Bone,
  type Object3D,
} from 'three';
import type { KitTextures } from './KitMaterial';
import {
  ACTION_METADATA,
  LOCOMOTION_CLIPS,
  type AnimationClipId,
  type AnimationClipMetadata,
} from './FootballAnimationStateMachine';

/**
 * The one place the realistic player model is described, found and loaded.
 *
 * Nothing here is an asset. The model is an artist-authored GLB dropped into
 * `public/models/players/`; until one exists, `loadPlayerAsset()` reports `missing` and
 * the match draws the procedural `Player3D` exactly as before. Swapping a model is a
 * manifest change — a new file name and version — and nothing else in the renderer
 * holds a path.
 *
 * The contract the file must meet (see STEP 1's model specification):
 *   glTF 2.0 binary · Y-up · forward +Z · 1 unit = 1 m · ~1.80 m tall · origin on the
 *   ground between the feet · A-pose bind · the humanoid skeleton below · the clips
 *   named in CLIP_REGISTRY, in place (no root motion), loops starting at left-foot
 *   contact.
 *
 * Loading is lazy: nothing is fetched and no loader code is downloaded until the 3D
 * match asks for it, and the result is cached for the session so a second match does
 * not fetch again.
 */

/* ── Manifest ───────────────────────────────────────────────────────────────── */

export type ForwardAxis = '+Z' | '-Z' | '+X' | '-X';

export interface PlayerAssetManifest {
  /** Bumped with every new model file, and part of its file name. */
  version: number;
  /** Off switch: the match never looks for a model. */
  enabled: boolean;
  /** The humanoid model: mesh, skeleton and (optionally) its clips. */
  modelUrl: string;
  /** Clips shipped separately, on the same skeleton. Absent is fine. */
  animationUrl: string | null;
  /** Optional JSON sidecar of clip metadata (stride, contacts). Absent is fine. */
  metadataUrl: string | null;
  /** Which way the model faces as authored. Rotated to +Z once, at load. */
  forwardAxis: ForwardAxis;
  /** Standing height the model should measure, metres. */
  expectedHeight: number;
  /**
   * Metres per model unit, when known. null measures the model: a centimetre-unit
   * export (≈180 tall) is corrected by 0.01; anything else must already be metres.
   */
  unitScale: number | null;
  /** Kit masks (see KitMaterial). Both must load, or the model keeps its own materials. */
  kitMaskAUrl: string | null;
  kitMaskBUrl: string | null;
  /** Ten digit glyphs 0–9 in a row, for shirt numbers. Absent: no numbers drawn. */
  numberAtlasUrl: string | null;
  /** Where the number area sits in the body's UVs: [u0, v0, u1, v1]. */
  numberUvRect: readonly [number, number, number, number] | null;
  /** Per-asset clip-name overrides, checked before CLIP_REGISTRY's defaults. */
  clipNames: Partial<Record<AnimationClipId, readonly string[]>>;
  /** What draws a player when the model cannot. */
  fallback: 'procedural';
}

function baseUrl(): string {
  // Vite injects BASE_URL; outside Vite (headless checks) it is the site root.
  return import.meta.env?.BASE_URL ?? '/';
}

/**
 * The model in use. A plain object on purpose: one edit here when the artist's file
 * arrives — or a new version — and every player picks it up.
 */
export const PLAYER_ASSET_MANIFEST: PlayerAssetManifest = {
  version: 1,
  enabled: true,
  modelUrl: `${baseUrl()}models/players/player_v1.glb`,
  animationUrl: `${baseUrl()}models/players/animations_v1.glb`,
  metadataUrl: `${baseUrl()}models/players/animations_v1.json`,
  kitMaskAUrl: `${baseUrl()}models/players/T_Body_MaskA.png`,
  kitMaskBUrl: `${baseUrl()}models/players/T_Body_MaskB.png`,
  numberAtlasUrl: `${baseUrl()}models/players/T_Numbers.png`,
  // The upper back of player_v1's shirt, measured from the model's own UVs (upright, not mirrored).
  numberUvRect: [0.09, 0.735, 0.19, 0.84],
  forwardAxis: '+Z',
  expectedHeight: 1.8,
  unitScale: null,
  clipNames: {},
  fallback: 'procedural',
};

/* ── Skeleton contract ──────────────────────────────────────────────────────── */

/**
 * Bones by their contract name, with the other names common exporters give the same
 * bone (Mixamo `LeftUpLeg`, Unreal `thigh_l`, Blender `upperleg.L`). Names are
 * compared with case, separators and a `mixamorig` / `Armature` prefix stripped.
 */
export const REQUIRED_BONES = {
  Hips: ['hips', 'pelvis'],
  Head: ['head'],
  L_UpperLeg: ['lupperleg', 'leftupleg', 'leftupperleg', 'upperlegl', 'thighl', 'lthigh'],
  R_UpperLeg: ['rupperleg', 'rightupleg', 'rightupperleg', 'upperlegr', 'thighr', 'rthigh'],
  L_LowerLeg: ['llowerleg', 'leftleg', 'leftlowerleg', 'lowerlegl', 'calfl', 'shinl', 'lcalf'],
  R_LowerLeg: ['rlowerleg', 'rightleg', 'rightlowerleg', 'lowerlegr', 'calfr', 'shinr', 'rcalf'],
  L_Foot: ['lfoot', 'leftfoot', 'footl'],
  R_Foot: ['rfoot', 'rightfoot', 'footr'],
  L_UpperArm: ['lupperarm', 'leftarm', 'leftupperarm', 'upperarml'],
  R_UpperArm: ['rupperarm', 'rightarm', 'rightupperarm', 'upperarmr'],
  L_ForeArm: ['lforearm', 'leftforearm', 'forearml', 'lowerarml'],
  R_ForeArm: ['rforearm', 'rightforearm', 'forearmr', 'lowerarmr'],
} as const;

/** Wanted but not required: a model without fingers or toes still plays. */
export const OPTIONAL_BONES = {
  Root: ['root'],
  Spine: ['spine', 'spine01'],
  Spine1: ['spine1', 'spine02'],
  Spine2: ['spine2', 'spine03', 'chest'],
  Neck: ['neck', 'neck01'],
  L_Shoulder: ['lshoulder', 'leftshoulder', 'shoulderl', 'claviclel'],
  R_Shoulder: ['rshoulder', 'rightshoulder', 'shoulderr', 'clavicler'],
  L_Hand: ['lhand', 'lefthand', 'handl'],
  R_Hand: ['rhand', 'righthand', 'handr'],
  L_Thumb1: ['lthumb1', 'lefthandthumb1', 'thumb01l'],
  R_Thumb1: ['rthumb1', 'righthandthumb1', 'thumb01r'],
  L_Fingers1: ['lfingers1', 'lefthandindex1', 'index01l'],
  R_Fingers1: ['rfingers1', 'righthandindex1', 'index01r'],
  L_Toe: ['ltoe', 'lefttoebase', 'balll', 'toel'],
  R_Toe: ['rtoe', 'righttoebase', 'ballr', 'toer'],
} as const;

export type RequiredBone = keyof typeof REQUIRED_BONES;
export type OptionalBone = keyof typeof OPTIONAL_BONES;

/** Lower-cased, separators and exporter prefixes removed: 'mixamorig:LeftUpLeg' → 'leftupleg'. */
export function normalizeBoneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(mixamorig\d*|armature)[:_.\s-]*/, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface SkeletonReport {
  ok: boolean;
  /** Contract name → the bone's actual name in the file. */
  bones: Partial<Record<RequiredBone | OptionalBone, string>>;
  missing: RequiredBone[];
  /** Why it cannot be used. Empty when `ok`. */
  problems: string[];
  /** Worth knowing, not disqualifying. */
  notes: string[];
}

/**
 * Checks a loaded scene against the humanoid contract. Pure over the scene graph:
 * it reads names and parents, and changes nothing.
 */
export function validatePlayerSkeleton(scene: Object3D | null | undefined): SkeletonReport {
  const report: SkeletonReport = { ok: false, bones: {}, missing: [], problems: [], notes: [] };
  if (!scene) {
    report.problems.push('the file has no scene');
    return report;
  }

  const bones: Bone[] = [];
  let skinned = 0;
  scene.traverse((node) => {
    if ((node as Bone).isBone) bones.push(node as Bone);
    if ((node as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned += 1;
  });
  if (skinned === 0) report.problems.push('no skinned mesh — the body is not bound to a skeleton');
  if (bones.length === 0) {
    report.problems.push('no skeleton (no bones)');
    return report;
  }
  // The skeleton's root: a bone whose parent is not a bone. Exactly the one the
  // contract calls `Root`, or `Hips` when the exporter has no separate root.
  const roots = bones.filter((bone) => !(bone.parent as Bone | null)?.isBone);
  if (roots.length === 0) report.problems.push('the skeleton has no root bone');
  // Extra top-level bones (IK targets, props) are common and harmless.
  if (roots.length > 1) report.notes.push(`${roots.length} top-level bones: ${roots.map((bone) => bone.name).join(', ')}`);

  const byName = new Map<string, string>();
  for (const bone of bones) byName.set(normalizeBoneName(bone.name), bone.name);

  const find = (aliases: readonly string[]): string | undefined => {
    for (const alias of aliases) {
      const found = byName.get(alias);
      if (found) return found;
    }
    return undefined;
  };
  for (const [bone, aliases] of Object.entries(REQUIRED_BONES) as [RequiredBone, readonly string[]][]) {
    const found = find(aliases);
    if (found) report.bones[bone] = found;
    else report.missing.push(bone);
  }
  for (const [bone, aliases] of Object.entries(OPTIONAL_BONES) as [OptionalBone, readonly string[]][]) {
    const found = find(aliases);
    if (found) report.bones[bone] = found;
  }
  if (report.missing.length > 0) report.problems.push(`missing bones: ${report.missing.join(', ')}`);

  report.ok = report.problems.length === 0;
  return report;
}

/* ── Clip registry ──────────────────────────────────────────────────────────── */

/**
 * Animation state → the clip names it may be called in the file, first match wins,
 * compared case-insensitively. Edit this (or the manifest's `clipNames`) when the
 * artist's file arrives; nothing else needs to know the names.
 */
export const CLIP_REGISTRY: Readonly<Record<AnimationClipId, readonly string[]>> = {
  IDLE: ['Idle', 'Idle_01', 'Idle01', 'Stand'],
  WALK: ['Walk', 'Walk_01', 'Walking'],
  JOG: ['Jog', 'Jog_01', 'Jogging'],
  RUN: ['Run', 'Run_01', 'Running'],
  SPRINT: ['Sprint', 'Sprint_01', 'Sprinting'],
  TURN: ['Turn', 'Turn_In_Place', 'TurnInPlace', 'Pivot'],
  GK_READY: ['GK_Ready', 'Keeper_Ready'],
  PASS: ['Pass', 'Pass_01'],
  RECEIVE: ['Receive', 'Trap', 'Control'],
  INTERCEPTION: ['Interception', 'Intercept'],
  SHOOT: ['Shoot', 'Shot', 'Shoot_01'],
  TACKLE: ['Tackle', 'Tackle_01'],
  CELEBRATE: ['Celebrate', 'Celebration'],
  GK_DIVE_LEFT: ['GK_Dive_Left', 'GK_DiveLeft', 'Keeper_Dive_Left'],
  GK_DIVE_RIGHT: ['GK_Dive_Right', 'GK_DiveRight', 'Keeper_Dive_Right'],
  // GOALKEEPER_SAVE: the save made standing — set, reach, gather, recover.
  GK_CATCH: ['GK_Catch', 'Keeper_Catch', 'GK_Save', 'Keeper_Save'],
};

/**
 * The celebration's takes, by variant (see CELEBRATION_VARIANTS): a model may ship
 * one clip per take. A take it lacks plays the model's single CELEBRATE clip instead,
 * and with no celebration clip at all the procedural take is drawn on its skeleton.
 */
export const CELEBRATION_CLIP_NAMES: readonly (readonly string[])[] = [
  ['Celebrate_1', 'Celebration_1', 'Celebrate_01'],
  ['Celebrate_2', 'Celebration_2', 'Celebrate_02'],
  ['Celebrate_3', 'Celebration_3', 'Celebrate_03'],
];

/**
 * The clips the model cannot play without. Missing any of them, the model is not
 * used at all and the procedural body carries on — a player who can stand, walk and
 * run but not jog is better drawn by the fallback than half-animated.
 */
export const REQUIRED_CLIPS: readonly AnimationClipId[] = ['IDLE', 'WALK', 'RUN'];

/**
 * What stands in for an optional clip that is missing, in order. A state with no
 * clip and no stand-in (most one-shot actions, TURN) is drawn by the procedural pose
 * laid over the skeleton's locomotion (see FootballPlayer3D), and the load says so
 * once in the console — never per frame.
 */
export const CLIP_SUBSTITUTES: Partial<Record<AnimationClipId, readonly AnimationClipId[]>> = {
  JOG: ['RUN', 'WALK'],
  SPRINT: ['RUN'],
  GK_READY: ['IDLE'],
  INTERCEPTION: ['RECEIVE'],
};

export const ALL_CLIP_IDS: readonly AnimationClipId[] = Object.keys(CLIP_REGISTRY) as AnimationClipId[];

function contractMetadata(id: AnimationClipId): AnimationClipMetadata {
  return id in LOCOMOTION_CLIPS
    ? LOCOMOTION_CLIPS[id as keyof typeof LOCOMOTION_CLIPS]
    : ACTION_METADATA[id as keyof typeof ACTION_METADATA].clip;
}

export interface ResolvedClips {
  /** State → the clip it plays (its own, or a substitute's). */
  clips: Map<AnimationClipId, AnimationClip>;
  /** State → which state's clip it borrowed, where it borrowed one. */
  substituted: Map<AnimationClipId, AnimationClipId>;
  /** States with no clip at all. */
  absent: AnimationClipId[];
  missingRequired: AnimationClipId[];
  /** One entry per celebration take: its own clip, or null (see CELEBRATION_CLIP_NAMES). */
  celebrations: (AnimationClip | null)[];
}

/** Matches the file's clips to animation states through the registry. */
export function resolveClips(
  available: readonly AnimationClip[],
  overrides: PlayerAssetManifest['clipNames'] = {},
): ResolvedClips {
  const byName = new Map<string, AnimationClip>();
  for (const clip of available) byName.set(clip.name.toLowerCase(), clip);

  const own = new Map<AnimationClipId, AnimationClip>();
  for (const id of ALL_CLIP_IDS) {
    const names = [...(overrides[id] ?? []), ...CLIP_REGISTRY[id]];
    for (const name of names) {
      const clip = byName.get(name.toLowerCase());
      if (clip) {
        own.set(id, clip);
        break;
      }
    }
  }

  const celebrations = CELEBRATION_CLIP_NAMES.map(
    (names) => names.map((name) => byName.get(name.toLowerCase())).find((clip) => clip !== undefined) ?? null,
  );
  const result: ResolvedClips = { clips: new Map(own), substituted: new Map(), absent: [], missingRequired: [], celebrations };
  for (const id of ALL_CLIP_IDS) {
    if (own.has(id)) continue;
    const stand = CLIP_SUBSTITUTES[id]?.find((other) => own.has(other));
    if (stand) {
      result.clips.set(id, own.get(stand)!);
      result.substituted.set(id, stand);
    } else {
      result.absent.push(id);
    }
  }
  result.missingRequired = REQUIRED_CLIPS.filter((id) => !own.has(id));
  return result;
}

/* ── Loading ────────────────────────────────────────────────────────────────── */

export type PlayerAssetStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'missing'
  | 'invalid'
  | 'error'
  | 'disabled';

export interface LoadedPlayerAsset {
  version: number;
  /** The normalised master: scaled to metres, turned to face +Z, feet on y = 0. Never drawn. */
  master: Group;
  /** A new player body sharing the master's geometry and materials, with its own bones. */
  clone(): Object3D;
  resolved: ResolvedClips;
  /** Clip metadata: the sidecar's where it has one, the contract's placeholder otherwise. */
  metadata: Map<AnimationClipId, AnimationClipMetadata>;
  skeleton: SkeletonReport;
  /** Height as authored (metres, after unit correction) and the scale applied. */
  measuredHeight: number;
  unitScale: number;
  /** Mesh names ending _LOD0/_LOD1/_LOD2, if the file carries levels of detail. */
  hasLodMeshes: boolean;
  /**
   * Stride per speed from the sidecar's MEASURED strides, for the state machine's
   * gait phase. null when the sidecar has none: the placeholder cadence is used and
   * authored clips may slide until the strides are measured.
   */
  strideModel: ((speed: number) => number) | null;
  /** The kit masks and number atlas, loaded once for every player. Null: no masks shipped. */
  kit: KitTextures | null;
}

export interface PlayerAssetResult {
  status: PlayerAssetStatus;
  asset: LoadedPlayerAsset | null;
  /** Why it is not usable, for the console. */
  reason: string | null;
}

/** glTF binary files start with the ASCII magic "glTF". */
const GLB_MAGIC = 0x46546c67;

function devLog(level: 'info' | 'warn', message: string): void {
  // A missing model is the normal state until one is delivered: say so only while
  // developing. A broken one is always worth a warning.
  if (level === 'info' && !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console[level](`[players] ${message}`);
}

/**
 * Fetches a binary glTF, telling "not there" apart from "there but not a GLB". A
 * missing file on this site does not 404: the SPA rewrite (vercel.json, and Vite's
 * dev fallback) answers with index.html, so the answer is checked, not trusted.
 */
async function fetchGlb(url: string): Promise<{ buffer: ArrayBuffer } | { missing: true } | { invalid: string }> {
  const response = await fetch(url).catch(() => null);
  if (!response || !response.ok) return { missing: true };
  const html = (response.headers.get('content-type') ?? '').includes('text/html');
  // Read either way (a small index.html when missing) so the request completes cleanly.
  const buffer = await response.arrayBuffer();
  if (html) return { missing: true };
  if (buffer.byteLength < 12 || new DataView(buffer).getUint32(0, true) !== GLB_MAGIC) {
    return { invalid: 'not a binary glTF (GLB) file' };
  }
  return { buffer };
}

/**
 * An image as a texture, or null when it is not there (the same SPA-fallback check as
 * the model). Masks are data: no colour conversion, nearest filtering so coded values
 * arrive exact. The digit atlas is filtered normally.
 */
async function fetchTexture(url: string | null, kind: 'mask' | 'atlas'): Promise<Texture | null> {
  if (!url) return null;
  const response = await fetch(url).catch(() => null);
  if (!response || !response.ok) return null;
  const type = response.headers.get('content-type') ?? '';
  const blob = await response.blob();
  if (!type.startsWith('image/')) return null;
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(() => null);
  if (!bitmap) return null;
  const texture = new Texture(bitmap);
  // glTF UVs: the image is not flipped (ImageBitmaps are uploaded as they are).
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  if (kind === 'mask') {
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
  } else {
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
  }
  texture.needsUpdate = true;
  return texture;
}

async function loadKitTextures(manifest: PlayerAssetManifest): Promise<KitTextures | null> {
  const [maskA, maskB] = await Promise.all([
    fetchTexture(manifest.kitMaskAUrl, 'mask'),
    fetchTexture(manifest.kitMaskBUrl, 'mask'),
  ]);
  if (!maskA || !maskB) {
    maskA?.dispose();
    maskB?.dispose();
    devLog('info', 'no kit masks (T_Body_MaskA/B): the model keeps its own materials; kits are not applied to it');
    return null;
  }
  const numberAtlas = await fetchTexture(manifest.numberAtlasUrl, 'atlas');
  if (!numberAtlas || !manifest.numberUvRect) {
    devLog('info', 'no number atlas or number UV area: shirt numbers are not drawn on the model');
  }
  return { maskA, maskB, numberAtlas, numberUvRect: manifest.numberUvRect };
}

async function fetchJson(url: string | null): Promise<unknown> {
  if (!url) return null;
  const response = await fetch(url).catch(() => null);
  if (!response || !response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) return null;
  return response.json().catch(() => null);
}

const FORWARD_YAW: Record<ForwardAxis, number> = {
  '+Z': 0,
  '-Z': Math.PI,
  // Turn the authored forward axis onto +Z.
  '+X': -Math.PI / 2,
  '-X': Math.PI / 2,
};

/** Plausible standing heights once in metres; outside this the file is refused. */
const HEIGHT_MIN = 1.5;
const HEIGHT_MAX = 2.15;

/**
 * Wraps the scene so the model meets the world's conventions: metres, facing +Z,
 * feet on the ground, centred between the feet. Done once, on the master; every
 * clone inherits it, and nothing is corrected per frame.
 */
function normalize(
  scene: Object3D,
  manifest: PlayerAssetManifest,
): { master: Group; height: number; unitScale: number } | { invalid: string } {
  const master = new Group();
  master.name = `PlayerModel_v${manifest.version}`;
  master.add(scene);
  master.updateMatrixWorld(true);

  // Precise: measures the skinned vertices in the bind pose, not loose bounds.
  const raw = new Box3().setFromObject(master, true);
  const rawHeight = raw.max.y - raw.min.y;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) return { invalid: 'the model has no measurable height' };

  let unitScale = manifest.unitScale ?? 1;
  if (manifest.unitScale === null && rawHeight > manifest.expectedHeight * 50) {
    // Exported in centimetres (≈180 units tall): a unit mismatch, not a size choice.
    unitScale = 0.01;
  }
  const height = rawHeight * unitScale;
  if (height < HEIGHT_MIN || height > HEIGHT_MAX) {
    return {
      invalid: `the model stands ${height.toFixed(2)} m tall; expected about ${manifest.expectedHeight} m (1 unit = 1 m)`,
    };
  }

  master.scale.setScalar(unitScale);
  master.rotation.y = FORWARD_YAW[manifest.forwardAxis];
  master.updateMatrixWorld(true);
  const placed = new Box3().setFromObject(master, true);
  // Origin on the ground between the feet.
  master.position.set(
    -(placed.min.x + placed.max.x) / 2,
    -placed.min.y,
    -(placed.min.z + placed.max.z) / 2,
  );
  master.updateMatrixWorld(true);
  return { master, height, unitScale };
}

const MOVING_CLIPS: readonly AnimationClipId[] = ['WALK', 'JOG', 'RUN', 'SPRINT'];

/**
 * Builds stride-at-speed from measured clips: each moving clip is a point (its own
 * speed, stride / duration, and its stride), joined piecewise-linearly, held flat
 * beyond the ends. Only strides the sidecar measured count — never placeholders.
 */
export function strideModelFrom(
  measured: ReadonlyMap<AnimationClipId, { strideMeters: number; duration: number }>,
): ((speed: number) => number) | null {
  const points: { speed: number; stride: number }[] = [];
  for (const id of MOVING_CLIPS) {
    const clip = measured.get(id);
    if (!clip || clip.strideMeters <= 0 || clip.duration <= 0) continue;
    points.push({ speed: clip.strideMeters / clip.duration, stride: clip.strideMeters });
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.speed - b.speed);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (speed: number): number => {
    if (speed <= first.speed) return first.stride;
    if (speed >= last.speed) return last.stride;
    for (let index = 1; index < points.length; index += 1) {
      const high = points[index]!;
      if (speed <= high.speed) {
        const low = points[index - 1]!;
        return low.stride + ((speed - low.speed) / (high.speed - low.speed)) * (high.stride - low.stride);
      }
    }
    return last.stride;
  };
}

function readSidecar(raw: unknown): Map<AnimationClipId, Partial<AnimationClipMetadata>> {
  const out = new Map<AnimationClipId, Partial<AnimationClipMetadata>>();
  const clips = (raw as { clips?: Record<string, unknown> } | null)?.clips;
  if (!clips || typeof clips !== 'object') return out;
  for (const id of ALL_CLIP_IDS) {
    const entry = clips[id] as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const parsed: Partial<AnimationClipMetadata> = {};
    if (typeof entry.strideMeters === 'number' && entry.strideMeters >= 0) parsed.strideMeters = entry.strideMeters;
    if (typeof entry.loop === 'boolean') parsed.loop = entry.loop;
    if (typeof entry.ballContactTime === 'number') parsed.ballContactTime = entry.ballContactTime;
    const contacts = entry.footContacts;
    if (Array.isArray(contacts) && contacts.length === 2 && contacts.every((t) => typeof t === 'number')) {
      parsed.footContacts = [contacts[0] as number, contacts[1] as number];
    }
    out.set(id, parsed);
  }
  return out;
}

async function load(manifest: PlayerAssetManifest): Promise<PlayerAssetResult> {
  if (!manifest.enabled) return { status: 'disabled', asset: null, reason: 'disabled in the manifest' };

  const model = await fetchGlb(manifest.modelUrl);
  if ('missing' in model) return { status: 'missing', asset: null, reason: `no model at ${manifest.modelUrl}` };
  if ('invalid' in model) return { status: 'invalid', asset: null, reason: `${manifest.modelUrl}: ${model.invalid}` };

  // The loader code is only downloaded now, when there is a model to load.
  const [{ GLTFLoader }, { clone }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/utils/SkeletonUtils.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  // gltfpack / gltf-transform meshopt compression, per the asset pipeline.
  loader.setMeshoptDecoder(MeshoptDecoder);
  const resourcePath = manifest.modelUrl.slice(0, manifest.modelUrl.lastIndexOf('/') + 1);
  const gltf = await loader.parseAsync(model.buffer, resourcePath);

  const skeleton = validatePlayerSkeleton(gltf.scene);
  if (!skeleton.ok) return { status: 'invalid', asset: null, reason: `skeleton: ${skeleton.problems.join('; ')}` };

  const clips: AnimationClip[] = [...gltf.animations];
  if (manifest.animationUrl) {
    const extra = await fetchGlb(manifest.animationUrl);
    if ('buffer' in extra) clips.push(...(await loader.parseAsync(extra.buffer, resourcePath)).animations);
    else if ('invalid' in extra) devLog('warn', `${manifest.animationUrl}: ${extra.invalid}; using the model's own clips`);
  }
  const resolved = resolveClips(clips, manifest.clipNames);
  if (resolved.missingRequired.length > 0) {
    return {
      status: 'invalid',
      asset: null,
      reason: `missing required clips: ${resolved.missingRequired.join(', ')} (see CLIP_REGISTRY)`,
    };
  }

  const normalized = normalize(gltf.scene, manifest);
  if ('invalid' in normalized) return { status: 'invalid', asset: null, reason: normalized.invalid };

  const sidecar = readSidecar(await fetchJson(manifest.metadataUrl));
  const metadata = new Map<AnimationClipId, AnimationClipMetadata>();
  const measured = new Map<AnimationClipId, { strideMeters: number; duration: number }>();
  for (const id of ALL_CLIP_IDS) {
    const clip = resolved.clips.get(id);
    const base = contractMetadata(id);
    metadata.set(id, {
      ...base,
      ...sidecar.get(id),
      id,
      // The clip's real length always wins over the placeholder.
      duration: clip ? clip.duration : base.duration,
    });
    // A stride only counts as measured if the sidecar gave it for the clip's OWN state.
    const stride = sidecar.get(id)?.strideMeters;
    if (clip && stride !== undefined && !resolved.substituted.has(id)) {
      measured.set(id, { strideMeters: stride, duration: clip.duration });
    }
  }
  const strideModel = strideModelFrom(measured);
  if (!strideModel) {
    devLog('info', 'no measured strides in the clip sidecar: gait cadence uses the procedural placeholder until they are added');
  }

  let hasLodMeshes = false;
  normalized.master.traverse((node) => {
    if (/_LOD[0-2]$/i.test(node.name)) hasLodMeshes = true;
  });

  const master = normalized.master;
  const kit = await loadKitTextures(manifest);
  return {
    status: 'ready',
    reason: null,
    asset: {
      version: manifest.version,
      master,
      clone: () => clone(master),
      resolved,
      metadata,
      skeleton,
      measuredHeight: normalized.height,
      unitScale: normalized.unitScale,
      hasLodMeshes,
      strideModel,
      kit,
    },
  };
}

let cached: Promise<PlayerAssetResult> | null = null;
let current: PlayerAssetStatus = 'idle';

/** Where the model stands right now, for anything that wants to say so. */
export function playerAssetStatus(): PlayerAssetStatus {
  return current;
}

/**
 * Loads the model once per session; every later call gets the same promise. Never
 * rejects: every failure is a status, and the caller keeps the procedural body.
 */
export function loadPlayerAsset(manifest: PlayerAssetManifest = PLAYER_ASSET_MANIFEST): Promise<PlayerAssetResult> {
  if (cached) return cached;
  current = 'loading';
  cached = load(manifest)
    .catch((error: unknown): PlayerAssetResult => ({
      status: 'error',
      asset: null,
      reason: error instanceof Error ? error.message : String(error),
    }))
    .then((result) => {
      current = result.status;
      if (result.status === 'ready' && result.asset) {
        const { resolved } = result.asset;
        const borrowed = [...resolved.substituted].map(([id, from]) => `${id}→${from}`).join(', ');
        devLog(
          'info',
          `model v${result.asset.version} ready: ${result.asset.measuredHeight.toFixed(2)} m, ` +
            `${resolved.clips.size} states animated` +
            (borrowed ? `, borrowed ${borrowed}` : '') +
            (resolved.absent.length ? `; no clip for ${resolved.absent.join(', ')} (drawn procedurally on the skeleton)` : ''),
        );
      } else if (result.status === 'missing' || result.status === 'disabled') {
        devLog('info', `GLB player model not used (${result.reason}); drawing the procedural players.`);
      } else {
        devLog('warn', `GLB player model rejected (${result.reason}); drawing the procedural players.`);
      }
      return result;
    });
  return cached;
}
