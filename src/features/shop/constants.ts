import type { CurrencyKind } from '@/features/currencies/types';
import type { ShopCategory, ShopConfig, ShopItem, ShopSection } from './types';

export const SHOP_CONFIG_KEY = 'football-home-ui:shop:v1';

export const MAX_SECTIONS = 8;
export const MAX_CATEGORIES = 16;
export const MAX_ITEMS = 40;
export const MAX_REWARDS = 6;
/** Copies of one card a single reward line can give. */
export const MAX_CARD_COPIES = 10;
/** `eventId` on cards that came from the shop — provenance only. */
export const SHOP_EVENT_ID = 'shop';
export const MAX_PRICE = 100_000_000;
export const MAX_BAHT = 1_000_000;
export const NAME_MAX = 40;
export const TEXT_MAX = 120;
export const NOTE_MAX = 300;

/**
 * Item art budget. Every image lives inside the one shared settings document, which
 * Firestore caps at 1 MiB for *everything* — so each card is kept small, and the
 * admin tab shows the running total.
 */
export const IMAGE_MAX_W = 380;
export const IMAGE_MAX_H = 720;
export const IMAGE_MAX_BYTES = 45_000;
export const IMAGE_BUDGET_WARN = 450_000;

export function shopId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function blankItem(id = shopId('it')): ShopItem {
  return {
    id,
    enabled: true,
    title: '',
    subtitle: '',
    image: '',
    priceBaht: null,
    priceFcpoint: null,
    priceGem: null,
    priceStyle: 'band',
    rewards: [],
    firstBonus: [],
    showRewards: false,
    limit: 0,
    limitPeriod: 'lifetime',
    showLimit: true,
    valuePercent: 0,
    quantity: 0,
    startAt: '',
    endAt: '',
    showCountdown: true,
  };
}

export function blankCategory(id = shopId('cat')): ShopCategory {
  return { id, name: 'หมวดใหม่', enabled: true, dot: false, cardSize: 'regular', items: [] };
}

export function blankSection(id = shopId('sec')): ShopSection {
  return { id, name: 'หัวข้อใหม่', enabled: true, badge: 0, categories: [blankCategory()] };
}

const reward = (kind: CurrencyKind, amount: number) => ({ kind, amount });

function category(
  id: string,
  name: string,
  items: ShopItem[] = [],
  extra: Partial<ShopCategory> = {},
): ShopCategory {
  return { ...blankCategory(id), name, items, ...extra };
}

/**
 * What a fresh install shows: the reference's tabs and rail, with a few items to
 * show each card style. No art ships — every card draws its own until the admin
 * uploads one.
 */
export function defaultShop(): ShopConfig {
  return {
    enabled: true,
    dailyResetHour: 6,
    contactUrl: '',
    contactLabel: 'ติดต่อแอดมิน',
    contactNote: 'ไอเท็มนี้ซื้อด้วยเงินจริง แจ้งไอดีและชื่อไอเท็มกับแอดมิน แอดมินจะส่งของให้ในเกม',
    footerNote: 'การซื้อไอเท็มในร้านค้าเป็นไปตามข้อตกลงการใช้งานของเกม',
    sections: [
      {
        id: 'sec-featured',
        name: 'แนะนำ',
        enabled: true,
        badge: 1,
        categories: [
          category(
            'cat-hot',
            'ของเด็ดใน FC',
            [
              {
                ...blankItem('it-ticket-10'),
                quantity: 10,
                valuePercent: 200,
                priceBaht: 349,
                rewards: [reward('ticket', 10)],
              },
              {
                ...blankItem('it-ticket-1'),
                valuePercent: 200,
                priceFcpoint: 100,
                priceGem: 2_000,
                rewards: [reward('ticket', 1)],
              },
              {
                ...blankItem('it-ticket-15'),
                quantity: 15,
                valuePercent: 167,
                priceFcpoint: 1_800,
                rewards: [reward('ticket', 15)],
              },
            ],
            { cardSize: 'tall' },
          ),
          category('cat-highlight', 'ไฮไลต์'),
          category('cat-deluxe', 'DELUXE'),
          category('cat-monthly', 'ต่อเนื่องรายเดือน'),
          category('cat-pass', 'บัตรรายเดือน'),
          category('cat-best', 'ขายดีที่สุด', [
            {
              ...blankItem('it-starter'),
              title: 'แพ็กเริ่มต้น',
              limit: 1,
              valuePercent: 500,
              priceBaht: 15,
              rewards: [reward('ticket', 1), reward('exchange', 1_000)],
            },
          ]),
          category('cat-resources', 'ทรัพยากร'),
        ],
      },
      {
        id: 'sec-points',
        name: 'แต้ม FC และอัญมณี',
        enabled: true,
        badge: 1,
        categories: [
          category('cat-double', 'เติม 2 เท่า', [
            {
              ...blankItem('it-fc-10000'),
              title: '10,000 แต้ม FC',
              subtitle: 'โบนัสซื้อครั้งแรก',
              priceBaht: 1_800,
              priceStyle: 'button',
              rewards: [reward('fcpoint', 5_000)],
              firstBonus: [reward('fcpoint', 5_000)],
              showRewards: true,
            },
            {
              ...blankItem('it-fc-20000'),
              title: '20,000 แต้ม FC',
              subtitle: 'โบนัสซื้อครั้งแรก',
              priceBaht: 3_700,
              priceStyle: 'button',
              rewards: [reward('fcpoint', 10_000)],
              firstBonus: [reward('fcpoint', 10_000)],
              showRewards: true,
            },
          ]),
          category('cat-daily', 'ข้อเสนอ FP ประจำวัน'),
          category('cat-fc', 'แต้ม FC'),
          category('cat-gem', 'อัญมณี'),
        ],
      },
      {
        id: 'sec-exchange',
        name: 'แลกเปลี่ยน',
        enabled: true,
        badge: 0,
        categories: [category('cat-exchange', 'แลกเปลี่ยน')],
      },
      {
        id: 'sec-cash',
        name: 'เงิน',
        enabled: true,
        badge: 0,
        categories: [category('cat-cash', 'เงิน')],
      },
    ],
  };
}
