/**
 * Player Agent — นักเตะหนึ่งคนในเครื่องจำลอง
 *
 * เก็บ position / velocity / targetPosition / role / formationPosition / decision state
 * ตามที่โจทย์กำหนด และรู้วิธีเคลื่อนที่เข้าหาเป้าหมายของตัวเองเท่านั้น
 * ส่วน "เป้าหมายคือที่ไหน" เป็นหน้าที่ของ formationSystem + MatchEngine
 *
 * การเคลื่อนที่ใช้ steering แบบ seek + arrive:
 *   เร่งเข้าหาเป้าหมาย → ชะลอเมื่อใกล้ → หยุดนิ่งเมื่อถึง
 * บวกแรงผลักออกจากเพื่อนร่วมทีมที่ยืนชิดเกินไป จะได้ไม่ซ้อนทับกันเป็นก้อน
 */
import { clampToPitch, distance, roleOf } from '@/match-engine/pitch';
import {
  ballControlRating,
  defendingRating,
  goalkeepingRating,
  shootingRating,
  statsFromOvr,
} from '@/match-engine/ratings';
import type {
  AgentRole,
  MatchPlayerInput,
  MatchSide,
  MovementState,
  PlayerDecision,
  Vec2,
} from '@/match-engine/types';
import type { PlayerStats, Position } from '@/match-engine/playerTypes';

/** ความเร็วสูงสุดของนักเตะทั่วไป (เมตร/วินาที) — สเกลตามค่าพลัง */
const BASE_SPEED = 5.4;
const SPEED_SPREAD = 2.4;

/** อัตราเร่ง (เมตร/วินาที²) — ยิ่งสูงยิ่งเปลี่ยนทิศได้ไว */
const ACCELERATION = 11;

/** ระยะที่เริ่มชะลอก่อนถึงเป้าหมาย (เมตร) */
const ARRIVE_RADIUS = 2.4;

/** ใกล้กว่านี้ถือว่าถึงที่หมายแล้ว */
const REACHED_RADIUS = 0.7;

/** เพื่อนร่วมทีมที่ใกล้กว่านี้จะถูกผลักออกจากกัน (เมตร) */
export const SEPARATION_RADIUS = 3.2;

/** ความเร็วที่แต่ละสถานะยอมใช้ (สัดส่วนของความเร็วสูงสุด) */
const STATE_EFFORT: Record<MovementState, number> = {
  IDLE: 0,
  POSITIONING: 0.55,
  MOVING_TO_BALL: 1,
  SUPPORT: 0.8,
  DEFENDING: 0.72,
  ATTACKING: 0.82,
  // เลี้ยงบอลช้ากว่าวิ่งเปล่า ไม่งั้นคนถือบอลจะทิ้งเพื่อนไปคนเดียว
  ON_BALL: 0.62,
  RECEIVING: 0.95,
  PRESSING: 1,
};

/** สถานะการอยู่ในสนามของนักเตะ */
export type AgentAvailability = 'active' | 'sent_off';

export class PlayerAgent {
  readonly id: string;
  readonly name: string;
  readonly shirtNumber: number;
  readonly side: MatchSide;
  readonly position: Position;
  readonly role: AgentRole;
  readonly ovr: number;
  readonly slotId: string;

  /** ค่าพลัง 6 ด้านจริงของนักเตะคนนี้ */
  readonly stats: PlayerStats;

  /** ค่าความสามารถเฉพาะทาง คำนวณครั้งเดียวตอนลงสนาม (ไม่เปลี่ยนระหว่างแมตช์) */
  readonly shooting: number;
  readonly defending: number;
  readonly ballControl: number;
  readonly goalkeeping: number;

  /** ตำแหน่งบ้านตามแผน (พิกัดโลก) — ไม่เปลี่ยนตลอดแมตช์ */
  readonly formationPosition: Vec2;

  /** ค่าสุ่มคงที่ประจำตัว 0–1 ใช้ให้จังหวะการขยับของแต่ละคนไม่ตรงกันเป๊ะ */
  readonly jitter: number;

  /** ความเร็วสูงสุดของคนนี้ (เมตร/วินาที) */
  readonly topSpeed: number;

  position2d: Vec2;
  velocity: Vec2 = { x: 0, y: 0 };
  targetPosition: Vec2;
  state: MovementState = 'POSITIONING';

