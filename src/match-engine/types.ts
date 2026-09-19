/**
 * โครงสร้างข้อมูลของ Match Engine (PHASE 1)
 *
 * ไฟล์ทั้งโฟลเดอร์ match-engine/ ห้าม import React หรือแตะ DOM
 * มันคือเครื่องจำลองล้วน ๆ — UI มีหน้าที่อ่าน state ออกไปวาดเท่านั้น
 * ทำแบบนี้เพื่อให้ PHASE 2 (ส่งบอล/ยิง/เซฟ/ฟาวล์) เพิ่มเข้ามาได้โดยไม่ต้องแตะ React เลย
 *
 * ระบบพิกัด "โลกจริง" ของเอนจิน (หน่วยเป็นเมตร ไม่ใช่พิกเซล):
 *   x = ความยาวสนาม 0 → 105  (0 = เส้นประตูฝั่ง home, 105 = เส้นประตูฝั่ง away)
 *   y = ความกว้างสนาม 0 → 68 (0 = ริมเส้นข้างบน, 68 = ริมเส้นข้างล่าง)
 * ทีม home บุกไปทาง +x, ทีม away บุกไปทาง −x
 *
 * ต่างจากพิกัดของ FormationSlot ในเกม (x/y เป็น 0–100 และ y คือความยาวสนาม)
 * การแปลงอยู่ที่ pitch.ts เพียงที่เดียว
 */
import type { Tactics } from '@/match-engine/tactics';
import type { PlayerStats, Position } from '@/match-engine/playerTypes';

/** เวกเตอร์ 2 มิติ — ใช้ซ้ำทั้งตำแหน่ง ความเร็ว และเป้าหมาย */
export interface Vec2 {
  x: number;
  y: number;
}

/** ฝั่งของทีมในแมตช์ */
export type MatchSide = 'home' | 'away';

/** จำพวกของนักเตะที่เอนจินใช้ตัดสินพฤติกรรม (แปลงมาจาก Position ของเกม) */
export type AgentRole = 'gk' | 'defence' | 'midfield' | 'attack';

/**
 * สถานะการเคลื่อนที่ของนักเตะหนึ่งคน (ชั้นการเดิน — ตอบว่า "ขาพาไปไหน")
 *
 * IDLE           ยืนอยู่กับที่ (ถึงตำแหน่งแล้วและบอลอยู่ไกล)
 * POSITIONING    เดินกลับเข้าตำแหน่งตามแผน
 * MOVING_TO_BALL บอลเป็นลูกหลุด — วิ่งเข้าไปเก็บ
 * SUPPORT        เพื่อนครองบอลอยู่ — ขยับไปยืนในตำแหน่งที่รับบอลต่อได้
 * DEFENDING      ทีมไม่ได้ครองบอล — ถอยลงมารักษาแนว
 * ATTACKING      ทีมได้ครองบอล — เติมขึ้นไปหาพื้นที่ว่างข้างหน้า
 * ON_BALL        กำลังครองบอลอยู่กับเท้า (PHASE 2)
 * RECEIVING      บอลกำลังเดินทางมาหาเขา — ขยับไปรับ (PHASE 2)
 * PRESSING       เข้าไปกดดันคนที่ครองบอลของอีกฝ่าย (PHASE 2)
 */
export type MovementState =
  | 'IDLE'
  | 'POSITIONING'
  | 'MOVING_TO_BALL'
  | 'SUPPORT'
  | 'DEFENDING'
  | 'ATTACKING'
  | 'ON_BALL'
  | 'RECEIVING'
  | 'PRESSING';

/**
 * ชั้นการตัดสินใจ (ตอบว่า "ตอนนี้ตั้งใจจะทำอะไร") — แยกจากชั้นการเดินข้างบน
 *
 * แยกสองชั้นเพราะ PHASE ต่อไปจะเพิ่ม SHOOT / TACKLE / CROSS / THROUGH_BALL
 * ซึ่งเป็นการตัดสินใจ ไม่ใช่ท่าเดิน จะได้เติมที่นี่โดยไม่ไปยุ่งกับ MovementState
 */
