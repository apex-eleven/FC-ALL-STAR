/**
 * ตัวสุ่มแบบมี seed — seed เดิมได้ผลเดิมเสมอ
 *
 * ย้ายมาจาก `@/utils/seededRandom` ของ repo เก่า เพื่อให้ match-engine ไม่ต้องพึ่งไฟล์นอกโฟลเดอร์
 * (repo ใหม่มี seeded() ของตัวเองอยู่ที่ features/league/season.ts — คนละตัว อย่าสลับกัน
 *  เพราะ seed เดิมต้องให้ผลการจำลองเดิมเป๊ะ)
 */

/** แปลงข้อความเป็นตัวเลข 32 บิต (FNV-1a) */
export const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** สร้างตัวสุ่มจาก seed (mulberry32) — คืนค่า 0 ถึง 1 เหมือน Math.random */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
