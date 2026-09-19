/**
 * ชนิดข้อมูลนักเตะที่ match-engine ต้องใช้
 *
 * ของเดิมอยู่ที่ `@/types/player` กับ `@/utils/helpers` ของ repo เก่า
 * ย้ายมาไว้ในโฟลเดอร์นี้เพื่อให้ match-engine เป็นก้อนอิสระ —
 * ลากทั้งโฟลเดอร์ไปวางใน repo ไหนก็ได้โดยไม่ต้องลากไฟล์อื่นตามไปด้วย
 *
 * ฝั่ง FC-ALL-STAR ใช้ `position` เป็น string อิสระ (มี LWB/CF ที่ union นี้ไม่มี)
 * ตัวแปลงอยู่ที่ features/manager/matchEngine.ts ที่เดียว ไม่ใช่ที่นี่
 */

/** ตำแหน่งในสนามทั้งหมดที่เอนจินรู้จัก */
export type Position =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'ST';

export const POSITIONS: Position[] = [
  'GK',
  'LB',
  'CB',
  'RB',
  'CDM',
  'LM',
  'CM',
  'RM',
  'CAM',
  'LW',
  'RW',
  'ST',
];

/** ค่าพลัง 6 ด้านมาตรฐาน (สเกลเดียวกับที่ ratings.ts คาดหวัง ประมาณ 50–125) */
export interface PlayerStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

/** จำพวกของนักเตะที่เอนจินใช้ตัดสินพฤติกรรม */
export const POSITION_GROUP: Record<Position, 'gk' | 'defence' | 'midfield' | 'attack'> = {
  GK: 'gk',
  CB: 'defence',
  LB: 'defence',
  RB: 'defence',
  CDM: 'midfield',
  CM: 'midfield',
  CAM: 'midfield',
  LM: 'midfield',
  RM: 'midfield',
  LW: 'attack',
  RW: 'attack',
  ST: 'attack',
};
