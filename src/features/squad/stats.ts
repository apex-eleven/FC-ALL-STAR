import { ratingWithPlus } from '@/features/rankup/plus';
import { groupOf } from './rating';

/**
 * Detailed card stats for the swap screen.
 *
 * The catalogue stores only name, OVR, position, tier, nation and club, so these are
 * DERIVED, not real player data: a position profile scaled by the upgraded OVR, with
 * a small fixed variation per card so two players at the same rating do not look
 * identical. The variation is seeded from the catalogue id, so a card always shows
 * the same numbers — and an upgrade moves every stat together with its OVR.
 */

export type FaceStat = 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical' | 'pace';

/** Radar order, clockwise from the top vertex — the order the reference draws them. */
export const FACE_STATS: readonly { key: FaceStat; label: string }[] = [
  { key: 'shooting', label: 'การยิง' },
  { key: 'passing', label: 'การส่งบอล' },
  { key: 'dribbling', label: 'การเลี้ยงบอล' },
  { key: 'defending', label: 'การตั้งรับ' },
  { key: 'physical', label: 'สภาพร่างกาย' },
  { key: 'pace', label: 'ฝีเท้า' },
];

export type WorkRate = 'ต่ำ' | 'กลาง' | 'สูง';

export interface CardStats {
  face: Record<FaceStat, number>;
  /** Foot strength 1..5 each; the preferred foot is always 5. */
  leftFoot: number;
  rightFoot: number;
  /** 1..5 stars. */
  stamina: number;
  skillMoves: number;
  heightCm: number;
  weightKg: number;
  attackWorkRate: WorkRate;
  defenseWorkRate: WorkRate;
  skillTrait: string;
  acceleration: number;
  sprintSpeed: number;
}

type Profile = Record<FaceStat, number>;

// Multipliers on OVR. Taken from the reference card (OVR 124 CB: shooting 131,
// passing 195, dribbling 175, defending 216, physical 203, pace 182) and shifted per
// line so each position leads with what it is for.
const PROFILES: Record<string, Profile> = {
  GK: { shooting: 0.9, passing: 1.3, dribbling: 1.1, defending: 1.72, physical: 1.6, pace: 1.2 },
  CB: { shooting: 1.06, passing: 1.57, dribbling: 1.41, defending: 1.74, physical: 1.64, pace: 1.47 },
  FB: { shooting: 1.15, passing: 1.55, dribbling: 1.5, defending: 1.66, physical: 1.5, pace: 1.65 },
  CDM: { shooting: 1.3, passing: 1.62, dribbling: 1.5, defending: 1.66, physical: 1.62, pace: 1.45 },
  CM: { shooting: 1.45, passing: 1.7, dribbling: 1.6, defending: 1.5, physical: 1.52, pace: 1.5 },
  CAM: { shooting: 1.6, passing: 1.72, dribbling: 1.7, defending: 1.2, physical: 1.4, pace: 1.55 },
  WIDE: { shooting: 1.55, passing: 1.6, dribbling: 1.72, defending: 1.1, physical: 1.35, pace: 1.72 },
  ST: { shooting: 1.74, passing: 1.5, dribbling: 1.62, defending: 1.05, physical: 1.55, pace: 1.68 },
};

function profileKey(position: string): string {
  const upper = position.toUpperCase();
  if (upper === 'GK' || upper === 'CB' || upper === 'CDM' || upper === 'CM' || upper === 'CAM') {
    return upper;
  }
  if (['LB', 'RB', 'LWB', 'RWB'].includes(upper)) return 'FB';
  if (['LM', 'RM', 'LW', 'RW'].includes(upper)) return 'WIDE';
  if (upper === 'ST' || upper === 'CF') return 'ST';
  return groupOf(upper) === 'DEF' ? 'CB' : groupOf(upper) === 'ATT' ? 'ST' : 'CM';
}

/** FNV-1a, so the same seed gives the same numbers in every browser. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Whole number in [min, max], fixed for this seed and salt. */
function pick(seed: string, salt: string, min: number, max: number): number {
  return min + (hash(`${seed}:${salt}`) % (max - min + 1));
}

const SKILL_TRAITS = [
  'ฮาร์ดสต็อป',
  'สเต็ปโอเวอร์',
  'ครอสสลับเท้า',
  'เฟนต์ส้นเท้า',
  'ลากบอลหลบ',
  'ม้วนตัวหลบ',
  'แตะบอลข้ามหัว',
  'เปลี่ยนทิศเร็ว',
];

const WORK_RATES: readonly WorkRate[] = ['ต่ำ', 'กลาง', 'สูง'];

export interface StatSource {
  /** Catalogue id — the seed. Falls back to the name for cards with none. */
  playerId?: string;
  id?: string;
  name: string;
  rating: number;
  plus?: number;
  position: string;
}

export function cardStats(card: StatSource): CardStats {
  const seed = card.playerId ?? card.id ?? card.name;
  const ovr = ratingWithPlus(card);
  const key = profileKey(card.position);
  const profile = PROFILES[key] ?? PROFILES.CM!;

  const face = {} as Record<FaceStat, number>;
  for (const { key: stat } of FACE_STATS) {
    face[stat] = Math.max(1, Math.round(ovr * profile[stat]) + pick(seed, stat, -6, 6));
  }

  const leftFooted = pick(seed, 'foot', 0, 3) === 0;
  const weak = pick(seed, 'weak', 2, 5);

  const group = groupOf(card.position);
  const [heightMin, heightMax] =
    key === 'GK' ? [185, 198] : key === 'CB' ? [182, 196] : key === 'ST' ? [175, 192] : [168, 188];
  const heightCm = pick(seed, 'height', heightMin, heightMax);

  // Attackers lean high going forward and low tracking back; defenders the reverse.
  const attackBase = group === 'ATT' ? 2 : group === 'MID' ? 1 : 0;
  const defenseBase = group === 'DEF' || group === 'GK' ? 2 : group === 'MID' ? 1 : 0;
  const shift = (salt: string, base: number) =>
    WORK_RATES[Math.max(0, Math.min(2, base + pick(seed, salt, 0, 1)))]!;

  return {
    face,
    leftFoot: leftFooted ? 5 : weak,
    rightFoot: leftFooted ? weak : 5,
    stamina: pick(seed, 'stamina', 3, 5),
    skillMoves: key === 'GK' || key === 'CB' ? pick(seed, 'skill', 1, 3) : pick(seed, 'skill', 2, 5),
    heightCm,
    weightKg: heightCm - 105 + pick(seed, 'weight', -6, 6),
    attackWorkRate: shift('att-wr', attackBase),
    defenseWorkRate: shift('def-wr', defenseBase),
    skillTrait: SKILL_TRAITS[pick(seed, 'trait', 0, SKILL_TRAITS.length - 1)]!,
    acceleration: Math.max(1, face.pace + pick(seed, 'accel', -4, 4)),
    sprintSpeed: Math.max(1, face.pace + pick(seed, 'sprint', -4, 4)),
  };
}

/** "1.91 ม. / 6'3"" */
export function formatHeight(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${(cm / 100).toFixed(2)} ม. / ${Math.floor(inches / 12)}'${inches % 12}"`;
}

/** "86 กก. / 190 ปอนด์" */
export function formatWeight(kg: number): string {
  return `${kg} กก. / ${Math.round(kg * 2.2046)} ปอนด์`;
}
