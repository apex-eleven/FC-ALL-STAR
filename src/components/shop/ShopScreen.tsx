import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/features/auth/AuthContext';
import {
  bonusPending,
  liveItems,
  payoutOf,
  progressOf,
  remainingOf,
  visibleSections,
} from '@/features/shop/shop';
import { useShop } from '@/features/shop/ShopContext';
import type { ShopItem, ShopPayKind } from '@/features/shop/types';
import ShopHeader from './ShopHeader';
import ShopItemCard from './ShopItemCard';
import ShopItemDialog from './ShopItemDialog';
import ShopSidebar from './ShopSidebar';
import ShopTabs from './ShopTabs';
import useRewardView from './useRewardView';
import styles from './ShopScreen.module.css';

const BUY_ERROR: Record<string, string> = {
  closed: 'ร้านค้าปิดอยู่',
  unavailable: 'ไอเท็มนี้หมดเวลาแล้ว',
  'limit-reached': 'ซื้อครบตามจำนวนที่กำหนดแล้ว',
  'no-such-price': 'ไอเท็มนี้ไม่ได้ขายด้วยสกุลนี้',
  'insufficient-funds': 'ยอดเงินไม่พอ',
  'at-cap': 'ยอดเงินเต็มแล้ว รับของเพิ่มไม่ได้',
  'club-full': 'คลังนักเตะเต็ม รับการ์ดเพิ่มไม่ได้',
  'card-missing': 'การ์ดในไอเท็มนี้ไม่มีแล้ว ติดต่อแอดมิน',
};

/** ร้านค้า — admin-defined tabs, category rail, and a row of item cards. */
export default function ShopScreen() {
  const account = useAccount();
  const { config, buy } = useShop();
  const view = useRewardView();
  const [now, setNow] = useState(() => new Date());
  const [sectionId, setSectionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  // Countdowns tick, and an item past its end time drops out on its own.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sections = useMemo(() => visibleSections(config), [config]);
  // Selection survives an admin edit when it can, and falls back to the first entry
  // when the tab or category it pointed at was removed.
  const section = sections.find((entry) => entry.id === sectionId) ?? sections[0];
  const category =
    section?.categories.find((entry) => entry.id === categoryId) ?? section?.categories[0];

  const progress = progressOf(account);
  const items = category ? liveItems(category, now) : [];
  const open: ShopItem | undefined = category?.items.find((item) => item.id === openId);

  function pay(item: ShopItem, kind: ShopPayKind) {
    const result = buy(item, kind);
    setOpenId(null);
    setToast({
      id: Date.now(),
      text: result.ok
        ? `ได้รับ ${result.payout.map((reward) => view(reward).text).join(', ')}`
        : (BUY_ERROR[result.error ?? ''] ?? 'ซื้อไม่สำเร็จ'),
    });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />
      <img
        className={styles.photo}
        src="/brand/shop_background.jpg?v=1"
        alt=""
        onError={(event) => {
          // Falls back to the league's stadium photo, then to the painted gradient.
          const image = event.currentTarget;
          if (image.src.includes('shop_background')) image.src = '/brand/league_background.jpg';
          else image.style.display = 'none';
        }}
      />
      <div className={styles.photoScrim} />

      <ShopHeader title="ร้านค้า" />

      {!config.enabled || !section || !category ? (
        <p className={styles.closed}>
          {config.enabled ? 'ร้านค้ายังไม่มีสินค้า' : 'ร้านค้าปิดปรับปรุงชั่วคราว'}
        </p>
      ) : (
        <>
          <ShopTabs
            sections={sections}
            activeId={section.id}
            onSelect={(id) => {
              setSectionId(id);
              setCategoryId('');
            }}
          />
          <ShopSidebar
            categories={section.categories}
            activeId={category.id}
            footerNote={config.footerNote}
            onSelect={setCategoryId}
          />

          <div className={styles.row}>
            {items.map((item) => (
              <ShopItemCard
                key={item.id}
                item={item}
                size={category.cardSize}
                now={now}
                remaining={remainingOf(item, progress, now, config)}
                bonusPending={bonusPending(item, progress)}
                onOpen={() => setOpenId(item.id)}
              />
            ))}
            {items.length === 0 && <p className={styles.empty}>ยังไม่มีสินค้าในหมวดนี้</p>}
          </div>
        </>
      )}

      {open && (
        <ShopItemDialog
          item={open}
          config={config}
          payout={payoutOf(open, progress)}
          bonusPending={bonusPending(open, progress)}
          remaining={remainingOf(open, progress, now, config)}
          onPay={(kind) => pay(open, kind)}
          onClose={() => setOpenId(null)}
        />
      )}

      {toast && (
        <div key={toast.id} className={styles.toast} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
