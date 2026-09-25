/**
 * Every screen the app can show.
 *
 * The list is the runtime half of the type: anything reading a route out of storage
 * or admin config needs something to check it against, and a second hand-written
 * list would drift the first time a screen is added.
 */
export const ROUTE_IDS = ['home', 'draft', 'club', 'cup', 'rankup', 'transfer', 'shop', 'manager', 'missions', 'starpass', 'fusion', 'bag', 'gacha', 'redeem', 'inbox', 'special'] as const;

export type RouteId = (typeof ROUTE_IDS)[number];

export const DEFAULT_ROUTE: RouteId = 'home';

/** Player-facing names, for admin dropdowns that point at a screen. */
export const ROUTE_LABEL: Record<RouteId, string> = {
  home: 'หน้าหลัก',
  draft: 'เปิดแพ็ค',
  club: 'สโมสร',
  cup: 'ถ้วยรางวัล',
  rankup: 'ตีบวกการ์ด',
  transfer: 'การเซ็นสัญญา',
  shop: 'ร้านค้า',
  manager: 'เมเนเจอร์โหมด',
  missions: 'ภารกิจ',
  starpass: 'Star Pass',
  fusion: 'ผสมการ์ด',
  bag: 'กระเป๋า',
  gacha: 'กาชาปอง',
  redeem: 'แลกโค้ด',
  inbox: 'กล่องจดหมาย',
  special: 'การ์ดพิเศษ',
};
