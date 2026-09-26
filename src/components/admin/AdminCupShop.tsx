import { ArrowDown, ArrowUp } from 'lucide-react';
import { MAX_SHOP_ITEMS, MAX_SHOP_LIMIT, MAX_SHOP_PRICE, cupId } from '@/features/cup/constants';
import type { CupConfig, CupShopItem } from '@/features/cup/types';
import type { LimitPeriod } from '@/features/shop/types';
import AdminRewardList from './AdminRewardList';
import styles from './AdminCupShop.module.css';

export interface AdminCupShopProps {
  config: CupConfig;
  apply(next: CupConfig, message?: string): void;
}

const PERIODS: { id: LimitPeriod; label: string }[] = [
  { id: 'daily', label: 'ต่อวัน' },
  { id: 'lifetime', label: 'ตลอดไป' },
];

function whole(raw: string, fallback: number, max: number): number {
  const value = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(value) ? Math.min(max, value) : fallback;
}

/**
 * ADMIN → ฟุตบอลถ้วย → ร้าน Cup Token. Items, prices in Cup Token, and limits.
 *
 * Part of the cup settings, so it saves and syncs with them. An item keeps at least
 * one reward line — the normalizer drops an item that hands over nothing, because it
 * would take tokens for nothing.
 */
export default function AdminCupShop({ config, apply }: AdminCupShopProps) {
  const { shop } = config;

  function setItems(items: CupShopItem[], message?: string) {
    apply({ ...config, shop: { ...shop, items } }, message);
  }

  function patchItem(index: number, changes: Partial<CupShopItem>) {
    setItems(shop.items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= shop.items.length) return;
    const items = [...shop.items];
    [items[index], items[target]] = [items[target]!, items[index]!];
    setItems(items);
  }

  function add() {
    if (shop.items.length >= MAX_SHOP_ITEMS) return;
    setItems(
      [
        ...shop.items,
        {
          id: cupId('cs'),
          enabled: true,
          title: 'สินค้าใหม่',
          price: 50,
          rewards: [{ kind: 'exchange', amount: 1000 }],
          limit: 1,
          limitPeriod: 'daily',
        },
      ],
      'เพิ่มสินค้าแล้ว',
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.line}>
        <span className={styles.lineLabel}>เปิดร้าน Cup Token</span>
        <button
          type="button"
          data-sound="toggle"
          aria-pressed={shop.enabled}
          className={`${styles.toggle} ${shop.enabled ? styles.toggleOn : ''}`}
          onClick={() =>
            apply({ ...config, shop: { ...shop, enabled: !shop.enabled } }, shop.enabled ? 'ปิดร้านแล้ว' : 'เปิดร้านแล้ว')
          }
        >
          {shop.enabled ? 'เปิด' : 'ปิด'}
        </button>
        <span className={styles.hint}>
          ผู้เล่นเข้าร้านจากปุ่ม Cup Token มุมขวาบนของหน้าถ้วย · จำกัดต่อวันรีเซ็ตตอน {config.resetHour}:00
          · สินค้าที่ซื้อจ่ายผ่านระบบรางวัลเดิม (การ์ดเข้าสโมสร เงินเข้ากระเป๋า)
        </span>
      </div>

      <div className={styles.items}>
        {shop.items.map((item, index) => (
          <div key={item.id} className={`${styles.item} ${item.enabled ? '' : styles.itemOff}`}>
            <div className={styles.itemHead}>
              <span className={styles.index}>#{index + 1}</span>
              <input
                className={styles.input}
                value={item.title}
                placeholder="ชื่อสินค้า"
                onChange={(event) => patchItem(index, { title: event.target.value })}
              />
              <button
                type="button"
                className={`${styles.toggle} ${item.enabled ? styles.toggleOn : ''}`}
                onClick={() => patchItem(index, { enabled: !item.enabled })}
              >
                {item.enabled ? 'ขายอยู่' : 'ซ่อน'}
              </button>
              <button type="button" className={styles.icon} onClick={() => move(index, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น">
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className={styles.icon}
                onClick={() => move(index, 1)}
                disabled={index === shop.items.length - 1}
                aria-label="เลื่อนลง"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={styles.remove}
                onClick={() => setItems(shop.items.filter((_, i) => i !== index), 'ลบสินค้าแล้ว')}
              >
                ลบ
              </button>
            </div>

            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>ราคา (Cup Token)</span>
                <input
                  className={styles.num}
                  value={item.price}
                  inputMode="numeric"
                  onChange={(event) =>
                    patchItem(index, { price: Math.max(1, whole(event.target.value, item.price, MAX_SHOP_PRICE)) })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>ซื้อได้กี่ครั้ง (0 = ไม่จำกัด)</span>
                <input
                  className={styles.num}
                  value={item.limit}
                  inputMode="numeric"
                  onChange={(event) =>
                    patchItem(index, { limit: whole(event.target.value, item.limit, MAX_SHOP_LIMIT) })
                  }
                />
              </label>
              <div className={styles.field}>
                <span className={styles.label}>นับจำกัด</span>
                <div className={styles.chips}>
                  {PERIODS.map((period) => (
                    <button
                      key={period.id}
                      type="button"
                      className={`${styles.chip} ${item.limitPeriod === period.id ? styles.chipOn : ''}`}
                      onClick={() => patchItem(index, { limitPeriod: period.id })}
                    >
                      {period.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <AdminRewardList
              rewards={item.rewards}
              min={1}
              onChange={(next) => patchItem(index, { rewards: next })}
            />
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={add} disabled={shop.items.length >= MAX_SHOP_ITEMS}>
          + เพิ่มสินค้า
        </button>
        <span className={styles.hint}>
          {shop.items.length}/{MAX_SHOP_ITEMS} รายการ
        </span>
      </div>
    </div>
  );
}