export type PlayerDecision =
  | 'HOLD'
  | 'PASS'
  | 'MOVE'
  | 'SUPPORT'
  | 'PRESS'
  | 'RECEIVE'
  | 'SHOOT'
  | 'TACKLE';

/**
 * สถานะของลูกบอล
 *
 * FREE       ลูกหลุด ไม่มีใครเป็นเจ้าของ ใครถึงก่อนได้ก่อน
 * TRAVELLING กำลังเดินทางจากการส่ง — มีผู้รับที่ตั้งใจไว้ และถูกตัดบอลได้
 * CONTROLLED อยู่กับเท้าคนใดคนหนึ่ง
 */
export type BallState = 'FREE' | 'TRAVELLING' | 'SHOT' | 'CONTROLLED' | 'DEAD';

/** ช่วงของแมตช์ — PHASE 1 ใช้แค่ kickoff → live → fulltime */
export type MatchPhase = 'kickoff' | 'live' | 'paused' | 'fulltime';

/**
 * ช่วงเวลาของการแข่งขันตามกติกา (PHASE 4)
 * แยกจาก MatchPhase ซึ่งบอกว่า "เอนจินกำลังเดินอยู่หรือหยุด"
 * ตัวนี้บอกว่า "ตอนนี้เป็นครึ่งไหนของเกม"
 */
export type MatchPeriod =
  | 'PRE_MATCH'
  | 'FIRST_HALF'
  | 'HALF_TIME'
  | 'SECOND_HALF'
  | 'FULL_TIME';

/* ── ข้อมูลนำเข้า (มาจากระบบเดิมของเกม) ───────────────────── */

/**
 * นักเตะหนึ่งคนที่ส่งเข้าเอนจิน
 *
 * ทุกฟิลด์มาจากข้อมูลจริงของเกม (Player + FormationSlot + การ์ดของผู้เล่น)
 * เอนจินไม่รู้จัก Firestore, ไม่รู้จักการ์ด, ไม่รู้จักค่าตีบวก — รู้แค่ที่เห็นตรงนี้
 */
export interface MatchPlayerInput {
  /** ไม่ซ้ำกันภายในแมตช์ (ใช้ cardId ฝั่งเรา / playerId ฝั่งคู่แข่ง) */
  id: string;
  name: string;
  /** เบอร์เสื้อที่โชว์บนตัวนักเตะ (ใช้ลำดับช่องในแผน 1–11 เหมือนแผงรายชื่อ) */
  shirtNumber: number;
  /** ตำแหน่งของ "ช่อง" ที่เขายืน ไม่ใช่ตำแหน่งถนัดของตัวนักเตะ */
  position: Position;
  ovr: number;
  /** ค่าความเร็วจาก PlayerStats — ไม่มีก็ถอยไปใช้ ovr */
  pace?: number;
  /**
   * ค่าพลัง 6 ด้านจริงของนักเตะคนนี้ (ตัวเดียวกับที่โชว์บนการ์ด)
   * เอนจินใช้คำนวณค่าความสามารถเฉพาะทาง เช่น การยิง การเข้าสกัด การเซฟ
   * ไม่มีก็ถอยไปใช้ ovr ทั้ง 6 ช่อง — ไม่มีการแต่งค่าปลอมรายคน
   */
  stats?: PlayerStats;
  /** รหัสช่องในแผน เช่น 'CB1' — ผูกกลับไปหาข้อมูลเดิมได้ */
  slotId: string;
  /** พิกัดช่องตามแผน (0–100 ตามระบบเดิม: y คือความยาวสนาม) */
  formationX: number;
  formationY: number;
}

/** ทีมหนึ่งทีมที่ส่งเข้าเอนจิน */
export interface MatchTeamInput {
  id: string;
  name: string;
  /** ชื่อแผน ใช้แค่โชว์ — ตำแหน่งจริงมาจาก formationX/Y ของนักเตะแต่ละคน */
  formationName: string;
  /** สีหลักของชุดแข่ง (hex) */
  color: string;
  /** สีตัวเลข/ขอบ ให้อ่านเบอร์ออกบนสีหลัก */
  accent: string;
  players: MatchPlayerInput[];
}

