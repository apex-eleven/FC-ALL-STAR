import type { BotAction, BotIncome, BotPersona, BotSettings, BotStats } from './types';

/** Upper bound on bots, so a slip of the bulk-create box cannot flood the ladder. */
export const MAX_BOTS = 200;
/** Bots made in one press of the create button. */
export const MAX_BULK = 30;
export const BOT_LOG_LIMIT = 15;
export const CHAT_LINES_MAX = 60;
export const CHAT_LINE_MAX_LENGTH = 120;

/** How often the runner looks for a bot that is due. One bot is played per tick. */
export const RUNNER_TICK_MS = 6_000;
/** Lease length and renewal. Long enough that renewals stay cheap on Firestore's free tier. */
export const LEASE_MS = 5 * 60_000;
export const LEASE_RENEW_MS = 2 * 60_000;
/** How long the opponent list is reused. Every fetch reads up to 100 documents. */
export const ENTRIES_TTL_MS = 30 * 60_000;
/** A bot overdue by more than this (runner was off) starts again at a random point soon. */
export const STALE_MS = 45 * 60_000;

/** What one persona does in a day. Ranges are [min, max], inclusive. */
export interface PersonaSpec {
  label: string;
  description: string;
  /** Typical online window, before each bot's own jitter. */
  hours: [number, number];
  sessionsPerDay: [number, number];
  actionsPerSession: [number, number];
  /** Seconds between two actions inside a session. */
  actionGap: [number, number];
  /** Daily caps. */
  maxPacks: number;
  maxMatches: number;
  maxRankups: number;
  maxCups: number;
  maxChats: number;
  /** Highest plus this persona will try for. */
  maxPlus: number;
  /** Relative appetite for each action when several are possible. */
  weights: Record<Exclude<BotAction, 'login' | 'claim' | 'squad' | 'idle'>, number>;
  /** Tries every formation for the best rating, instead of keeping its favourite. */
  optimiser: boolean;
  /** Chance of one chat line per session. */
  chatChance: number;
}

export const PERSONAS: Record<BotPersona, PersonaSpec> = {
  casual: {
    label: 'ขาจร',
    description: 'เข้าวันละ 2–3 รอบ ช่วงเย็น เล่นสั้น ๆ ตีบวกไม่เกิน +5',
    hours: [17, 24],
    sessionsPerDay: [1, 3],
    actionsPerSession: [2, 5],
    actionGap: [25, 140],
    maxPacks: 4,
    maxMatches: 6,
    maxRankups: 3,
    maxCups: 1,
    maxChats: 2,
    maxPlus: 5,
    weights: { pack: 3, rankup: 1, ranked: 3, cup: 1, chat: 1 },
    optimiser: false,
    chatChance: 0.12,
  },
  regular: {
    label: 'ขาประจำ',
    description: 'เข้าทุกวันหลายรอบ ลงแรงค์สม่ำเสมอ ตีบวกไม่เกิน +7',
    hours: [11, 25],
    sessionsPerDay: [3, 5],
    actionsPerSession: [3, 7],
    actionGap: [20, 110],
    maxPacks: 8,
    maxMatches: 14,
    maxRankups: 6,
    maxCups: 3,
    maxChats: 4,
    maxPlus: 7,
    weights: { pack: 3, rankup: 2, ranked: 4, cup: 2, chat: 1 },
    optimiser: true,
    chatChance: 0.2,
  },
  grinder: {
    label: 'สายฟาร์ม',
    description: 'ออนไลน์ยาวทั้งวัน ปั่นแรงค์กับถ้วยหนัก ตีบวกถึง +8',
    hours: [8, 27],
    sessionsPerDay: [5, 8],
    actionsPerSession: [4, 10],
    actionGap: [15, 80],
    maxPacks: 12,
    maxMatches: 30,
    maxRankups: 10,
    maxCups: 5,
    maxChats: 5,
    maxPlus: 8,
    weights: { pack: 2, rankup: 3, ranked: 6, cup: 3, chat: 1 },
    optimiser: true,
    chatChance: 0.22,
  },
  whale: {
    label: 'สายเปย์',
    description: 'รายได้ต่อวันสูง เปิดแพ็คหนัก ไล่ตีบวกถึง +10',
    hours: [12, 26],
    sessionsPerDay: [3, 6],
    actionsPerSession: [4, 9],
    actionGap: [15, 90],
    maxPacks: 30,
    maxMatches: 18,
    maxRankups: 16,
    maxCups: 4,
    maxChats: 4,
    maxPlus: 10,
    weights: { pack: 6, rankup: 5, ranked: 4, cup: 2, chat: 1 },
    optimiser: true,
    chatChance: 0.25,
  },
};

