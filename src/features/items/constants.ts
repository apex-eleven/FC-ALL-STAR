import type { ItemDef, ItemEffect, ItemType, ItemsConfig } from './types';

export const ITEMS_CONFIG_KEY = 'football-home-ui:items:v1';

export const MAX_ITEMS = 60;
export const MAX_ITEM_COUNT = 999_999;
export const NAME_MAX = 30;
export const DESCRIPTION_MAX = 160;
export const MAX_OVR = 200;
export const MAX_BOX_AMOUNT = 100_000_000;
/** `eventId` on cards that came out of a bag item — provenance only. */
export const ITEM_EVENT_ID = 'item';
/** Item art shares the 1 MiB settings document. */
export const ITEM_IMAGE = { maxWidth: 256, maxHeight: 256, maxBytes: 30_000 };

export const ITEM_TYPES: readonly { type: ItemType; label: string }[] = [
  { type: 'avatar', label: 'รูปโปรไฟล์ (กดใช้ปลดล็อก)' },
  { type: 'shield', label: 'โล่กันดาวลด (เมเนเจอร์)' },
  { type: 'pack', label: 'ซองการ์ดสุ่ม OVR / ระดับบวก' },
  { type: 'rename', label: 'บัตรเปลี่ยนชื่อ' },
  { type: 'plus', label: 'บัตรตีบวก (เลือกนักเตะ)' },
  { type: 'box', label: 'กล่องสุ่มเงิน' },
  { type: 'pick', label: 'บัตรเลือกนักเตะ (ช่วง OVR)' },
  { type: 'premium', label: 'บัตรเปิดพรีเมียมพาส' },
];

export function itemId(prefix = 'it'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

/** A fresh effect of the given type, with sensible numbers to edit from. */
export function defaultEffect(type: ItemType): ItemEffect {
  switch (type) {
    case 'avatar':
      return { type, avatarId: '', avatarName: '' };
    case 'pack':
      return { type, ovrMin: 100, ovrMax: 120, plusMin: 0, plusMax: 3 };
    case 'plus':
      return { type, plus: 5 };
    case 'box':
      return { type, currency: 'fcpoint', min: 10, max: 100 };
    case 'pick':
      return { type, ovrMin: 110, ovrMax: 120 };
    default:
      return { type };
  }
}

function item(id: string, name: string, description: string, effect: ItemEffect): ItemDef {
  return { id, enabled: true, name, description, image: '', effect };
}

export function defaultItems(): ItemsConfig {
  return {
    items: [
      item('it-avatar', 'รูปโปรไฟล์พิเศษ', 'กดใช้เพื่อเพิ่มรูปโปรไฟล์นี้ และเปลี่ยนเป็นรูปนี้ทันที', {
        type: 'avatar',
        avatarId: '',
        avatarName: 'รูปพิเศษ',
      }),
      item('it-shield', 'โล่กันดาวลด', 'เปิดใช้ที่หน้าเมเนเจอร์โหมดก่อนแข่ง แพ้แมตช์จัดอันดับดาวไม่ลด (ใช้ 1 อันต่อการแพ้ 1 ครั้ง)', {
        type: 'shield',
      }),
      item('it-pack', 'ซองการ์ดสุ่ม', 'สุ่มการ์ดนักเตะ OVR 100–120 ระดับบวก +0 ถึง +3', {
        type: 'pack',
        ovrMin: 100,
        ovrMax: 120,
        plusMin: 0,
        plusMax: 3,
      }),
      item('it-rename', 'บัตรเปลี่ยนชื่อ', 'เปลี่ยนชื่อที่แสดงในเกม (ไอดีที่ใช้ล็อกอินยังเหมือนเดิม)', { type: 'rename' }),
      ...[5, 6, 7, 8].map((plus) =>
        item(`it-plus-${plus}`, `บัตร +${plus}`, `เลือกการ์ดนักเตะที่ต้องการให้เป็น +${plus} ทันที`, {
          type: 'plus',
          plus,
        }),
      ),
      item('it-box-fcpoint', 'กล่องสุ่ม FC POINT', 'สุ่มได้ FC Point 10–100', {
        type: 'box',
        currency: 'fcpoint',
        min: 10,
        max: 100,
      }),
      item('it-box-ticket', 'กล่องสุ่มตั๋วดราฟต์', 'สุ่มได้ตั๋วดราฟต์ 1–10 ใบ', {
        type: 'box',
        currency: 'ticket',
        min: 1,
        max: 10,
      }),
      item('it-box-exchange', 'กล่องสุ่ม Exchange Point', 'สุ่มได้แต้มแลกเปลี่ยน 1,000–10,000', {
        type: 'box',
        currency: 'exchange',
        min: 1_000,
        max: 10_000,
      }),
      item('it-pick', 'บัตรเลือกนักเตะ', 'เลือกการ์ดนักเตะ OVR 110–120 ได้ 1 ใบ', { type: 'pick', ovrMin: 110, ovrMax: 120 }),
      item('it-premium', 'บัตรเปิดพรีเมียมพาส', 'เปิดสายพิเศษของ Star Pass ซีซั่นนี้ฟรี', { type: 'premium' }),
    ],
  };
}
