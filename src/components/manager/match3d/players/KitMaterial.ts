import {
  Color,
  MeshStandardMaterial,
  Vector2,
  Vector4,
  type IUniform,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { KitPattern } from './KitSystem';
import type { PlayerLook } from './playerAppearance';

/**
 * The kit on the realistic body: a MeshStandardMaterial whose base colour is tinted,
 * region by region, from the player's `PlayerLook` through two mask textures the
 * production model ships with.
 *
 *   T_Body_MaskA   R shirt · G trim (1.0 collar/cuffs, 0.5 sock turnover) · B shorts · A socks
 *   T_Body_MaskB   R skin · G boots (1.0 boot, 0.5 accent) · B long-sleeve zone
 *                  (the forearm: skin, or shirt when the look has long sleeves)
 *                  · A number (1.0) / badge (0.5) area
 *
 * The model's own base colour map stays, authored in neutral greys with folds and
 * shading baked in; the mask picks the colour it is multiplied by. Masks are sampled
 * with nearest filtering so their coded values (0.5 / 1.0) arrive exact.
 *
 * ONE shader program for every player: `customProgramCacheKey` is fixed, so three
 * compiles the kit shader once and every player's material reuses it. What differs per
 * player is only uniform data — a dozen colours and two digits. Materials are made
 * once per player lifetime, never per frame.
 *
 * The shirt number is drawn from a shared 0–9 digit atlas (ten glyphs in a row, white
 * on transparent) inside the number area, whose UV rectangle the manifest gives. No
 * texture is made per player or per number.
 *
 * Nothing here runs without the masks: a model that does not ship them keeps its own
 * materials, and no mask is ever invented.
 */

export interface KitTextures {
  maskA: Texture;
  maskB: Texture;
  /** Ten glyphs 0–9, left to right. Null: the number area is left as the shirt. */
  numberAtlas: Texture | null;
  /** The number area's UV rectangle on the body: [u0, v0, u1, v1]. */
  numberUvRect: readonly [number, number, number, number] | null;
}

const PROGRAM_KEY = 'fc-all-star-kit-v1';
const PATTERN_INDEX: Record<KitPattern, number> = { plain: 0, stripes: 1, hoops: 2 };
/** Stripes/hoops per UV unit. */
const PATTERN_SCALE = 14;

interface KitUniforms {
  [name: string]: IUniform;
  uKitMaskA: IUniform<Texture>;
  uKitMaskB: IUniform<Texture>;
  uKitNumberAtlas: IUniform<Texture | null>;
  uKitHasNumber: IUniform<number>;
  /** Tens and ones digit; tens < 0 for a single-digit number. */
  uKitDigits: IUniform<Vector2>;
  uKitNumberRect: IUniform<Vector4>;
  uKitShirt: IUniform<Color>;
  uKitTrim: IUniform<Color>;
  uKitShorts: IUniform<Color>;
  uKitSocks: IUniform<Color>;
  uKitSockTrim: IUniform<Color>;
  uKitNumber: IUniform<Color>;
  uKitSkin: IUniform<Color>;
  uKitBoots: IUniform<Color>;
  uKitBootAccent: IUniform<Color>;
  uKitLongSleeves: IUniform<number>;
  uKitPattern: IUniform<number>;
  uKitPatternScale: IUniform<number>;
}

const VERTEX_DECLARE = /* glsl */ `
varying vec2 vKitUv;`;

const VERTEX_ASSIGN = /* glsl */ `
vKitUv = uv;`;

const FRAGMENT_DECLARE = /* glsl */ `
varying vec2 vKitUv;
uniform sampler2D uKitMaskA;
uniform sampler2D uKitMaskB;
uniform sampler2D uKitNumberAtlas;
uniform float uKitHasNumber;
uniform vec2 uKitDigits;
uniform vec4 uKitNumberRect;
uniform vec3 uKitShirt;
uniform vec3 uKitTrim;
uniform vec3 uKitShorts;
uniform vec3 uKitSocks;
uniform vec3 uKitSockTrim;
uniform vec3 uKitNumber;
uniform vec3 uKitSkin;
uniform vec3 uKitBoots;
uniform vec3 uKitBootAccent;
uniform float uKitLongSleeves;
uniform float uKitPattern;
uniform float uKitPatternScale;

// 1 where a coded mask value is ~1.0, and where it is ~0.5.
float kitFull(float v) { return step(0.75, v); }
float kitHalf(float v) { return step(0.25, v) * (1.0 - step(0.75, v)); }`;

const FRAGMENT_APPLY = /* glsl */ `
{
  vec4 kitA = texture2D(uKitMaskA, vKitUv);
  vec4 kitB = texture2D(uKitMaskB, vKitUv);

  // Pattern: the shirt's second colour in vertical stripes or horizontal hoops.
  float kitBand = uKitPattern > 1.5 ? step(0.5, fract(vKitUv.y * uKitPatternScale))
                : uKitPattern > 0.5 ? step(0.5, fract(vKitUv.x * uKitPatternScale)) : 0.0;
  vec3 kitShirt = mix(uKitShirt, uKitTrim, kitBand);

  float kitSleeve = kitB.b * uKitLongSleeves;
  float kitSkinW = kitB.r + kitB.b * (1.0 - uKitLongSleeves);
  float kitTrimW = kitFull(kitA.g);
  float kitSockTrimW = kitHalf(kitA.g);
  float kitBootW = kitFull(kitB.g);
  float kitAccentW = kitHalf(kitB.g);

  vec3 kitTint = kitShirt * (kitA.r + kitSleeve) + uKitTrim * kitTrimW + uKitSockTrim * kitSockTrimW
               + uKitShorts * kitA.b + uKitSocks * kitA.a + uKitSkin * kitSkinW
               + uKitBoots * kitBootW + uKitBootAccent * kitAccentW;
  float kitW = kitA.r + kitSleeve + kitTrimW + kitSockTrimW + kitA.b + kitA.a + kitSkinW + kitBootW + kitAccentW;
  kitTint /= max(kitW, 1e-4);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * kitTint, clamp(kitW, 0.0, 1.0));

  // Shirt number: one or two glyphs from the shared digit atlas, inside the number area.
  if (uKitHasNumber > 0.5 && kitFull(kitB.a) > 0.5) {
    vec2 kitLocal = (vKitUv - uKitNumberRect.xy) / max(uKitNumberRect.zw - uKitNumberRect.xy, vec2(1e-5));
    if (all(greaterThanEqual(kitLocal, vec2(0.0))) && all(lessThanEqual(kitLocal, vec2(1.0)))) {
      bool kitTwo = uKitDigits.x >= 0.0;
      float kitX = kitTwo ? kitLocal.x * 2.0 : (kitLocal.x - 0.25) * 2.0;
      float kitDigit = kitTwo ? (kitLocal.x < 0.5 ? uKitDigits.x : uKitDigits.y) : uKitDigits.y;
      float kitCell = fract(kitX);
      float kitInside = step(0.0, kitX) * step(kitX, kitTwo ? 2.0 : 1.0);
      float kitInk = texture2D(uKitNumberAtlas, vec2((kitDigit + kitCell) / 10.0, kitLocal.y)).a * kitInside;
      diffuseColor.rgb = mix(diffuseColor.rgb, uKitNumber, kitInk);
    }
  }
}`;

export class KitMaterial extends MeshStandardMaterial {
  readonly isKitMaterial = true;
  readonly kitUniforms: KitUniforms;

  /**
   * `base` is the model's own body material: its maps (base colour, normal, ORM) and
   * PBR values are kept, and only its colour is tinted.
   */
  constructor(base: Material, textures: KitTextures) {
    super();
    if ((base as MeshStandardMaterial).isMeshStandardMaterial) this.copy(base as MeshStandardMaterial);
    this.name = `Kit:${base.name || 'Body'}`;
    const rect = textures.numberUvRect ?? [0, 0, 0, 0];
    this.kitUniforms = {
      uKitMaskA: { value: textures.maskA },
      uKitMaskB: { value: textures.maskB },
      uKitNumberAtlas: { value: textures.numberAtlas },
      uKitHasNumber: { value: 0 },
      uKitDigits: { value: new Vector2(-1, 0) },
      uKitNumberRect: { value: new Vector4(rect[0], rect[1], rect[2], rect[3]) },
      uKitShirt: { value: new Color() },
      uKitTrim: { value: new Color() },
      uKitShorts: { value: new Color() },
      uKitSocks: { value: new Color() },
      uKitSockTrim: { value: new Color() },
      uKitNumber: { value: new Color() },
      uKitSkin: { value: new Color() },
      uKitBoots: { value: new Color() },
      uKitBootAccent: { value: new Color() },
      uKitLongSleeves: { value: 0 },
      uKitPattern: { value: 0 },
      uKitPatternScale: { value: PATTERN_SCALE },
    };
    this.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, this.kitUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${VERTEX_DECLARE}`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>${VERTEX_ASSIGN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>${FRAGMENT_DECLARE}`)
        .replace('#include <map_fragment>', `#include <map_fragment>${FRAGMENT_APPLY}`);
    };
  }

  /** Every kit material shares one program; only the uniforms differ. */
  override customProgramCacheKey(): string {
    return PROGRAM_KEY;
  }

  /** Writes a look into the uniforms. Called once per player, not per frame. */
  setLook(look: PlayerLook): void {
    const u = this.kitUniforms;
    const kit = look.kit;
    u.uKitShirt.value.set(kit.shirt);
    u.uKitTrim.value.set(kit.trim);
    u.uKitShorts.value.set(kit.shorts);
    u.uKitSocks.value.set(kit.socks);
    u.uKitSockTrim.value.set(kit.sockTrim);
    u.uKitNumber.value.set(kit.number);
    u.uKitSkin.value.set(look.skin);
    u.uKitBoots.value.set(look.boots);
    u.uKitBootAccent.value.set(look.bootAccent);
    u.uKitLongSleeves.value = look.longSleeves ? 1 : 0;
    u.uKitPattern.value = PATTERN_INDEX[kit.pattern ?? 'plain'];
    const number = Math.max(0, Math.min(99, Math.round(look.shirtNumber)));
    u.uKitDigits.value.set(number >= 10 ? Math.floor(number / 10) : -1, number % 10);
    u.uKitHasNumber.value = u.uKitNumberAtlas.value && u.uKitNumberRect.value.z > u.uKitNumberRect.value.x ? 1 : 0;
  }
}

/**
 * The look's materials for one loaded model, shared across its players: the kit
 * textures (loaded once, with the model), and one tinted copy of the hair and glove
 * materials per colour — a handful, however many players wear them. Each player's own
 * kit material is made here too, and released with the player.
 */
export class LookMaterials {
  private readonly tinted = new Map<string, Material>();

  constructor(readonly kit: KitTextures | null) {}

  /** The player's body material, or null when the model ships no masks (keep its own). */
  body(base: Material, look: PlayerLook): KitMaterial | null {
    if (!this.kit) return null;
    const material = new KitMaterial(base, this.kit);
    material.setLook(look);
    return material;
  }

  /** `base` recoloured to `color`, shared by every player wearing that colour. */
  tint(base: Material, color: string): Material {
    const key = `${base.uuid}:${color}`;
    let found = this.tinted.get(key);
    if (!found) {
      found = base.clone();
      const colored = found as Material & { color?: Color };
      if (colored.color) colored.color.set(color);
      this.tinted.set(key, found);
    }
    return found;
  }

  dispose(): void {
    for (const material of this.tinted.values()) material.dispose();
    this.tinted.clear();
  }
}
