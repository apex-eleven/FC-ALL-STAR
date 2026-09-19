/**
 * ระบบการยิงประตู
 *
 * แยกไฟล์เหมือน passing.ts — เป็นการตัดสินใจล้วน ๆ ไม่เก็บ state ของตัวเอง
 * รับสถานการณ์เข้ามา คืนคำตอบออกไป MatchEngine เป็นคนลงมือ
 *
 *   มีบอลอยู่กับเท้า → ประเมินโอกาส → เลือกมุมประตู → คำนวณความเร็วและความแม่น → ยิง
 *
 * ทุกค่าที่เกี่ยวกับฝีเท้ามาจากค่าพลังจริงของการ์ด (ผ่าน ratings.ts) ไม่มีค่าที่แต่งขึ้น
 */
import { PITCH, goalPosts, targetGoalCentre } from '@/match-engine/pitch';
import type { PlayerAgent } from '@/match-engine/playerAgent';
import { normalise } from '@/match-engine/ratings';
import type { Vec2 } from '@/match-engine/types';
import type { Position } from '@/match-engine/playerTypes';

/** ไกลกว่านี้ไม่ยิง (เมตร) */
export const MAX_SHOT_DISTANCE = 32;

/** ระยะที่ถือว่าเป็นโอกาสทองจริง ๆ (เมตร) */
const PRIME_DISTANCE = 12;

/** คู่แข่งใกล้กว่านี้ถือว่ากำลังโดนกดดัน (เมตร) */
const PRESSURE_RADIUS = 3.5;

/**
 * ความอยากยิงตามตำแหน่งในแผน
 *
 * นี่คือส่วนที่ทำให้ตำแหน่งมีความหมายจริง ๆ ในเกม: กองหน้ายิงบ่อย เซ็นเตอร์แบ็กแทบไม่ยิงเลย
 * ต่อให้กองหลังคนนั้นจะมีค่า shooting สูงก็ตาม เพราะเขาไม่ได้ขึ้นไปอยู่ตรงนั้นตั้งแต่แรก
 */
export const SHOT_TENDENCY: Record<Position, number> = {
  ST: 1,
  LW: 0.78,
  RW: 0.78,
  CAM: 0.72,
  CM: 0.38,
  LM: 0.5,
  RM: 0.5,
  CDM: 0.22,
  CB: 0.06,
  LB: 0.08,
  RB: 0.08,
  GK: 0,
};

/** คะแนนขั้นต่ำที่ยอมยิง */
/**
 * คะแนนขั้นต่ำที่ยอมยิง
 *
 * ลดจาก 0.42 เพราะทั้งเกมได้แค่ 2–3 ครั้งต่อนัด ซึ่งต่ำกว่าฟุตบอลจริงมาก
 * ลดคู่กับการเพิ่ม cooldown รายคน (ดู MatchEngine) กันไม่ให้กลายเป็นยิงรัวแทน
 */
export const MIN_SHOT_SCORE = 0.32;

export interface ShotChance {
  /** คะแนนโอกาส 0–1 */
  score: number;
  /** ระยะถึงกึ่งกลางประตู */
  distance: number;
  /** มุมที่เห็นปากประตู (เรเดียน) ยิ่งกว้างยิ่งยิงง่าย */
  openAngle: number;
  /** ระยะถึงคู่แข่งที่ใกล้ที่สุด */
  pressure: number;
}

/** มุมที่มองเห็นปากประตูจากจุดที่ยืนอยู่ — แคบมากแปลว่ายิงจากมุมแทบไม่มีทางเข้า */
const openAngleTo = (from: Vec2, goalLineX: number): number => {
  const { left, right } = goalPosts();
  const toLeft = Math.atan2(left - from.y, goalLineX - from.x);
  const toRight = Math.atan2(right - from.y, goalLineX - from.x);
  return Math.abs(toRight - toLeft);
};

/**
 * ประเมินว่าจังหวะนี้ควรยิงไหม
 *
 *   score = ระยะ + มุม + ฝีเท้า + ความอยากยิงตามตำแหน่ง − แรงกดดัน
 */
