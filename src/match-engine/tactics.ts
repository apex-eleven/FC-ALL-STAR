/**
 * ระบบแทคติก
 *
 * ตั้งใจทำเป็น "ชั้นตัวคูณ" ไม่ใช่การเขียน AI ใหม่:
 *
 *   Base Formation → Tactical Modifier → Player Target → Movement
 *
 * MatchEngine ไม่มี if (mentality === 'ATTACKING') กระจายอยู่ทั่วไฟล์
 * มีแต่การอ่านค่าตัวคูณจากที่นี่ที่เดียว แล้วเอาไปคูณกับพฤติกรรมเดิมของ PHASE 1–3
 * เพิ่มแทคติกใหม่ในอนาคตจึงแก้แค่ไฟล์นี้
 *
 * ตัวคูณถูกคำนวณครั้งเดียวตอนตั้งแทคติก (MatchEngine เก็บผลไว้) ไม่ได้คิดใหม่ทุก tick
 */

export type Mentality = 'DEFENSIVE' | 'BALANCED' | 'ATTACKING';
export type Tempo = 'SLOW' | 'NORMAL' | 'FAST';
export type Width = 'NARROW' | 'NORMAL' | 'WIDE';
export type Pressing = 'LOW' | 'NORMAL' | 'HIGH';
export type DefensiveLine = 'DEEP' | 'NORMAL' | 'HIGH';

/** แทคติกหนึ่งชุดของทีมหนึ่งทีม */
export interface Tactics {
  mentality: Mentality;
  tempo: Tempo;
  width: Width;
  pressing: Pressing;
  defensiveLine: DefensiveLine;
}

/** ค่าเริ่มต้น — ตรงกับพฤติกรรมของ PHASE 1–3 ทุกประการ (ตัวคูณเป็นกลางหมด) */
export const DEFAULT_TACTICS: Tactics = {
  mentality: 'BALANCED',
  tempo: 'NORMAL',
  width: 'NORMAL',
  pressing: 'NORMAL',
  defensiveLine: 'NORMAL',
};

/** ตัวคูณที่เอนจินเอาไปใช้จริง */
export interface TacticalModifiers {
  /** เมตรที่ทั้งบล็อกเลื่อนขึ้น (+) หรือถอยลง (−) จากแนวปกติ */
  lineOffset: number;
  /** ตัวคูณโบนัสการเติมเกมรุก (mentality) */
  attackBias: number;
  /** เมตรที่ตัวริมเส้นถ่างออกจากขอบสนาม (− = ชิดเส้นมากขึ้น) */
  widthOffset: number;
  /** ตัวคูณระยะที่ตัวสนับสนุนยืนห่างคนถือบอล */
  supportDistance: number;
  /** ตัวคูณความเร็วในการตัดสินใจ (tempo) — สูง = คิดเร็ว ส่งบอลถี่ */
  decisionSpeed: number;
  /** ตัวคูณระยะที่ยอมออกจากเขตไปไล่บอล/กดดัน */
  pressRange: number;
  /** ตัวคูณความถี่ในการเข้าสกัด */
  tackleTendency: number;
  /** ตัวคูณความอยากยิง */
  shotBias: number;
}

/** ตัวคูณกลาง — ไม่มีแทคติกก็ได้ค่านี้ พฤติกรรมเท่ากับก่อน PHASE 4 เป๊ะ */
export const NEUTRAL_MODIFIERS: TacticalModifiers = {
  lineOffset: 0,
  attackBias: 1,
  widthOffset: 0,
  supportDistance: 1,
  decisionSpeed: 1,
  pressRange: 1,
  tackleTendency: 1,
  shotBias: 1,
};

const MENTALITY: Record<Mentality, Partial<TacticalModifiers>> = {
  // ตั้งรับ: ทั้งบล็อกถอยลง เติมเกมรุกน้อยลง ยิงน้อยลง ตัวสนับสนุนยืนใกล้กันไว้
  DEFENSIVE: { lineOffset: -6, attackBias: 0.55, shotBias: 0.55, supportDistance: 0.85 },
  BALANCED: {},
  // บุก: ดันขึ้นสูง เติมเกมรุกมากขึ้น ยิงบ่อยขึ้น — แลกกับพื้นที่หลังแนวรับ
  ATTACKING: { lineOffset: 6, attackBias: 1.5, shotBias: 1.5, supportDistance: 1.15 },
};

