/**
 * Formation System — ตำแหน่งที่นักเตะ "ควรอยู่" ณ วินาทีนั้น
 *
 * แนวคิดหลัก: ทีมเคลื่อนที่เป็นก้อนเดียว ไม่ใช่ต่างคนต่างวิ่ง
 * ตำแหน่งบ้าน (home position) มาจากแผนจริงของทีม แล้วเลื่อนทั้งบล็อกตามบอล
 *   • แกนยาว  — บอลอยู่สูง ทั้งทีมดันขึ้น, บอลอยู่ต่ำ ทั้งทีมถอยลง
 *   • แกนกว้าง — บอลอยู่ริมซ้าย ทั้งทีมเลื่อนไปซ้ายเพื่อบีบพื้นที่
 * แต่ละจำพวกขยับไม่เท่ากัน กองกลางขยับเยอะสุด กองหลังขยับน้อยกว่าเพื่อรักษาแนวรับ
 *
 * ผลลัพธ์คือรูปทีมยังเป็น 4-3-3 หรือ 4-4-2 อยู่ตลอด ไม่ใช่จุด 11 จุดวิ่งมั่ว
 * และเมื่อสถานการณ์เปลี่ยน (บอลย้ายฝั่ง) ทั้งบล็อกจะไหลตามไปเอง
 */
import { keeperTarget } from '@/match-engine/goalkeeper';
import { attackDirection, clampToPitch, PITCH } from '@/match-engine/pitch';
import { NEUTRAL_MODIFIERS, type TacticalModifiers } from '@/match-engine/tactics';
import type { AgentRole, MatchSide, Vec2 } from '@/match-engine/types';
import type { Position } from '@/match-engine/playerTypes';

/** ระยะสูงสุด (เมตร) ที่บล็อกทั้งทีมเลื่อนขึ้น/ลงได้จากตำแหน่งบ้าน */
const MAX_BLOCK_SHIFT = 15;

/** แต่ละจำพวกเลื่อนตามบอลมากแค่ไหน (1 = เต็มระยะข้างบน) */
const PUSH_FACTOR: Record<AgentRole, number> = {
  gk: 0.16,
  defence: 0.82,
  midfield: 1,
  attack: 0.72,
};

/** แต่ละจำพวกเลื่อนตามบอลด้านกว้างมากแค่ไหน (สัดส่วนของระยะที่บอลเบี่ยงจากกลางสนาม) */
const SLIDE_FACTOR: Record<AgentRole, number> = {
  gk: 0.16,
  defence: 0.44,
  midfield: 0.36,
  attack: 0.24,
};

/**
 * ระยะที่ยอมให้เติมเกินตำแหน่งบ้านตอนทีมได้ครองบอล (เมตร)
 * กองหลังได้น้อยมาก — กติกาข้อ "กองหลังไม่วิ่งขึ้นสนามแบบไร้เหตุผล" อยู่ตรงนี้
 */
const ATTACK_BONUS: Record<AgentRole, number> = {
  gk: 0,
  defence: 2.5,
  midfield: 6,
  attack: 9,
};

/** ระยะที่ถอยต่ำกว่าตำแหน่งบ้านได้ตอนเสียการครองบอล (เมตร) */
const DEFEND_DROP: Record<AgentRole, number> = {
  gk: 0,
  defence: 5,
  midfield: 7,
  attack: 6,
};