/* ── เหตุการณ์ (ยังไม่ได้ใช้ใน PHASE 1) ────────────────────── */

/**
 * เหตุการณ์ที่เอนจินปล่อยออกมา
 *
 * PHASE 1: kickoff, fulltime
 * PHASE 2: pass, receive, possession_change, interception, pass_lost
 * PHASE ต่อไป: shot, goal, save, tackle, foul — เติม type ใหม่ได้เลย ไม่ต้องแก้สัญญานี้
 *
 * ตั้งใจให้ครบพอที่จะเอาไปทำ commentary / statistics / match history / replay ได้ทีหลัง
 */
export interface MatchSimEvent {
  type: string;
  /** นาทีในเกมที่เกิด */
  minute: number;
  side?: MatchSide;
  /** id ของทีมที่เหตุการณ์นี้เป็นของ (ตรงกับ MatchTeamInput.id) */
  teamId?: string;
  playerId?: string;
  /** ปลายทางของเหตุการณ์ เช่นผู้รับบอลของการส่งครั้งนี้ */
  targetPlayerId?: string;
  /** คนที่สอง เช่นคนโดนเข้าสกัด หรือคนจ่ายบอลให้คนทำประตู */
  secondaryPlayerId?: string;
  /** ตำแหน่งในสนามที่เกิดเหตุการณ์ (พิกัดโลก) */
  position?: Vec2;
  /** ข้อมูลเพิ่มเติมแล้วแต่ประเภทเหตุการณ์ */
  detail?: Record<string, number | string>;
}

/**
 * ภาพนิ่งของแมตช์สำหรับฝั่ง UI
 *
 * React อ่านอันนี้ ไม่ได้อ่านตัวเอนจินตรง ๆ จึงไม่มีทางแก้สถานะการจำลองโดยบังเอิญ
 * และไม่ต้องดึงทุกเฟรม — ดึงตอนนาทีเปลี่ยนหรือมีเหตุการณ์ใหม่ก็พอ
 */
export interface MatchSnapshot {
  matchId: string;
  minute: number;
  second: number;
  clockLabel: string;
  period: MatchPeriod;
  phase: MatchPhase;
  speed: number;
  score: { home: number; away: number };
  /** สัดส่วนการครองบอลของทีมเหย้า 0–1 */
  possession: number;
  stats: { home: TeamMatchStats; away: TeamMatchStats };
  tactics: { home: Tactics; away: Tactics };
  onPitch: { home: number; away: number };
  emittedCount: number;
}

/**
 * ตัวนับสถิติของทีมหนึ่งทีม
 * ยังไม่มี UI ใน PHASE 2 — เก็บไว้ให้หน้าสรุปผลการแข่งใช้ได้ทันทีเมื่อถึงเวลา
 */