  /** ชั้นการตัดสินใจ — ตอนนี้ตั้งใจจะทำอะไร (แยกจากท่าเดินข้างบน) */
  decision: PlayerDecision = 'MOVE';

  /**
   * เวลาที่เหลือก่อนจะตัดสินใจครั้งถัดไป (วินาที)
   * มีไว้ไม่ให้คนถือบอลตัดสินใจใหม่ทุกเฟรม — ต้องมีจังหวะได้ถือบอลและมองเกมก่อน
   */
  decisionTimer = 0;

  /** ทิศที่หันหน้า (เรเดียน) — ใช้วาดตัวละครและเงาการวิ่ง */
  facing = 0;

  /** เฟสของแอนิเมชันวิ่ง 0–2π เดินตามระยะที่วิ่งไปจริง ขาจึงไม่ "ลอย" */
  runPhase = 0;

  /** ความเร็วปัจจุบัน (เมตร/วินาที) — renderer ใช้ตัดสินว่าจะวาดท่าวิ่งแรงแค่ไหน */
  speed = 0;

  /** ยังอยู่ในสนามไหม — โดนใบแดงแล้วเป็น 'sent_off' และถูกถอดออกจากการจำลอง */
  availability: AgentAvailability = 'active';

  /** ใบเหลืองที่ได้ในแมตช์นี้ (ใบที่สองกลายเป็นใบแดง) */
  yellowCards = 0;

  /** เวลาที่เหลือก่อนจะเข้าสกัดได้อีกครั้ง (วินาที) — กันการเข้าสกัดรัวทุกเฟรม */
  tackleCooldown = 0;

  /**
   * เวลาที่เหลือก่อนจะยิงได้อีกครั้ง (วินาที)
   *
   * การยิงถูกประเมินทุก tick (โอกาสยิงมาเมื่อไรก็ยิงตอนนั้น) ถ้าไม่มีตัวนี้
   * คนที่ได้บอลคืนมาในจุดเดิมจะยิงซ้ำทันทีเป็นชุด ๆ ภายในไม่กี่เฟรม
   */
  shotCooldown = 0;

  /**
   * นาทีในเกมที่เขาลงสนาม (ตัวจริง = 0, ตัวสำรอง = นาทีที่เปลี่ยนตัวลงมา)
   * ใช้คิดความล้า — คนที่เพิ่งลงมาสด ไม่ใช่ล้าเท่าคนที่วิ่งมาทั้งเกม
   */
  enteredMinute = 0;

  /**
   * พลังงานที่เหลือ 0.15–1 — MatchEngine เป็นคนอัปเดตทุก tick (คนเดียว)
   * ยิ่งเหลือน้อยยิ่งวิ่งช้า ดู update() ข้างล่าง
   */
  stamina = 1;

  /**
   * ค่าความทน 0–1 จาก physical — คนตัวแข็งแรงพลังงานหล่นช้ากว่า
   * คิดครั้งเดียวตอนสร้าง ไม่ต้องหารใหม่ทุกเฟรม
   */
  readonly endurance: number;

  constructor(input: MatchPlayerInput, side: MatchSide, home: Vec2, jitter: number) {
    this.id = input.id;
    this.name = input.name;
    this.shirtNumber = input.shirtNumber;
    this.side = side;
    this.position = input.position;
    this.role = roleOf(input.position);
    this.ovr = input.ovr;
    this.slotId = input.slotId;
    this.formationPosition = home;
    this.jitter = jitter;

    // ค่าพลังจริงจากการ์ด ถ้าไม่ได้ส่งมาก็ใช้ ovr เท่ากันทั้ง 6 ด้าน
    this.stats = input.stats ?? statsFromOvr(input.ovr);
    this.shooting = shootingRating(this.stats);
    this.defending = defendingRating(this.stats);
    this.ballControl = ballControlRating(this.stats);
    this.goalkeeping = goalkeepingRating(this.stats);

    // physical 50–125 → 0–1 (สเกลเดียวกับ normalise() ใน ratings.ts)
    this.endurance = Math.min(Math.max((this.stats.physical - 50) / 75, 0), 1);

    // ความเร็วมาจากค่า pace ถ้ามี ไม่มีก็ใช้ ovr แทน (ช่วง 55–99 → 0–1)
    const rating = input.pace ?? input.stats?.pace ?? input.ovr;
    const normalised = Math.min(Math.max((rating - 55) / 44, 0), 1);
    this.topSpeed = BASE_SPEED + normalised * SPEED_SPREAD;

    this.position2d = { x: home.x, y: home.y };
    this.targetPosition = { x: home.x, y: home.y };
    this.facing = side === 'home' ? 0 : Math.PI;
  }

