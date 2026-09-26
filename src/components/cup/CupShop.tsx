import { useMemo, useState } from 'react';
import { Medal, ShoppingBag, X } from 'lucide-react';
import useRewardView from '@/components/shop/useRewardView';
import { formatCurrency } from '@/features/currencies/constants';
import { useCup } from '@/features/cup/CupContext';
import { remainingOf, shopItems } from '@/features/cup/cupShop';
import type { CupShopError, CupShopItem } from '@/features/cup/types';
import styles from './CupShop.module.css';

export interface CupShopProps {
  onClose(): void;
}

const BUY_ERROR: Record<CupShopError, string> = {
  closed: 'ร้านปิดอยู่',
  unavailable: 'สินค้านี้ไม่มีขายแล้ว',
  'limit-reached': 'ซื้อครบจำนวนแล้ว',
  'not-enough-tokens': 'Cup Token ไม่พอ',
  'club-full': 'สโมสรเต็ม — ขายหรือปล่อยการ์ดก่อน',
  'card-missing': 'การ์ดในสินค้านี้ถูกลบจากระบบ แจ้งแอดมิน',
  'at-cap': 'ยอดเงินชนเพดานแล้ว',
};

/**
 * ร้าน Cup Token — opened from the cup screen, over it.
 *
 * Every price, limit and balance on it comes from `useCup()`; the purchase itself is
 * `buyCupShopItem`, so what this draws and what a press does cannot disagree.
 */
export default function CupShop({ onClose }: CupShopProps) {
  const { config, state, buyShopItem } = useCup();
  const view = useRewardView();
  const [confirm, setConfirm] = useState<CupShopItem | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [now] = useState(() => new Date());

  const items = useMemo(() => shopItems(config), [config]);
  const tokens = state?.tokens ?? 0;

  function buy(item: CupShopItem) {
    // Closed first, so a second tap on the button has nothing left to press.
    setConfirm(null);
    const outcome = buyShopItem(item.id);
    if (!outcome.ok) {
      setToast({ tone: 'bad', text: BUY_ERROR[outcome.error ?? 'unavailable'] });
      return;
    }
    setToast({
      tone: 'ok',
      text: `ได้รับ ${outcome.paid.map((line) => view(line).text).join(' · ')}`,
    });
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="ร้าน Cup Token">
      <div className={styles.panel}>
        <header className={styles.header}>
          <ShoppingBag size={30} className={styles.headerIcon} />
          <h2 className={styles.title}>ร้าน CUP TOKEN</h2>
          <span className={styles.balance} title="Cup Token ที่มี">
            <Medal size={26} className={styles.medal} />
            {formatCurrency(tokens)}
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิดร้าน">
            <X size={22} />
          </button>
        </header>

        <p className={styles.note}>
          ได้ Cup Token จากการชนะในฟุตบอลถ้วย · จำกัดรายวันรีเซ็ตตอน {String(config.resetHour).padStart(2, '0')}:00
        </p>

        {items.length === 0 ? (
          <div className={styles.empty}>ยังไม่มีสินค้าในร้าน</div>
        ) : (
          <ul className={styles.grid}>
            {items.map((item) => {
              const left = state ? remainingOf(item, state, now, config) : null;
              const soldOut = left !== null && left <= 0;
              const short = tokens < item.price;
              const lead = item.rewards[0];
              const leadView = lead ? view(lead) : null;
              return (
                <li key={item.id} className={`${styles.card} ${soldOut ? styles.cardOut : ''}`}>
                  {item.limit > 0 && (
                    <span className={styles.limit}>
                      {item.limitPeriod === 'daily' ? 'วันนี้' : 'จำกัด'} {left ?? item.limit}/{item.limit}
                    </span>
                  )}
                  <div className={styles.art}>
                    {leadView && <img src={leadView.icon} alt="" />}
                    {leadView && <b className={styles.artCount}>{leadView.count}</b>}
                  </div>
                  <h3 className={styles.itemTitle}>{item.title || leadView?.label || 'สินค้า'}</h3>
                  <ul className={styles.lines}>
                    {item.rewards.map((line, index) => (
                      <li key={index}>{view(line).text}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`${styles.price} ${short && !soldOut ? styles.priceShort : ''}`}
                    disabled={soldOut || short}
                    onClick={() => setConfirm(item)}
                  >
                    {soldOut ? (
                      'ซื้อครบแล้ว'
                    ) : (
                      <>
                        <Medal size={20} />
                        {formatCurrency(item.price)}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {toast && (
          <button
            type="button"
            className={`${styles.toast} ${toast.tone === 'bad' ? styles.toastBad : ''}`}
            onClick={() => setToast(null)}
          >
            {toast.text}
          </button>
        )}
      </div>

      {confirm && (
        <div className={styles.confirm} role="alertdialog" aria-label="ยืนยันการซื้อ">
          <div className={styles.confirmCard}>
            <h3>ซื้อ {confirm.title || 'สินค้านี้'}?</h3>
            <ul className={styles.lines}>
              {confirm.rewards.map((line, index) => (
                <li key={index}>{view(line).text}</li>
              ))}
            </ul>
            <p className={styles.confirmPrice}>
              ใช้ <Medal size={18} className={styles.medal} /> {formatCurrency(confirm.price)} Cup Token · เหลือ{' '}
              {formatCurrency(tokens - confirm.price)}
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.cancel} onClick={() => setConfirm(null)}>
                ยกเลิก
              </button>
              <button type="button" className={styles.buy} onClick={() => buy(confirm)}>
                ซื้อ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
