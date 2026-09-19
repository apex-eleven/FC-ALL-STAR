/**
 * ขนาดสนามและการแปลงพิกัด
 *
 * ที่เดียวในระบบที่รู้ว่า FormationSlot (x/y 0–100, y = ความยาวสนาม)
 * แปลงเป็นพิกัดโลกของเอนจิน (เมตร, x = ความยาวสนาม) อย่างไร
 * ถ้าวันหลังเปลี่ยนระบบพิกัดของแผน แก้ที่ไฟล์นี้ไฟล์เดียว
 */
import type { AgentRole, MatchSide, Vec2 } from '@/match-engine/types';
import type { Position } from '@/match-engine/playerTypes';
import { POSITION_GROUP } from '@/match-engine/playerTypes';

/** ขนาดสนามมาตรฐาน FIFA (เมตร) */
export const PITCH = {
  length: 105,
  width: 68,
  /** กรอบเขตโทษ: ลึก 16.5 ม. กว้าง 40.32 ม. */
  penaltyDepth: 16.5,
  penaltyWidth: 40.32,
  /** กรอบ 6 หลา: ลึก 5.5 ม. กว้าง 18.32 ม. */
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  goalWidth: 7.32,
  centreCircleRadius: 9.15,
  penaltySpot: 11,
  cornerRadius: 1,
} as const;

/** ความลึกของกรอบประตู (เมตร) — บอลที่เข้าไปในช่วงนี้ถือว่าเป็นประตูแล้ว */
export const GOAL_DEPTH = 1.8;

/** จุดกึ่งกลางสนาม */
export const centreSpot = (): Vec2 => ({ x: PITCH.length / 2, y: PITCH.width / 2 });

/** ทิศที่ทีมนี้บุก: home ไป +x, away ไป −x */
export const attackDirection = (side: MatchSide): 1 | -1 => (side === 'home' ? 1 : -1);

/** พิกัด x ของเส้นประตูฝั่งตัวเอง */
export const ownGoalLine = (side: MatchSide): number => (side === 'home' ? 0 : PITCH.length);

/** พิกัด x ของเส้นประตูฝั่งตรงข้าม */
export const targetGoalLine = (side: MatchSide): number => (side === 'home' ? PITCH.length : 0);

/** จำพวกของนักเตะที่เอนจินใช้ (แปลงจากตำแหน่งของช่องในแผน) */
export const roleOf = (position: Position): AgentRole => POSITION_GROUP[position];

/**
 * แปลงพิกัดช่องในแผน → พิกัดโลกของเอนจิน
 *
 * ระบบเดิม: x = 0–100 จากซ้ายสนาม, y = 0–100 จากเส้นประตูฝั่งตัวเอง
 * ฝั่ง away ต้องกลับด้านทั้งสองแกน ไม่งั้นแบ็กซ้ายของเขาจะไปโผล่ฝั่งขวา
 */
export const formationToWorld = (
  formationX: number,
  formationY: number,
  side: MatchSide,
): Vec2 => {
  const depth = (formationY / 100) * PITCH.length;
  const across = (formationX / 100) * PITCH.width;

  return side === 'home'
    ? { x: depth, y: across }
    : { x: PITCH.length - depth, y: PITCH.width - across };
};

/** บีบพิกัดให้อยู่ในสนาม (เผื่อขอบไว้เล็กน้อยไม่ให้ตัวละครทับเส้น) */
export const clampToPitch = (point: Vec2, margin = 0.8): Vec2 => ({
  x: Math.min(Math.max(point.x, margin), PITCH.length - margin),
  y: Math.min(Math.max(point.y, margin), PITCH.width - margin),
});

/* ── เรขาคณิตของประตู ─────────────────────────────────── */

/** จุดกึ่งกลางปากประตูที่ทีมนี้ต้องยิงเข้า */
export const targetGoalCentre = (side: MatchSide): Vec2 => ({
  x: targetGoalLine(side),
  y: PITCH.width / 2,
});

/** จุดกึ่งกลางปากประตูที่ทีมนี้ต้องป้องกัน */
export const ownGoalCentre = (side: MatchSide): Vec2 => ({
  x: ownGoalLine(side),
  y: PITCH.width / 2,
});

/** เสาประตูสองข้าง (ค่า y) — ใช้ทั้งตอนเล็งยิงและตอนตรวจว่าเข้าประตูไหม */
export const goalPosts = (): { left: number; right: number } => ({
  left: PITCH.width / 2 - PITCH.goalWidth / 2,
  right: PITCH.width / 2 + PITCH.goalWidth / 2,
});

/** ค่า y นี้อยู่ในปากประตูหรือไม่ */
export const isInsideGoalMouth = (y: number): boolean => {
  const { left, right } = goalPosts();
  return y >= left && y <= right;
};

/**
 * บอลข้ามเส้นประตูเข้าไปในปากประตูแล้วหรือยัง
 * คืนฝั่งของประตูที่ถูกยิงเข้า (คือฝั่งที่ "เสียประตู") หรือ null ถ้ายังไม่เข้า
 */
export const goalCrossed = (ball: Vec2): MatchSide | null => {
  if (!isInsideGoalMouth(ball.y)) return null;
  if (ball.x <= 0) return 'home';
  if (ball.x >= PITCH.length) return 'away';
  return null;
};

/** ระยะห่างระหว่างสองจุด */
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** ระยะห่างยกกำลังสอง — ใช้ตอนแค่ต้องเทียบว่าใครใกล้กว่า (ไม่ต้องถอดราก) */
export const distanceSq = (a: Vec2, b: Vec2): number =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
