/**
 * ค่าความสามารถเฉพาะทางที่คำนวณจากข้อมูลนักเตะจริง
 *
 * การ์ดในเกมนี้มีค่าพลัง 6 ด้าน: pace / shooting / passing / dribbling / defending / physical
 * ไม่มีช่อง finishing, tackling หรือ goalkeeping แยกต่างหาก
 * แทนที่จะแต่งค่าใหม่ให้นักเตะแต่ละคน (ซึ่งเท่ากับสร้างข้อมูลปลอม)
 * ไฟล์นี้ปั้นค่าที่เอนจินต้องใช้ขึ้นมาจาก 6 ด้านที่มีอยู่จริงล้วน ๆ
 *
 * ทุกฟังก์ชันคืนค่าในสเกลเดียวกับค่าพลังดิบ (ประมาณ 1–99)
 * ใช้ normalise() แปลงเป็น 0–1 เมื่อต้องเอาไปคูณความน่าจะเป็น
 */
import type { PlayerStats } from '@/match-engine/playerTypes';

/** ไม่มีข้อมูลค่าพลัง — ใช้ ovr เท่ากันทั้ง 6 ด้าน ไม่ใช่การสุ่มค่าปลอมรายคน */
export const statsFromOvr = (ovr: number): PlayerStats => ({
  pace: ovr,
  shooting: ovr,
  passing: ovr,
  dribbling: ovr,
  defending: ovr,
  physical: ovr,
});

/**
 * แปลงค่าพลังดิบเป็น 0–1
 *
 * ตัดล่างที่ 50 เพราะนักเตะในเกมแทบไม่มีใครต่ำกว่านั้น ถ้าเริ่มจาก 0 ความต่างระหว่างคนจะจางเกินไป
 *
 * เพดานเป็น 125 เพราะค่าพลังไม่ได้ตันที่ 99 อีกแล้ว — ด้านที่ตรงตำแหน่งดันไปได้ถึง 165
 * (ดู data/positionProfile.ts) ถ้าคงเพดาน 99 ไว้ ค่าที่ทะลุขึ้นไปจะไม่มีผลในสนามเลย
 * คนที่ตีบวกจนสุดก็จะเล่นเหมือนคนที่หยุดไว้ที่ 99 ซึ่งเป็นปัญหาเดิมที่เคยแก้มาแล้วรอบหนึ่ง
 *
 * ไม่ตั้งไว้ที่ 165 เพราะจะดึงนักเตะทั้งลีกลงมากองอยู่ครึ่งล่างของสเกล
 * เกมจะฝืดขึ้นทั้งกระดาน 125 คือจุดที่ยังให้รางวัลของที่ทะลุ 99 โดยไม่ทุบสมดุลเดิม
 */
export const normalise = (rating: number): number =>
  Math.min(Math.max((rating - 50) / 75, 0), 1);

/** ความสามารถในการยิง — shooting เป็นหลัก เสริมด้วยความนิ่งและพละกำลัง */
export const shootingRating = (stats: PlayerStats): number =>
  stats.shooting * 0.7 + stats.dribbling * 0.15 + stats.physical * 0.15;

/** ความสามารถในการเข้าสกัด — defending เป็นหลัก เสริมด้วยพละกำลังและความเร็ว */
export const defendingRating = (stats: PlayerStats): number =>
  stats.defending * 0.65 + stats.physical * 0.2 + stats.pace * 0.15;

/** ความสามารถในการรักษาบอลไว้กับตัวเมื่อโดนเข้าสกัด */
export const ballControlRating = (stats: PlayerStats): number =>
  stats.dribbling * 0.7 + stats.physical * 0.2 + stats.passing * 0.1;

/**
 * ความสามารถของผู้รักษาประตู
 *
 * การ์ด 6 ด้านไม่มีช่อง goalkeeping ค่านี้จึงปั้นจาก defending (การอ่านเกม)
 * physical (ช่วงตัวและการปัดบอล) และ pace (ปฏิกิริยา) ซึ่งเป็นค่าจริงของการ์ดใบนั้น
 * ตรงไปตรงมาแต่ยังแยกผู้รักษาประตูเก่งออกจากคนธรรมดาได้จริง
 */
export const goalkeepingRating = (stats: PlayerStats): number =>
  stats.defending * 0.4 + stats.physical * 0.3 + stats.pace * 0.3;