/** ข้อมูลเท่าที่ระบบตำแหน่งต้องใช้ (ไม่ผูกกับคลาส PlayerAgent เพื่อให้เทสต์ง่าย) */
export interface ShapeContext {
  side: MatchSide;
  role: AgentRole;
  /** ตำแหน่งบ้านตามแผน (พิกัดโลก) */
  home: Vec2;
  ball: Vec2;
  /** true = ทีมนี้เป็นฝ่ายที่ใกล้บอลกว่า ถือว่าเป็นฝ่ายรุกในจังหวะนี้ */
  hasInitiative: boolean;
  /** ค่าสุ่มคงที่ประจำตัว 0–1 ใช้ให้แต่ละคนหาพื้นที่ว่างไม่พร้อมกันเป๊ะ */
  jitter: number;
  /** เวลาในแมตช์ (วินาที) ใช้ทำให้การหาพื้นที่ว่างขยับช้า ๆ ไม่แข็งทื่อ */
  elapsed: number;
  /** ตัวคูณจากแทคติกของทีมนี้ — ไม่ส่งมาก็ใช้ค่ากลาง (พฤติกรรมเดิมของ PHASE 1–3) */
  modifiers?: TacticalModifiers;
}

/**
 * ตำแหน่งเป้าหมายของนักเตะในสนามหนึ่งคน
 *
 * = ตำแหน่งบ้าน + การเลื่อนบล็อกตามบอล + โบนัส/โทษตามว่าทีมกำลังรุกหรือรับ
 * ทุกอย่างถูกบีบให้อยู่ในสนามเสมอ
 */
export const shapeTarget = (context: ShapeContext): Vec2 => {
  // ตำแหน่งของผู้รักษาประตูเป็นเรื่องของ goalkeeper.ts ที่เดียว (อยู่คู่กับตรรกะการเซฟ)
  if (context.role === 'gk') return keeperTarget(context.side, context.ball);

  const { side, role, home, ball, hasInitiative, jitter, elapsed } = context;
  const direction = attackDirection(side);

  /**
   * ความคืบหน้าของบอลในมุมมองของทีมนี้: 0 = อยู่หน้าประตูเรา, 1 = อยู่หน้าประตูเขา
   * แปลงเป็น −1..+1 เพื่อใช้เลื่อนบล็อกขึ้นหรือลง
   */
  const progress = side === 'home' ? ball.x / PITCH.length : 1 - ball.x / PITCH.length;
  const push = (progress - 0.5) * 2;

  let along = push * PUSH_FACTOR[role] * MAX_BLOCK_SHIFT;

  /*
   * ได้ครองบอล = เติมขึ้นได้อีกนิด · เสียบอล = ถอยลงมาตั้งรับ
   *
   * ทั้งสองอย่างถูกถ่วงด้วยตำแหน่งบอลเสมอ: บอลอยู่หน้าประตูเราแล้วยังดันขึ้นไปทั้งแผง
   * เพราะบังเอิญเป็นฝ่ายใกล้บอลกว่า คือพฤติกรรมที่ผิดจนดูออกด้วยตา
   * ตำแหน่งบอลจึงเป็นตัวหลัก การครองบอลเป็นแค่ตัวปรับ
   */
  const modifiers = context.modifiers ?? NEUTRAL_MODIFIERS;

  along += hasInitiative
    ? ATTACK_BONUS[role] * progress * modifiers.attackBias
    : -DEFEND_DROP[role] * (1 - progress);

  /*
   * แนวรับสูง/ต่ำ และ mentality เลื่อนทั้งบล็อกไปข้างหน้าหรือถอยหลังเป็นเมตร
   * ผู้รักษาประตูไม่นับ (ออกจากเขตไม่ได้อยู่แล้ว) และกองหน้าขยับตามน้อยกว่าคนอื่น
   * เพราะเขายืนสูงอยู่แล้ว ไม่งั้นจะถูกดันไปติดเส้นหลัง
   */
  along += modifiers.lineOffset * (role === 'attack' ? 0.5 : 1);

  // เลื่อนด้านกว้างตามบอลเพื่อบีบพื้นที่ฝั่งที่บอลอยู่
  const slide = (ball.y - PITCH.width / 2) * SLIDE_FACTOR[role];

  /**
   * หาพื้นที่ว่าง: กองหน้าและกองกลางแกว่งเบา ๆ รอบตำแหน่งของตัวเอง
   * ใช้คลื่นไซน์ที่ต่างเฟสกันตาม jitter — ดูมีชีวิตโดยไม่ต้องมีระบบ off-the-ball เต็มรูปแบบ
   * (PHASE 2 จะแทนที่ด้วยการหาช่องว่างจริงตามตำแหน่งคู่แข่ง)
   */
  const roam = role === 'attack' ? 3.4 : role === 'midfield' ? 2.2 : 1;
  const phase = elapsed * 0.45 + jitter * Math.PI * 2;
  const driftAlong = Math.sin(phase) * roam * (hasInitiative ? 1 : 0.45);
  const driftAcross = Math.cos(phase * 0.7) * roam * 0.8;

  return clampToPitch({
    x: home.x + direction * (along + driftAlong),
    y: home.y + slide + driftAcross,
  });
};

