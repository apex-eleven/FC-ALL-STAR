/**
 * ระบบเกมรับที่ใช้ปะทะตัวต่อตัว — การเข้าสกัด ฟาวล์ และใบเหลือง/ใบแดง
 *
 * PHASE 2 มีแค่การเข้ากดดัน (วิ่งเข้าไปประชิด) แต่แย่งบอลจากเท้าไม่ได้
 * PHASE 3 เพิ่มการเข้าสกัดจริงบนฐานเดิม: คนที่กดดันอยู่แล้วคือคนที่มีสิทธิ์เข้าสกัด
 *
 *   ประชิดในระยะ → รอ cooldown หมด → ทอยผลสกัด → ได้บอล / ไม่ได้บอล → ทอยว่าฟาวล์ไหม → ทอยใบ
 *
 * ทุกการทอยใช้ตัวสุ่มที่มี seed ของเอนจิน ผลจึงซ้ำได้เสมอเมื่อ seed เท่ากัน
 */
import type { PlayerAgent } from '@/match-engine/playerAgent';
import { normalise } from '@/match-engine/ratings';

/** ระยะที่เข้าสกัดได้ (เมตร) */
export const TACKLE_RANGE = 1.6;

/**
 * ระยะพักหลังเข้าสกัดหนึ่งครั้ง (วินาที) — กันการเข้าสกัดรัว 60 ครั้งต่อวินาที
 * ตั้งไว้ค่อนข้างยาวเพราะคนที่เข้ากดดันจะประชิดคนถือบอลเกือบตลอดเวลา
 * ถ้าสั้นกว่านี้จะได้การเข้าสกัดหลักร้อยครั้งต่อครึ่งเวลา ซึ่งไม่ใช่ฟุตบอล
 */
export const TACKLE_COOLDOWN = { min: 4, max: 7 } as const;

/**
 * โอกาสที่จะ "ตัดสินใจลอง" เข้าสกัดต่อวินาทีเมื่อประชิดในระยะแล้ว
 * ไม่ใช่ทุกครั้งที่เข้าใกล้จะต้องพุ่งเข้าเสียบ
 */
export const TACKLE_ATTEMPT_RATE = 0.5;

/** โอกาสสำเร็จถูกบีบไว้เสมอ ไม่มีใครสกัดได้ทุกครั้งหรือพลาดทุกครั้ง */
const SUCCESS_BOUNDS = { min: 0.12, max: 0.82 } as const;

/** โอกาสฟาวล์พื้นฐานเมื่อเข้าสกัดพลาด (เข้าสกัดสำเร็จก็ยังฟาวล์ได้แต่น้อยกว่ามาก) */
const FOUL_BASE = { onFail: 0.16, onSuccess: 0.04 } as const;

/** โอกาสได้ใบเมื่อเกิดฟาวล์ */
const CARD_CHANCE = { yellow: 0.22, red: 0.025 } as const;

export type TackleOutcome = 'won' | 'lost';

export interface TackleResult {
  outcome: TackleOutcome;
  foul: boolean;
  card: 'none' | 'yellow' | 'red';
}

/**
 * โอกาสที่การเข้าสกัดครั้งนี้จะได้บอล (0–1)
 *
 * ฝีมือเกมรับของคนเข้าปะทะ เทียบกับความสามารถในการรักษาบอลของคนถือบอล
 * แล้วบวกโบนัสตามระยะ — เข้าจากตัวติดย่อมได้เปรียบกว่าเอื้อมขาไปไกล ๆ
 */
export const tackleSuccessChance = (
  defender: PlayerAgent,
  attacker: PlayerAgent,
  distance: number,
): number => {
  const defence = normalise(defender.defending);
  const control = normalise(attacker.ballControl);

  // ระยะใกล้ = ได้เปรียบ
  const proximity = 1 - Math.min(distance / TACKLE_RANGE, 1);

  const raw = 0.35 + (defence - control) * 0.55 + proximity * 0.2;
  return Math.min(Math.max(raw, SUCCESS_BOUNDS.min), SUCCESS_BOUNDS.max);
};

/**
 * ตัดสินผลการเข้าสกัดหนึ่งครั้งให้ครบทั้งชุด
 *
 * @param rolls ค่าสุ่ม 0–1 สามตัวจากตัวสุ่มของเอนจิน (สกัด / ฟาวล์ / ใบ)
 *              รับเข้ามาแทนที่จะสุ่มเอง เพื่อให้ฟังก์ชันนี้เป็น pure และเทสได้ตรง ๆ
 */
export const resolveTackle = (
  defender: PlayerAgent,
  attacker: PlayerAgent,
  distance: number,
  rolls: { tackle: number; foul: number; card: number },
): TackleResult => {
  const won = rolls.tackle < tackleSuccessChance(defender, attacker, distance);

  /*
   * คนที่พละกำลังดีกว่าเข้าปะทะได้สะอาดกว่า จึงฟาวล์น้อยกว่า
   * ใช้ physical จริงของการ์ด ไม่ใช่ค่าคงที่เดียวกันหมด
   */
  const cleanliness = normalise(defender.stats.physical) * 0.4;
  const foulChance = (won ? FOUL_BASE.onSuccess : FOUL_BASE.onFail) * (1 - cleanliness);
  const foul = rolls.foul < foulChance;

  if (!foul) return { outcome: won ? 'won' : 'lost', foul: false, card: 'none' };

  const card =
    rolls.card < CARD_CHANCE.red
      ? 'red'
      : rolls.card < CARD_CHANCE.red + CARD_CHANCE.yellow
        ? 'yellow'
        : 'none';

  // ฟาวล์แล้วบอลเป็นของฝ่ายที่ถูกทำฟาวล์เสมอ ไม่ว่าจะแย่งบอลได้หรือไม่
  return { outcome: 'lost', foul: true, card };
};