  /** ระยะจากตัวเขาถึงจุดหนึ่ง */
  distanceTo(point: Vec2): number {
    return distance(this.position2d, point);
  }

  /**
   * เคลื่อนที่หนึ่ง tick
   *
   * @param dt        เวลาที่ผ่านไปจริง (วินาที)
   * @param separation แรงผลักจากเพื่อนร่วมทีมที่ยืนชิดเกินไป (คำนวณโดย MatchEngine)
   * @param lookAt    จุดที่ควรหันหน้าไปเมื่อยืนนิ่ง (ปกติคือบอล)
   */
  update(dt: number, separation: Vec2, lookAt: Vec2): void {
    const toTarget = {
      x: this.targetPosition.x - this.position2d.x,
      y: this.targetPosition.y - this.position2d.y,
    };
    const gap = Math.hypot(toTarget.x, toTarget.y);

    // ถึงที่หมายแล้วและไม่ได้ไล่บอลอยู่ → ยืนพัก
    if (gap < REACHED_RADIUS && this.state !== 'MOVING_TO_BALL') {
      this.state = 'IDLE';
    }

    const effort = STATE_EFFORT[this.state];
    // ขาหมด = ช้าลงราว 15% (พลังงานเต็ม 1.0 → ไม่หักเลย)
    const maxSpeed = this.topSpeed * effort * (0.85 + 0.15 * this.stamina);

    // ชะลอตอนเข้าใกล้เป้าหมาย ไม่งั้นจะวิ่งเลยแล้วแกว่งกลับไปกลับมา
    const arrive = gap < ARRIVE_RADIUS ? gap / ARRIVE_RADIUS : 1;
    const desired =
      gap > 0.0001
        ? { x: (toTarget.x / gap) * maxSpeed * arrive, y: (toTarget.y / gap) * maxSpeed * arrive }
        : { x: 0, y: 0 };

    // แรงผลักจากเพื่อนร่วมทีมมีน้ำหนักน้อยกว่าเป้าหมายเสมอ รูปทีมจึงไม่เสีย
    desired.x += separation.x;
    desired.y += separation.y;

    // เร่งเข้าหาความเร็วที่อยากได้ทีละนิด (ไม่ teleport ความเร็ว)
    const step = ACCELERATION * dt;
    const dvx = desired.x - this.velocity.x;
    const dvy = desired.y - this.velocity.y;
    const dv = Math.hypot(dvx, dvy);

    if (dv > step) {
      this.velocity.x += (dvx / dv) * step;
      this.velocity.y += (dvy / dv) * step;
    } else {
      this.velocity.x = desired.x;
      this.velocity.y = desired.y;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.y);

    // จำกัดความเร็วไม่ให้เกินของตัวเอง (แรงผลักอาจดันเกินได้)
    if (this.speed > this.topSpeed) {
      const scale = this.topSpeed / this.speed;
      this.velocity.x *= scale;
      this.velocity.y *= scale;
      this.speed = this.topSpeed;
    }

    const next = clampToPitch({
      x: this.position2d.x + this.velocity.x * dt,
      y: this.position2d.y + this.velocity.y * dt,
    });
    this.position2d = next;

    // วิ่งอยู่ = หันตามทิศที่วิ่ง · ยืนนิ่ง = หันไปทางบอล
    const target =
      this.speed > 0.35
        ? Math.atan2(this.velocity.y, this.velocity.x)
        : Math.atan2(lookAt.y - next.y, lookAt.x - next.x);
    this.facing = turnToward(this.facing, target, dt * 9);

    // เฟสขาเดินตามระยะทางจริง — วิ่งเร็วขาสลับถี่ ยืนนิ่งขาหยุด
    this.runPhase = (this.runPhase + this.speed * dt * 2.6) % (Math.PI * 2);
  }
}

/** หมุนมุมปัจจุบันเข้าหามุมเป้าหมายทีละนิด (เลือกทางที่สั้นกว่าเสมอ) */
const turnToward = (current: number, target: number, maxStep: number): number => {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
};
