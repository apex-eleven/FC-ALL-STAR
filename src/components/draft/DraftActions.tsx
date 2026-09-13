import { ArrowLeftRight, ShoppingCart } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useWallet } from '@/features/currencies/useWallet';
import type { DraftPack } from '@/features/draft/types';
import styles from './DraftActions.module.css';

export interface DraftActionsProps {
  packs: DraftPack[];
  onPull(pack: DraftPack): void;
  /** Buys left for this account, or null when the pack is unlimited. */
  remainingFor?(pack: DraftPack): number | null;
}

export default function DraftActions({ packs, onPull, remainingFor }: DraftActionsProps) {
  const { affords } = useWallet();

  // A pack an admin has switched off never reaches the store. Absent means visible,
  // so packs that shipped before the flag existed keep selling.
  const shown = packs.filter((pack) => pack.visible !== false);

  return (
    <>
      <div className={styles.shortcuts}>
        <button type="button" className={styles.shortcut}>
          <span className={styles.glyph}>
            <ArrowLeftRight size={34} strokeWidth={2.6} />
          </span>
          <span className={styles.shortcutLabel}>การเซ็นสัญญา</span>
        </button>
        <button type="button" className={styles.shortcut}>
          <span className={styles.glyph}>
            <ShoppingCart size={34} strokeWidth={2.6} />
          </span>
          <span className={styles.shortcutLabel}>ร้านค้า</span>
        </button>
      </div>

      <div className={styles.packs}>
        {shown.map((pack, index) => {
          const currency = currencies[pack.currency];
          const enough = affords(pack.currency, pack.cost);
          const left = remainingFor?.(pack) ?? null;
          const soldOut = left !== null && left <= 0;

          return (
            <button
              type="button"
              key={pack.id}
              // Measured widths differ by 2px between the two buttons; the first is
              // 464 and the second 466. A third pack takes the wider of the two.
              style={{ width: index === 0 ? 464 : 466 }}
              className={styles.pack}
              disabled={!enough || soldOut}
              title={soldOut ? 'ซื้อครบตามจำนวนจำกัดแล้ว' : enough ? undefined : `${currency.label}ไม่พอ`}
              onClick={() => onPull(pack)}
            >
              {pack.badge && <span className={styles.badge}>{pack.badge}</span>}

              <span className={styles.packLabel}>
                {pack.label}
                {left !== null && (
                  <span className={styles.limit}>
                    {soldOut ? 'ซื้อครบแล้ว' : `เหลืออีก ${left} ครั้ง`}
                  </span>
                )}
              </span>

              <span className={styles.divider} />

              <span className={styles.cost}>
                <img className={styles.costIcon} src={currency.icon} alt="" />
                {pack.listCost && <span className={styles.listCost}>{pack.listCost}</span>}
                {pack.cost}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