export const evaluateShot = (
  shooter: PlayerAgent,
  opponents: PlayerAgent[],
): ShotChance => {
  const goal = targetGoalCentre(shooter.side);
  const distance = Math.hypot(goal.x - shooter.position2d.x, goal.y - shooter.position2d.y);
  const openAngle = openAngleTo(shooter.position2d, goal.x);

  let pressure = Infinity;
  for (const opponent of opponents) {
    pressure = Math.min(pressure, shooter.distanceTo(opponent.position2d));
  }

  if (distance > MAX_SHOT_DISTANCE) {
    return { score: 0, distance, openAngle, pressure };
  }

  // ใกล้ประตูได้เต็ม ไกลออกไปลดลงเรื่อย ๆ
  const distanceScore =
    distance <= PRIME_DISTANCE
      ? 1
      : 1 - (distance - PRIME_DISTANCE) / (MAX_SHOT_DISTANCE - PRIME_DISTANCE);

  /*
   * ตัวหารของมุมคือมุมที่มองเห็นปากประตูจากจุดโทษ (ราว 0.6 เรเดียน)
   * ตอนแรกผมใช้ 1.2 ซึ่งเป็นมุมที่ต้องยืนห่างประตูราว 5 เมตรถึงจะได้
   * ผลคือลูกยิงจากขอบกรอบได้คะแนนมุมแค่ 0.36 และไม่มีใครยิงเลยทั้งเกม
   */
  const angleScore = Math.min(openAngle / 0.6, 1);

  const skill = normalise(shooter.shooting);
  const tendency = SHOT_TENDENCY[shooter.position];
  // โดนประกบทำให้โอกาสแย่ลง แต่ไม่ถึงกับห้ามยิง — กองหน้าในเกมนี้แทบไม่เคยยืนว่างเลย
  const pressurePenalty =
    pressure < PRESSURE_RADIUS ? (1 - pressure / PRESSURE_RADIUS) * 0.22 : 0;

  const score = Math.max(
    0,
    (distanceScore * 0.4 + angleScore * 0.3 + skill * 0.3) * tendency - pressurePenalty,
  );

  return { score, distance, openAngle, pressure };
};

export interface ShotPlan {
  /** จุดที่เล็ง (พิกัดโลก) — อาจอยู่นอกกรอบประตูถ้ายิงพลาด */
  aim: Vec2;
  /** ความเร็วบอล (เมตร/วินาที) */
  speed: number;
  /** ตอนเล็งอยู่ในกรอบไหม (ก่อนบวกความคลาดเคลื่อน) */
  onTarget: boolean;
}

/**
 * เลือกมุมประตูที่จะยิง แล้วคำนวณลูกยิงจริง
 *
 * เล็งหนีผู้รักษาประตูเสมอ ไม่ได้สุ่มมั่ว: ถ้า GK ยืนเยื้องซ้าย ก็เล็งเสาขวา
 * แล้วบวกความคลาดเคลื่อนตามฝีเท้า ระยะ และแรงกดดัน — ยิงพลาดออกนอกกรอบได้จริง
 *
 * @param roll ค่าสุ่ม 0–1 จากตัวสุ่มที่มี seed ของเอนจิน (ส่งเข้ามาเพื่อให้ผลซ้ำได้)
 */
export const calculateShot = (
  shooter: PlayerAgent,
  keeper: PlayerAgent | null,
  chance: ShotChance,
  roll: number,
): ShotPlan => {
  const goal = targetGoalCentre(shooter.side);
  const { left, right } = goalPosts();
  const inset = 0.6; // เล็งห่างเสาเข้ามาเล็กน้อย ไม่ให้เฉียดเสาทุกลูก

  // เล็งไปฝั่งที่ผู้รักษาประตูอยู่ไกลกว่า
  const keeperY = keeper?.position2d.y ?? PITCH.width / 2;
  const towardLeft = Math.abs(keeperY - left) > Math.abs(keeperY - right);
  const aimY = towardLeft ? left + inset : right - inset;

  const skill = normalise(shooter.shooting);

  /*
   * ความคลาดเคลื่อน: ยิงไกล ฝีเท้าต่ำ หรือโดนไล่ประชิด = พลาดมากขึ้น
   * ค่าสุ่มกระจายรอบศูนย์ (roll − 0.5) จึงพลาดได้ทั้งสองข้าง
   */
  const spread =
    (1 - skill) * 2.6 +
    (chance.distance / MAX_SHOT_DISTANCE) * 2.2 +
    (chance.pressure < PRESSURE_RADIUS ? 1.4 : 0);
  const error = (roll - 0.5) * 2 * spread;

  const finalY = aimY + error;

  const speed = Math.min(Math.max(19 + skill * 13 + chance.distance * 0.16, 19), 36);

  return {
    aim: { x: goal.x, y: finalY },
    speed,
    onTarget: finalY >= left && finalY <= right,
  };
};