export const DEFAULT_INCOME: Record<BotPersona, BotIncome> = {
  casual: { ticket: 12, gem: 500, exchange: 6_000 },
  regular: { ticket: 25, gem: 1_500, exchange: 15_000, fcpoint: 50 },
  grinder: { ticket: 35, gem: 2_500, exchange: 30_000, fcpoint: 100 },
  whale: { ticket: 120, gem: 10_000, exchange: 150_000, fcpoint: 1_500 },
};

export function defaultBotSettings(): BotSettings {
  return {
    enabled: false,
    chat: true,
    chatGapMinutes: 6,
    chatLines: [
      'มีใครลงถ้วยวันนี้ยัง',
      'แรงค์วันนี้โหดจัด',
      'ทีมผม OVR {ovr} แล้ว ยังไม่พอ 555',
      'ตีบวกแตกอีกแล้ว เซ็งเลย',
      'แพ็คใหม่ใครเปิดได้ตัวดีบ้าง',
      'gg',
      'ใครมีเทคนิคจัดทีมบ้าง',
      'ฟาร์มตั๋วอยู่ ใกล้ครบแล้ว',
      'ขอให้ติดชุด A สักใบเถอะ',
      'เล่นถ้วยวันหยุดกันป่ะ',
      'แรงค์ {tier} แล้ว ใกล้ขึ้นละ',
      'ดวงวันนี้ไม่มาเลย',
      '555 แพ้ทดเจ็บอีกแล้ว',
      'กลับมาเล่นต่อแล้ว',
    ],
    pullLines: ['ได้ {card} แล้วโว้ย!!', 'เปิดได้ {card} ดีใจมาก', 'ติด {card} ในแพ็คเดียว 555', 'สุดท้ายก็ได้ {card}'],
    rankupLines: ['{card} ติด +{plus} แล้ว!!', 'ตีบวก {card} +{plus} ผ่านรอบแรก ขอบคุณดวง', 'ได้ +{plus} แล้ว ตีต่อดีไหม'],
    winLines: ['ได้แชมป์{cup}แล้ว!', 'ถ้วยนี้เป็นของเรา', 'แชมป์{cup}มาแล้วจ้า', 'ยกถ้วยแล้ว เหนื่อยมาก'],
    promoteLines: ['ขึ้น {tier} แล้วครับ', 'วันนี้ดวงดีจัด ชนะรวด', 'เลื่อนแรงค์แล้ว {tier} มาแล้ว', 'ในที่สุดก็ขึ้น {tier}'],
    oneOfOne: false,
    income: {
      casual: { ...DEFAULT_INCOME.casual },
      regular: { ...DEFAULT_INCOME.regular },
      grinder: { ...DEFAULT_INCOME.grinder },
      whale: { ...DEFAULT_INCOME.whale },
    },
  };
}

export function emptyStats(): BotStats {
  return { packs: 0, cards: 0, matches: 0, wins: 0, rankups: 0, rankupWins: 0, cups: 0, trophies: 0, chats: 0 };
}

export const ACTION_LABEL: Record<BotAction, string> = {
  login: 'เข้าเกม',
  claim: 'รับรางวัล',
  squad: 'จัดทีม',
  pack: 'เปิดการ์ด',
  rankup: 'ตีบวก',
  ranked: 'ลงแรงค์',
  cup: 'ลงถ้วย',
  chat: 'แชท',
  idle: 'พัก',
};
