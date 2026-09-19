/**
 * ระบบผู้รักษาประตู
 *
 * ย้ายตรรกะการยืนตำแหน่งของ GK ออกมาจาก formationSystem มาไว้ที่เดียวกับการเซฟ
 * เพราะสองเรื่องนี้เป็นเรื่องเดียวกัน: ยืนตรงไหนคือครึ่งหนึ่งของการเซฟได้หรือไม่ได้
 *
 *   บอลอยู่ไกล  → ยืนตามมุมของบอล ห่างเส้นประตูตามระยะอันตราย
 *   มีลูกยิงมา  → เลื่อนไปที่จุดตัดของวิถีบอลกับเส้นประตู
 *   บอลถึงตัว   → ทอยเซฟหนึ่งครั้ง ผลขึ้นกับฝีมือจริง ความเร็วบอล และระยะที่ต้องเอื้อม
 */
import {
  PITCH,
  attackDirection,
  clampToPitch,
  goalPosts,
  ownGoalLine,
} from '@/match-engine/pitch';
import type { PlayerAgent } from '@/match-engine/playerAgent';
import { normalise } from '@/match-engine/ratings';
import type { MatchSide, Vec2 } from '@/match-engine/types';

/** ระยะเอื้อมของผู้รักษาประตู (เมตร) — ไกลกว่านี้ไม่ต้องทอยเซฟ */
export const SAVE_REACH = 3.2;

/** โอกาสเซฟสูงสุดและต่ำสุด — ไม่มีทางเซฟได้ทุกลูก และไม่มีทางพลาดทุกลูก */
const SAVE_CHANCE = { min: 0.08, max: 0.88 } as const;

/**
 * ตำแหน่งที่ผู้รักษาประตูควรยืนเมื่อยังไม่มีลูกยิง
 *
 * อยู่ในเขตของตัวเองเสมอ ออกมาไกลสุดราวจุดโทษเมื่อบอลเข้ามาใกล้
 * และเลื่อนซ้าย-ขวาตามบอลแบบหน่วง ๆ เพื่อยืนบังมุมยิง
 */
export const keeperTarget = (side: MatchSide, ball: Vec2): Vec2 => {
  const line = ownGoalLine(side);
  const direction = attackDirection(side);

  // บอลยิ่งเข้ามาใกล้ประตูเรา ผู้รักษาประตูยิ่งยืนติดเส้น
  const threat = Math.abs(ball.x - line) / PITCH.length;
  const advance = 2 + Math.min(threat, 0.55) * 12;

  // เลื่อนตามบอลด้านกว้าง แต่ไม่เกินขอบเสาบวกอีกนิดหน่อย
  const half = PITCH.goalWidth / 2 + 2.5;
  const offset = (ball.y - PITCH.width / 2) * 0.35;

  return clampToPitch({
    x: line + direction * advance,
    y: PITCH.width / 2 + Math.max(-half, Math.min(half, offset)),
  });
};

/**
 * ตำแหน่งที่ควรไปยืนเมื่อมีลูกยิงมาแล้ว
 *
 * ประมาณจุดที่วิถีบอลจะตัดเส้นประตู แล้วขยับไปตรงนั้น
 * บีบให้อยู่ในปากประตูบวกอีกเล็กน้อย — ผู้รักษาประตูไม่วิ่งออกไปนอกกรอบตามลูกยิง
 */
export const shotCoverTarget = (side: MatchSide, ball: Vec2, ballVelocity: Vec2): Vec2 => {
  const line = ownGoalLine(side);
  const { left, right } = goalPosts();

  // เวลาที่บอลจะใช้ไปถึงเส้นประตู (ถ้าบอลไม่ได้วิ่งเข้าหาเราก็ยืนตำแหน่งปกติ)
  const closing = (line - ball.x) / (ballVelocity.x || 0.0001);
  if (closing <= 0 || closing > 4) return keeperTarget(side, ball);

  const crossingY = ball.y + ballVelocity.y * closing;
  const margin = 1.5;

  return clampToPitch({
    x: line + attackDirection(side) * 1.4,
    y: Math.min(Math.max(crossingY, left - margin), right + margin),
  });
};

/**
 * โอกาสเซฟลูกนี้ (0–1)
 *
 * ขึ้นกับ: ฝีมือจริงของ GK · ต้องเอื้อมไกลแค่ไหน · บอลแรงแค่ไหน
 * บีบไว้ระหว่าง 8% ถึง 88% เสมอ — ลูกจ่อ ๆ ก็ยังมีลุ้น และลูกง่าย ๆ ก็ยังหลุดได้
 */
export const saveChance = (keeper: PlayerAgent, ball: Vec2, ballSpeed: number): number => {
  const reach = keeper.distanceTo(ball);
  if (reach > SAVE_REACH) return 0;

  const skill = normalise(keeper.goalkeeping);
  // ยิ่งบอลอยู่ใกล้ตัวยิ่งเซฟง่าย
  const proximity = 1 - reach / SAVE_REACH;
  // ลูกแรงเซฟยากกว่า (19–36 m/s คือช่วงความเร็วลูกยิงในเกมนี้)
  const power = Math.min(Math.max((ballSpeed - 19) / 17, 0), 1);

  const raw = 0.25 + skill * 0.45 + proximity * 0.3 - power * 0.3;
  return Math.min(Math.max(raw, SAVE_CHANCE.min), SAVE_CHANCE.max);
};
