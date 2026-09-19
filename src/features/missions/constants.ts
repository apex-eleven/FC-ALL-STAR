import type {
  MissionChest,
  MissionConfig,
  MissionDef,
  MissionMetric,
  MissionMetricInfo,
  MissionPeriod,
  MissionReward,
} from './types';

export const MISSION_CONFIG_KEY = 'football-home-ui:missions:v1';

export const MAX_MISSIONS = 40;
export const MAX_CHESTS = 8;
export const MAX_TARGET = 100_000;
export const MAX_POINTS = 10_000;
export const TITLE_MAX = 60;
/** `eventId` on cards that came from a mission or chest — provenance only. */
export const MISSION_EVENT_ID = 'mission';
/** Bounds a hand-edited counter. */
export const MAX_COUNT = 10_000_000;

export const METRICS: readonly MissionMetricInfo[] = [
  { metric: 'login', label: 'เข้าเกม (นับวัน)', template: 'เข้าเกม {n} วัน', route: null },
  { metric: 'manager-play', label: 'เมเนเจอร์ · เล่นจบนัด', template: 'เล่นเมเนเจอร์โหมด {n} นัด', route: 'manager' },
  { metric: 'manager-win', label: 'เมเนเจอร์ · ชนะ', template: 'ชนะในเมเนเจอร์โหมด {n} นัด', route: 'manager' },
  { metric: 'manager-goal', label: 'เมเนเจอร์ · ยิงประตู', template: 'ยิงประตูในเมเนเจอร์โหมด {n} ลูก', route: 'manager' },
  { metric: 'draft-pull', label: 'สุ่มการ์ด (นับใบ)', template: 'สุ่มการ์ด {n} ครั้ง', route: 'draft' },
  { metric: 'rankup-try', label: 'ตีบวก · ครั้งที่ตี', template: 'ตีบวกการ์ด {n} ครั้ง', route: 'rankup' },
  { metric: 'rankup-success', label: 'ตีบวก · สำเร็จ', template: 'ตีบวกการ์ดสำเร็จ {n} ครั้ง', route: 'rankup' },
  { metric: 'cup-play', label: 'ถ้วย · แข่ง', template: 'แข่งฟุตบอลถ้วย {n} นัด', route: 'cup' },
  { metric: 'cup-win', label: 'ถ้วย · ผ่านเข้ารอบ', template: 'ผ่านเข้ารอบในถ้วย {n} ครั้ง', route: 'cup' },
  { metric: 'cup-goal', label: 'ถ้วย · ยิงประตู', template: 'ยิงประตูในฟุตบอลถ้วย {n} ลูก', route: 'cup' },
  { metric: 'transfer-buy', label: 'ตลาด · เซ็นสัญญานักเตะ', template: 'เซ็นสัญญานักเตะ {n} คน', route: 'transfer' },
  { metric: 'transfer-sell', label: 'ตลาด · ขายนักเตะ', template: 'ขายนักเตะ {n} คน', route: 'transfer' },
  { metric: 'shop-buy', label: 'ร้านค้า · ซื้อไอเท็ม', template: 'ซื้อไอเท็มในร้านค้า {n} ครั้ง', route: 'shop' },
];

export const METRIC_IDS: readonly MissionMetric[] = METRICS.map((entry) => entry.metric);

export function metricInfo(metric: MissionMetric): MissionMetricInfo {
  return METRICS.find((entry) => entry.metric === metric) ?? METRICS[0]!;
}

export const PERIOD_LABEL: Record<MissionPeriod, string> = {
  daily: 'รายวัน',
  weekly: 'รายสัปดาห์',
};

export function missionId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function mission(
  id: string,
  period: MissionPeriod,
  metric: MissionMetric,
  target: number,
  points: number,
  rewards: MissionReward[],
): MissionDef {
  return { id, enabled: true, period, metric, target, points, rewards, title: '' };
}

function chest(id: string, points: number, rewards: MissionReward[]): MissionChest {
  return { id, points, rewards };
}

export function defaultMissions(): MissionConfig {
  return {
    enabled: true,
    resetHour: 0,
    missions: [
      mission('d-login', 'daily', 'login', 1, 10, [{ kind: 'exchange', amount: 500 }]),
      mission('d-manager', 'daily', 'manager-play', 3, 20, [{ kind: 'exchange', amount: 1_000 }]),
      mission('d-win', 'daily', 'manager-win', 1, 20, [{ kind: 'fcpoint', amount: 20 }]),
      mission('d-draft', 'daily', 'draft-pull', 1, 20, [{ kind: 'exchange', amount: 1_000 }]),
      mission('d-rankup', 'daily', 'rankup-try', 1, 20, [{ kind: 'exchange', amount: 1_000 }]),
      mission('d-shop', 'daily', 'shop-buy', 1, 10, [{ kind: 'gem', amount: 50 }]),
      mission('d-cup', 'daily', 'cup-play', 2, 20, [{ kind: 'exchange', amount: 1_000 }]),
      mission('w-login', 'weekly', 'login', 5, 40, [{ kind: 'gem', amount: 300 }]),
      mission('w-win', 'weekly', 'manager-win', 10, 40, [{ kind: 'fcpoint', amount: 100 }]),
      mission('w-goal', 'weekly', 'manager-goal', 20, 30, [{ kind: 'exchange', amount: 5_000 }]),
      mission('w-draft', 'weekly', 'draft-pull', 20, 30, [{ kind: 'ticket', amount: 10 }]),
      mission('w-rankup', 'weekly', 'rankup-success', 3, 30, [{ kind: 'exchange', amount: 5_000 }]),
      // A cup tie is played on purpose, not on a clock like the league it replaced,
      // so the weekly target is a handful of rounds rather than a hundred.
      mission('w-cup', 'weekly', 'cup-win', 8, 30, [{ kind: 'gem', amount: 200 }]),
      mission('w-transfer', 'weekly', 'transfer-sell', 5, 20, [{ kind: 'exchange', amount: 3_000 }]),
    ],
    dailyChests: [
      chest('dc-20', 20, [{ kind: 'exchange', amount: 1_000 }]),
      chest('dc-40', 40, [{ kind: 'gem', amount: 50 }]),
      chest('dc-60', 60, [{ kind: 'exchange', amount: 2_000 }]),
      chest('dc-80', 80, [{ kind: 'ticket', amount: 2 }]),
      chest('dc-100', 100, [{ kind: 'fcpoint', amount: 50 }]),
    ],
    weeklyChests: [
      chest('wc-50', 50, [{ kind: 'exchange', amount: 5_000 }]),
      chest('wc-100', 100, [{ kind: 'gem', amount: 200 }]),
      chest('wc-150', 150, [{ kind: 'ticket', amount: 10 }]),
      chest('wc-200', 200, [{ kind: 'fcpoint', amount: 200 }]),
    ],
  };
}
