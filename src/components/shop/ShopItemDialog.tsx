import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import { formatBaht, payOptions } from '@/features/shop/shop';
import type { ShopConfig, ShopItem, ShopPayKind, ShopReward } from '@/features/shop/types';
import styles from './ShopItemDialog.module.css';

export interface ShopItemDialogProps {
  item: ShopItem;
  config: ShopConfig;
  payout: readonly ShopReward[];
  bonusPending: boolean;
  remaining: number | null;
  onPay(kind: ShopPayKind): void;
  onClose(): void;
}

function itemName(item: ShopItem, payout: readonly ShopReward[]): string {
  if (item.title) return item.title;
  const first = payout[0];
  return first ? `${currencies[first.kind].label} x${formatCurrency(first.amount)}` : 'ไอเท็ม';
}

/**
 * The purchase step. Every in-game price the item has is its own button, so an item
 * sold for FC points *or* gems lets the player pick. A baht price cannot be taken
 * here — it shows what to send the admin and where.
 */
export default function ShopItemDialog({
  item,
  config,
  payout,
  bonusPending,
  remaining,
  onPay,
  onClose,
}: ShopItemDialogProps) {
  const account = useAccount();
  const [copied, setCopied] = useState(false);
  const options = payOptions(item);
  const soldOut = remaining !== null && remaining <= 0;
  const name = itemName(item, payout);

  const copyOrder = () => {
    const text = `ไอดี: ${account.username}\nไอเท็ม: ${name}\nราคา: ${formatBaht(item.priceBaht ?? 0)}`;
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={name}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="ปิด" />

      <div className={styles.panel}>
        <header className={styles.head}>
          <h2 className={styles.title}>{name}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="ปิด">
            <X size={24} strokeWidth={2.6} />
          </button>
        </header>

        <div className={styles.body}>
          {item.image && <img className={styles.art} src={item.image} alt="" />}

          <div className={styles.details}>
            <span className={styles.label}>ได้รับ</span>
            <ul className={styles.rewards}>
              {payout.map((reward, index) => (
                <li key={`${reward.kind}-${index}`} className={styles.reward}>
                  <img src={currencies[reward.kind].icon} alt="" />
                  <span>{currencies[reward.kind].label}</span>
                  <strong>x{formatCurrency(reward.amount)}</strong>
                  {bonusPending && index >= item.rewards.length && (
                    <em className={styles.bonus}>โบนัสซื้อครั้งแรก</em>
                  )}
                </li>
              ))}
              {payout.length === 0 && <li className={styles.muted}>ไอเท็มนี้ยังไม่ได้ตั้งของรางวัล</li>}
            </ul>

            {remaining !== null && (
              <span className={styles.muted}>
                ซื้อได้อีก {remaining} ครั้ง{item.limitPeriod === 'daily' ? ' (วันนี้)' : ''}
              </span>
            )}

            {options.length > 0 && (
              <>
                <span className={styles.label}>เลือกวิธีจ่าย</span>
                <div className={styles.payRow}>
                  {options.map((option) => {
                    const short = account.wallet[option.kind] < option.amount;
                    return (
                      <button
                        type="button"
                        key={option.kind}
                        className={styles.pay}
                        disabled={soldOut || short}
                        onClick={() => onPay(option.kind)}
                      >
                        <img src={currencies[option.kind].icon} alt="" />
                        <span>{formatCurrency(option.amount)}</span>
                        {short && !soldOut && <small className={styles.short}>ไม่พอ</small>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {item.priceBaht !== null && (
              <div className={styles.baht}>
                <span className={styles.bahtPrice}>{formatBaht(item.priceBaht)}</span>
                <p className={styles.note}>{config.contactNote}</p>
                <div className={styles.order}>
                  <span>
                    ไอดี <strong>{account.username}</strong> · {name}
                  </span>
                  <button type="button" className={styles.copy} onClick={copyOrder}>
                    {copied ? <Check size={18} strokeWidth={3} /> : <Copy size={18} strokeWidth={2.4} />}
                    {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
                {config.contactUrl ? (
                  <a
                    className={styles.contact}
                    href={config.contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {config.contactLabel || 'ติดต่อแอดมิน'}
                  </a>
                ) : (
                  <span className={styles.muted}>แอดมินยังไม่ได้ตั้งช่องทางติดต่อ</span>
                )}
              </div>
            )}

            {soldOut && <span className={styles.soldOut}>ซื้อครบตามจำนวนที่กำหนดแล้ว</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