export interface TeamMatchStats {
  /** จำนวนครั้งที่พยายามส่งบอล */
  passes: number;
  /** ส่งถึงเพื่อนจริง */
  completedPasses: number;
  /** ตัดบอลของอีกฝ่ายได้ */
  interceptions: number;
  /** จำนวนครั้งที่ได้บอลมาอยู่กับเท้า */
  touches: number;
  /** เวลาครองบอลรวม (วินาทีจริงของการจำลอง) */
  possessionSeconds: number;
  /** จำนวนครั้งที่ยิง */
  shots: number;
  /** ยิงเข้ากรอบ (ถ้าไม่มีผู้รักษาประตูก็เป็นประตู) */
  shotsOnTarget: number;
  /** ประตูที่ทำได้ — เป็นแหล่งความจริงเดียวของสกอร์ */
  goals: number;
  /** ผู้รักษาประตูเซฟได้ */
  saves: number;
  /** เข้าสกัดทั้งหมด */
  tackles: number;
  /** เข้าสกัดแล้วได้บอล */
  successfulTackles: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

/**
 * สถิติรายบุคคลของแมตช์นี้
 *
 * แยกจาก Player ที่เป็นข้อมูลถาวรโดยสิ้นเชิง — เอนจินไม่เคยเขียนอะไรกลับไปที่ข้อมูลนักเตะ
 * เก็บด้วย id ของผู้เล่นในแมตช์ พอจบแมตช์ก็ทิ้งไปพร้อมเอนจิน
 */
export interface PlayerMatchStats {
  playerId: string;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  completedPasses: number;
  interceptions: number;
  tackles: number;
  saves: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

/** นาฬิกาแมตช์ */
export interface MatchClock {
  /** นาทีในเกม 0–90 */
  minute: number;
  /** วินาทีภายในนาทีนั้น 0–59 (ใช้ให้เข็มเดินลื่นไหล ไม่กระตุกทีละนาที) */
  second: number;
  running: boolean;
}

/** ค่าตั้งต้นของเอนจิน */
export interface MatchEngineOptions {
  /** ความยาวแมตช์ (นาทีในเกม) — ค่าปกติ 90 */
  totalMinutes?: number;
  /**
   * นาทีในเกมที่เดินต่อ 1 วินาทีจริง
   * เกมนี้ถ่ายทอดสด 90 นาทีในราว 12 วินาที จึงประมาณ 7.7
   */
  minutesPerSecond?: number;
  /** ค่า seed ให้การสุ่มคงที่ (ทีมเดิมจะขยับเหมือนเดิมทุกครั้ง) */
  seed?: string;
  /** รหัสแมตช์จริงจาก match session — ไม่ส่งมาก็ใช้ seed แทน ไม่สุ่มรหัสใหม่เอง */
  matchId?: string;
  /** แทคติกตั้งต้นของสองทีม ไม่ส่งมาก็ใช้ BALANCED ทั้งคู่ */
  tactics?: { home?: Partial<Tactics>; away?: Partial<Tactics> };
  /** พักครึ่งกี่วินาทีก่อนเริ่มครึ่งหลังเอง (0 = ไม่พักอัตโนมัติ) */
  halfTimeSeconds?: number;

  /**
   * ตัวสำรองของแต่ละฝั่ง — ยังไม่ลงสนาม รอถูกเรียกผ่าน substitute()
   * ใช้ formationX/Y อะไรมาก็ได้ เพราะตอนลงจะไปรับช่องของคนที่ออกแทน
   */
  bench?: { home?: MatchPlayerInput[]; away?: MatchPlayerInput[] };

  /** เปลี่ยนตัวได้สูงสุดกี่ครั้งต่อทีม — ค่าปกติ 5 ตามกติกาปัจจุบัน */
  maxSubs?: number;

  /**
   * ตัวคูณปรับจังหวะเกมทั้งแมตช์ (คูณทับตัวคูณของแทคติกอีกชั้น)
   *
   * มีไว้เพราะเอนจินตัวนี้ถูกจูนมาสำหรับ 90 นาทีในราว 90 วินาที
   * พอเอามาใช้กับการถ่ายทอดแบบบีบเวลาของ FC-ALL-STAR จำนวนลูกยิงจะบางกว่าที่เคย
   * ค่าตรงนี้คือที่เดียวที่ปรับความถี่ได้ โดยไม่ต้องไปแก้ค่าคงที่ข้างในเอนจิน
   *
   * ไม่ส่งมา = 1 ทั้งคู่ (พฤติกรรมดิบของเอนจิน)
   */
  tuning?: {
    /** ตัดสินใจไวขึ้นกี่เท่า — ส่งบอลถี่ขึ้น ถือบอลสั้นลง */
    decisionSpeed?: number;
    /** อยากยิงมากขึ้นกี่เท่า */
    shotBias?: number;
    /** เข้าสกัดถี่ขึ้นกี่เท่า */
    tackleTendency?: number;
  };
  /**
   * แหล่งความจริงของนาฬิกา
   *
   * 'internal' (ค่าปกติ) — เอนจินเดินนาฬิกาเอง ใช้ตอนรันเดี่ยว ๆ หรือในเทส
   * 'external' — นาทีมาจากข้างนอกทั้งหมด (useMatchmaking) เอนจินไม่นับเวลาเอง
   *              ใช้ในเกมจริง เพื่อไม่ให้มีนาฬิกาสองเรือนแข่งกัน
   */
  clockSource?: 'internal' | 'external';
}
