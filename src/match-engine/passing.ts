/**
 * การเลือกเป้าหมายส่งบอล
 *
 * แยกไฟล์เพราะเป็น "การตัดสินใจ" ล้วน ๆ ไม่มี state ของตัวเอง รับสถานการณ์เข้ามาแล้วคืนคำตอบ
 * ทำให้เทสได้ตรง ๆ และ PHASE ต่อไปเพิ่ม selectShotTarget / selectCrossTarget ข้าง ๆ กันได้เลย
 *
 * ให้คะแนนเพื่อนแต่ละคนแล้วเลือกคนที่ได้คะแนนสูงสุด:
 *
 *   score = distance + space + angle + progression + role − pressure − laneBlocked
 *
 * ตั้งใจให้เป็นสูตรถ่วงน้ำหนักธรรมดา อ่านออกทั้งบรรทัด ปรับจูนได้ด้วยการแก้ค่าคงที่ข้างล่าง
 * ไม่มี machine learning ไม่มีการค้นหาแบบลึก
 */
import { PITCH, attackDirection, targetGoalLine } from '@/match-engine/pitch';
import type { PlayerAgent } from '@/match-engine/playerAgent';
import type { Vec2 } from '@/match-engine/types';

/** ระยะส่งบอลที่ถือว่ากำลังดี (เมตร) — ใกล้หรือไกลกว่านี้เสียคะแนน */
const IDEAL_DISTANCE = 18;

/**
 * ไกลกว่านี้ไม่เลือกเลย
 *
 * ของเดิม 42 ม. ทำให้บอลยาวจากกองกลางถึงกองหน้าเป็นสิ่งที่ระบบ "ไม่รู้จัก" เลย
 * แผนที่มีช่องว่างระหว่างแนวกลางกับแนวหน้ากว้าง (4-3-3 ห่าง 29 ม., 3-5-2 ห่าง 31 ม.)
 * จึงส่งบอลขึ้นหน้าไม่ได้เลยเมื่อกองหน้ายืนสูงกว่านั้นนิดเดียว
 */
const MAX_PASS_DISTANCE = 52;

/** ใกล้กว่านี้ไม่ต้องส่ง เดินไปเองยังเร็วกว่า */
const MIN_PASS_DISTANCE = 4.5;

/** คู่แข่งที่อยู่ใกล้ผู้รับกว่านี้ถือว่ามีแรงกดดัน (เมตร) */
const PRESSURE_RADIUS = 9;

/** ระยะจากเส้นวิถีบอลที่ถือว่าคู่แข่งยืนขวางทางส่ง (เมตร) */
const LANE_RADIUS = 3.2;

/** น้ำหนักของแต่ละปัจจัย */
const WEIGHT = {
  distance: 26,
  space: 22,
  angle: 14,
  progression: 20,
  role: 10,
  pressure: 30,
  lane: 34,
} as const;

/** คะแนนขั้นต่ำที่ยอมส่ง — ต่ำกว่านี้ถือว่าไม่มีจังหวะ ให้ถือบอลต่อ */
export const MIN_PASS_SCORE = 26;

/** โบนัสตามบทบาทของผู้รับ — ส่งให้ตัวรุกได้เปรียบกว่าส่งกลับให้กองหลังเล็กน้อย */
const ROLE_BONUS = {
  gk: -1,
  defence: 0.15,
  midfield: 0.75,
  attack: 1,
} as const;

export interface PassCandidate {
  receiver: PlayerAgent;
  score: number;
}

/** ระยะจากจุดหนึ่งถึงเส้นตรง A→B (ใช้ดูว่ามีคนยืนขวางทางส่งไหม) */
const distanceToLane = (point: Vec2, from: Vec2, to: Vec2): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 0.0001) return Math.hypot(point.x - from.x, point.y - from.y);

  // ตำแหน่งของจุดบนเส้น 0–1 (นอกช่วงนี้แปลว่าคนคนนั้นไม่ได้อยู่ระหว่างทาง)
  const t = Math.min(
    Math.max(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq, 0),
    1,
  );
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
};

/**
 * ให้คะแนนการส่งบอลหนึ่งเส้นทาง
 * แยกออกมาเพื่อให้เทสตรวจได้ทีละปัจจัยว่าทำงานตามที่ตั้งใจ
 */