/**
 * ระยะไกลสุดที่แต่ละจำพวกยอมออกจากตำแหน่งบ้านไปไล่บอล (เมตร)
 *
 * นี่คือกติกาที่ทำให้ "กองหลังไม่วิ่งขึ้นสนามแบบไร้เหตุผล" เป็นจริง
 * บอลอยู่ไกลเกินเขตของเขา = ปล่อยให้เพื่อนที่อยู่ใกล้กว่าจัดการ
 */
const CHASE_RANGE: Record<AgentRole, number> = {
  gk: 14,
  defence: 19,
  midfield: 25,
  attack: 27,
};

/**
 * ดึงเป้าหมายให้อยู่ในเขตรับผิดชอบของนักเตะคนนั้น
 * บอลอยู่นอกเขต = วิ่งไปยืนที่ขอบเขตด้านที่ใกล้บอลที่สุด ไม่ใช่วิ่งตามไปทั้งสนาม
 */
export const leashToZone = (
  target: Vec2,
  home: Vec2,
  role: AgentRole,
  rangeMultiplier = 1,
): Vec2 => {
  // การกดดันสูงยืดเขตรับผิดชอบออกไป ไล่ได้ไกลขึ้น — กดดันต่ำก็หดกลับมาตั้งรับ
  const radius = CHASE_RANGE[role] * rangeMultiplier;
  const dx = target.x - home.x;
  const dy = target.y - home.y;
  const gap = Math.hypot(dx, dy);
  if (gap <= radius) return target;

  return clampToPitch({
    x: home.x + (dx / gap) * radius,
    y: home.y + (dy / gap) * radius,
  });
};

/**
 * ตำแหน่งเข้าประกบบอลของคนที่ถูกเลือกให้ไล่บอล
 * เผื่อทิศทางบอลไว้เล็กน้อย (lead) เพื่อไม่ให้วิ่งตามหลังบอลตลอด
 */
export const interceptTarget = (ball: Vec2, ballVelocity: Vec2, lead = 0.32): Vec2 =>
  clampToPitch({
    x: ball.x + ballVelocity.x * lead,
    y: ball.y + ballVelocity.y * lead,
  });

/** ตำแหน่งริมเส้นที่ปีกควรยืนเพื่อถ่างความกว้างของเกม (เมตรจากขอบสนาม) */
const WIDTH_BAND = 7;

/** ระยะที่ตัวสนับสนุนควรยืนห่างจากคนถือบอล (เมตร) */
const SUPPORT_DISTANCE = 15;

/** ตำแหน่งเหล่านี้ถือเป็นตัวริมเส้น ต้องรักษาความกว้างของเกมไว้ */
const WIDE_POSITIONS: ReadonlySet<Position> = new Set<Position>(['LM', 'RM', 'LW', 'RW', 'LB', 'RB']);

/** ข้อมูลที่ระบบ support ต้องใช้ */
export interface SupportContext {
  side: MatchSide;
  role: AgentRole;
  /** ตำแหน่งของช่องที่เขายืน ใช้แยกตัวริมเส้นออกจากตัวกลาง */
  position: Position;
  home: Vec2;
  ball: Vec2;
  /** ตำแหน่งของเพื่อนที่ถือบอลอยู่ */
  ballOwner: Vec2;
  jitter: number;
  elapsed: number;
  /** ตัวคูณจากแทคติกของทีมนี้ */
  modifiers?: TacticalModifiers;
}