const TEMPO: Record<Tempo, Partial<TacticalModifiers>> = {
  // ช้า: ถือบอลนานขึ้น ส่งบอลถี่น้อยลง
  SLOW: { decisionSpeed: 0.65 },
  NORMAL: {},
  // เร็ว: ตัดสินใจไว ส่งบอลถี่
  FAST: { decisionSpeed: 1.55 },
};

const WIDTH: Record<Width, Partial<TacticalModifiers>> = {
  // แคบ: ตัวริมเส้นหุบเข้ามาเล่นในกรอบ ตัวสนับสนุนยืนชิดกัน
  NARROW: { widthOffset: 9, supportDistance: 0.85 },
  NORMAL: {},
  // กว้าง: ตัวริมเส้นถ่างไปติดเส้นข้าง ยืดสนามออก
  WIDE: { widthOffset: -4, supportDistance: 1.2 },
};

const PRESSING: Record<Pressing, Partial<TacticalModifiers>> = {
  // กดดันต่ำ: ตั้งรับรอ ไม่ตามออกไปไกล เข้าสกัดน้อย
  LOW: { pressRange: 0.7, tackleTendency: 0.55 },
  NORMAL: {},
  // กดดันสูง: ไล่ไกลขึ้น เข้าสกัดถี่ขึ้น
  HIGH: { pressRange: 1.35, tackleTendency: 1.6 },
};

const DEFENSIVE_LINE: Record<DefensiveLine, Partial<TacticalModifiers>> = {
  DEEP: { lineOffset: -7 },
  NORMAL: {},
  HIGH: { lineOffset: 7 },
};

/**
 * รวมตัวคูณจากทุกหมวด
 *
 * lineOffset บวกกัน (mentality กับ defensiveLine ส่งผลทางเดียวกัน)
 * ที่เหลือคูณกัน (เป็นสัดส่วน)
 */
export const tacticalModifiers = (tactics: Tactics): TacticalModifiers => {
  const parts = [
    MENTALITY[tactics.mentality],
    TEMPO[tactics.tempo],
    WIDTH[tactics.width],
    PRESSING[tactics.pressing],
    DEFENSIVE_LINE[tactics.defensiveLine],
  ];

  return parts.reduce<TacticalModifiers>(
    (total, part) => ({
      lineOffset: total.lineOffset + (part.lineOffset ?? 0),
      widthOffset: total.widthOffset + (part.widthOffset ?? 0),
      attackBias: total.attackBias * (part.attackBias ?? 1),
      supportDistance: total.supportDistance * (part.supportDistance ?? 1),
      decisionSpeed: total.decisionSpeed * (part.decisionSpeed ?? 1),
      pressRange: total.pressRange * (part.pressRange ?? 1),
      tackleTendency: total.tackleTendency * (part.tackleTendency ?? 1),
      shotBias: total.shotBias * (part.shotBias ?? 1),
    }),
    { ...NEUTRAL_MODIFIERS },
  );
};

/** ตรวจว่าค่าที่มาจากข้างนอก (เช่นโปรไฟล์ที่บันทึกไว้) ใช้ได้จริง ไม่งั้นถอยไปใช้ค่าเริ่มต้น */
export const normaliseTactics = (input: Partial<Tactics> | null | undefined): Tactics => ({
  mentality: MENTALITY[input?.mentality as Mentality]
    ? (input?.mentality as Mentality)
    : DEFAULT_TACTICS.mentality,
  tempo: TEMPO[input?.tempo as Tempo] ? (input?.tempo as Tempo) : DEFAULT_TACTICS.tempo,
  width: WIDTH[input?.width as Width] ? (input?.width as Width) : DEFAULT_TACTICS.width,
  pressing: PRESSING[input?.pressing as Pressing]
    ? (input?.pressing as Pressing)
    : DEFAULT_TACTICS.pressing,
  defensiveLine: DEFENSIVE_LINE[input?.defensiveLine as DefensiveLine]
    ? (input?.defensiveLine as DefensiveLine)
    : DEFAULT_TACTICS.defensiveLine,
});