export const scorePass = (
  passer: PlayerAgent,
  receiver: PlayerAgent,
  opponents: PlayerAgent[],
): number => {
  const from = passer.position2d;
  const to = receiver.position2d;
  const gap = Math.hypot(to.x - from.x, to.y - from.y);

  if (gap < MIN_PASS_DISTANCE || gap > MAX_PASS_DISTANCE) return -Infinity;

  /*
   * ระยะ: ใกล้ระยะอุดมคติที่สุดได้เต็ม แล้วค่อย ๆ ลดลงแบบโค้ง
   *
   * ของเดิมลดเป็นเส้นตรงและถึงศูนย์ที่ 36 ม. พอดี ลูกยาว 30–40 ม. จึงได้คะแนนระยะเป็นศูนย์
   * ทั้งที่ในฟุตบอลจริงเป็นลูกที่เล่นกันทุกเกม โค้งนี้ให้ลูก 35 ม. ยังได้ราว 40%
   */
  const spread = Math.abs(gap - IDEAL_DISTANCE) / 15;
  const distanceScore = (1 / (1 + spread * spread)) * WEIGHT.distance;

  // พื้นที่ว่าง: คู่แข่งที่ใกล้ผู้รับที่สุดอยู่ห่างแค่ไหน
  const nearestOpponent = opponents.reduce(
    (closest, opponent) => Math.min(closest, receiver.distanceTo(opponent.position2d)),
    Infinity,
  );
  const spaceScore = Math.min(nearestOpponent / PRESSURE_RADIUS, 1) * WEIGHT.space;

  /*
   * ยิ่งส่งไกล ความเสี่ยงยิ่งสูงกว่าที่ตาเห็น
   *
   * ตอนขยายระยะส่งสูงสุดเป็น 52 ม. จำนวนการยิงต่อนัดดีขึ้นทุกแผน
   * แต่แผนที่กองหน้ายืนสูงมาก (4-3-3) กลับส่งบอลแม่นแค่ 50–66% เทียบกับ 70–89% ของแผนอื่น
   * เพราะระบบเริ่มเลือก "ลูกยาวหวังผล" เข้าไปในกรอบที่มีกองหลังยืนอยู่ 4 คน
   * โทษของแรงกดดันและคนขวางทางจึงต้องหนักขึ้นตามระยะ ไม่ใช่คิดเท่ากันหมด
   */
  const riskByDistance = 0.7 + gap / 40;

  const pressure =
    nearestOpponent < PRESSURE_RADIUS
      ? (1 - nearestOpponent / PRESSURE_RADIUS) * WEIGHT.pressure * riskByDistance
      : 0;

  // มุม: ส่งไปข้างหน้าหรือขวางสนามดีกว่าส่งย้อนหลัง (แต่ย้อนหลังไม่ได้ถูกห้าม)
  const direction = attackDirection(passer.side);
  const forwardness = ((to.x - from.x) * direction) / gap; // −1 ถึง 1
  const angleScore = ((forwardness + 1) / 2) * WEIGHT.angle;

  // ความคืบหน้า: ผู้รับเข้าใกล้ประตูคู่แข่งกว่าคนส่งแค่ไหน (คิดเป็นสัดส่วนของสนาม)
  const goal = targetGoalLine(passer.side);
  const gained = (Math.abs(goal - from.x) - Math.abs(goal - to.x)) / PITCH.length;
  const progressionScore = Math.min(Math.max(gained, -0.35), 0.35) * (WEIGHT.progression / 0.35);

  // มีคนยืนขวางเส้นทางส่งไหม
  const blockers = opponents.filter(
    (opponent) => distanceToLane(opponent.position2d, from, to) < LANE_RADIUS,
  ).length;
  const lanePenalty = blockers * WEIGHT.lane * riskByDistance;

  const roleScore = ROLE_BONUS[receiver.role] * WEIGHT.role;

  return (
    distanceScore + spaceScore + angleScore + progressionScore + roleScore - pressure - lanePenalty
  );
};

/**
 * เลือกเพื่อนที่ควรส่งบอลให้ที่สุด
 *
 * คืน null เมื่อไม่มีใครได้คะแนนถึงเกณฑ์ — คนถือบอลจะถือต่อแล้วเลี้ยงหาจังหวะใหม่
 * ส่ง minScore เป็นค่าต่ำ ๆ ได้เมื่อถือบอลนานเกินไปจนต้องปล่อยแล้วไม่ว่าจะดีหรือไม่
 */
export const selectPassTarget = (
  passer: PlayerAgent,
  teammates: PlayerAgent[],
  opponents: PlayerAgent[],
  minScore: number = MIN_PASS_SCORE,
): PassCandidate | null => {
  let best: PassCandidate | null = null;

  for (const receiver of teammates) {
    if (receiver.id === passer.id) continue;

    const score = scorePass(passer, receiver, opponents);
    if (score === -Infinity) continue;
    if (!best || score > best.score) best = { receiver, score };
  }

  return best && best.score >= minScore ? best : null;
};

/** ความเร็วบอลตามระยะส่ง — ลูกสั้นเร็วพอให้คุมได้ ลูกยาวแรงพอให้ไปถึง */
export const passSpeed = (distance: number): number => {
  const base = 9 + distance * 0.42;
  return Math.min(Math.max(base, 9), 26);
};