/**
 * ตำแหน่งที่ควรไปยืนเมื่อ "เพื่อนร่วมทีมถือบอลอยู่"
 *
 * หัวใจของ PHASE 2 อยู่ตรงนี้: ห้ามทุกคนวิ่งเข้าหาบอล แต่ละบทบาททำคนละหน้าที่
 *   กองหลัง  → รักษาแนวรับไว้เหมือนเดิม ไม่ตามขึ้นไป
 *   ตัวริมเส้น → ถ่างออกไปกินความกว้างของสนาม
 *   กองกลาง  → ยืนเป็นทางเลือกส่งบอลที่ปลอดภัย เยื้องออกจากคนถือบอลไม่ให้บังกัน
 *   กองหน้า  → วิ่งไปกินพื้นที่ข้างหน้าคนถือบอล
 */
export const supportTarget = (context: SupportContext): Vec2 => {
  const { side, role, position, home, ballOwner, jitter } = context;
  const direction = attackDirection(side);
  const modifiers = context.modifiers ?? NEUTRAL_MODIFIERS;
  const spread = SUPPORT_DISTANCE * modifiers.supportDistance;

  // กองหลังและผู้รักษาประตูไม่ใช่ตัวสนับสนุน — รักษารูปทีมตามเดิม
  if (role === 'gk' || role === 'defence') {
    return shapeTarget({ ...context, hasInitiative: true });
  }

  // ตัวริมเส้น: ยึดความกว้างไว้ก่อน แล้วค่อยขยับตามความสูงของบอล
  if (WIDE_POSITIONS.has(position)) {
    const onLeft = home.y < PITCH.width / 2;
    // widthOffset บวก = หุบเข้ามาจากเส้นข้าง (เล่นแคบ) · ลบ = ถ่างออกไปติดเส้น (เล่นกว้าง)
    const band = Math.min(
      Math.max(WIDTH_BAND + modifiers.widthOffset, 2),
      PITCH.width / 2 - 2,
    );
    return clampToPitch({
      x: ballOwner.x + direction * (role === 'attack' ? 6 : 0),
      y: onLeft ? band : PITCH.width - band,
    });
  }

  if (role === 'attack') {
    // กองหน้าเติมไปข้างหน้าคนถือบอล เยื้องไปทางฝั่งที่ตัวเองยืนตามแผน
    return clampToPitch({
      x: ballOwner.x + direction * spread,
      y: (ballOwner.y + home.y * 2) / 3,
    });
  }

  /*
   * กองกลาง: ยืนเป็นมุมส่งบอล — เยื้องออกด้านข้างจากคนถือบอล ไม่ยืนหลังเขาตรง ๆ
   * jitter ทำให้แต่ละคนเลือกด้านต่างกัน ไม่ไปกระจุกอยู่ข้างเดียวกันหมด
   */
  const side_sign = home.y < ballOwner.y ? -1 : 1;
  const lateral = spread * (0.55 + jitter * 0.35) * side_sign;
  const forward = spread * (0.35 + jitter * 0.3);

  return clampToPitch({
    x: ballOwner.x + direction * forward,
    y: ballOwner.y + lateral,
  });
};

/**
 * ตำแหน่งที่ควรไปยืนเมื่อบอลกำลังเดินทางมาหาเรา
 * เล็งไปที่จุดตัดข้างหน้าลูกบอล ไม่ใช่ตำแหน่งบอลตอนนี้ จะได้ไม่วิ่งตามหลังบอล
 */
export const receiveTarget = (ball: Vec2, ballVelocity: Vec2): Vec2 =>
  clampToPitch({ x: ball.x + ballVelocity.x * 0.25, y: ball.y + ballVelocity.y * 0.25 });
