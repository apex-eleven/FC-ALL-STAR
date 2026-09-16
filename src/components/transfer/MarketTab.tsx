import { useEffect, useMemo, useState, type UIEvent } from 'react';
import { FileSignature } from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import { CLUB_CAPACITY } from '@/features/club/constants';
import { formatCurrency } from '@/features/currencies/constants';
import { cardToPlayer } from '@/features/draft/pool';
import { usePlayers } from '@/features/players/PlayerContext';
import type { PlayerCard } from '@/features/players/types';
import {
  MARKET_PAGE,
  MARKET_SORTS,
  TRANSFER_CURRENCY,
  type MarketSort,
} from '@/features/transfers/constants';
import {
  EMPTY_FILTER,
  isEmptyFilter,
  matchesFilter,
  type CardFilter,
} from '@/features/transfers/filter';
import { buyPrice, isListed, progressOf } from '@/features/transfers/transfer';
import { useTransfer } from '@/features/transfers/TransferContext';
import BrandGlyph from '@/components/ui/BrandGlyph';
import SquadCard from '@/components/club/SquadCard';
import CardFilterDialog from './CardFilterDialog';
import ConfirmDialog from './ConfirmDialog';
import MarketCell from './MarketCell';
import PriceTag from './PriceTag';
import SortSelect from './SortSelect';
import styles from './MarketTab.module.css';

export interface MarketTabProps {
  onToast(text: string): void;
}

/** Tab 1 — every listed catalogue card, bought one at a time with exchange points. */
export default function MarketTab({ onToast }: MarketTabProps) {
  const account = useAccount();
  const { players } = usePlayers();
  const { config, buy, toggleWatch } = useTransfer();

  const [sort, setSort] = useState<MarketSort>('ovr-desc');
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [watchOnly, setWatchOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [shown, setShown] = useState(MARKET_PAGE);
  const [buying, setBuying] = useState<PlayerCard | null>(null);

  const watch = progressOf(account).watch;

  const listed = useMemo(
    () =>
      players
        .filter((card) => isListed(card, config))
        .map((card) => ({ card, display: cardToPlayer(card), price: buyPrice(card, config) })),
    [players, config],
  );

  const rows = useMemo(() => {
    const watched = new Set(watch);
    const list = listed.filter(
      (row) =>
        (!watchOnly || watched.has(row.card.id)) &&
        matchesFilter(row.card, row.card.rating, filter),
    );
    const direction = sort.endsWith('desc') ? -1 : 1;
    const key = sort.startsWith('price')
      ? (row: (typeof list)[number]) => row.price
      : (row: (typeof list)[number]) => row.card.rating;
    return list.sort(
      (a, b) => (key(a) - key(b)) * direction || a.card.name.localeCompare(b.card.name),
    );
  }, [listed, watch, watchOnly, filter, sort]);

  // A new query starts from the top page again rather than keeping a long tail open.
  useEffect(() => setShown(MARKET_PAGE), [sort, filter, watchOnly]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && shown < rows.length) {
      setShown((count) => count + MARKET_PAGE);
    }
  }

  const balance = account.wallet[TRANSFER_CURRENCY];
  const buyingPrice = buying ? buyPrice(buying, config) : 0;
  const blockedReason = !buying
    ? null
    : account.club.players.length >= CLUB_CAPACITY
      ? `สโมสรเต็มแล้ว (${formatCurrency(CLUB_CAPACITY)} ใบ)`
      : balance < buyingPrice
        ? 'แต้มแลกเปลี่ยนไม่พอ'
        : null;

  function confirmBuy() {
    if (!buying) return;
    const result = buy(buying);
    setBuying(null);
    if (result.ok) onToast(`แลก ${buying.name} สำเร็จ`);
    else if (result.error === 'insufficient-funds') onToast('แต้มแลกเปลี่ยนไม่พอ');
    else if (result.error === 'club-full') onToast('สโมสรเต็มแล้ว');
    else onToast('แลกไม่สำเร็จ');
  }

  return (
    <div className={styles.tab}>
      <aside className={styles.side}>
        <BrandGlyph className={styles.sideArt} file="transfer_banner.jpg">
          <span className={styles.sideFallback}>
            <FileSignature size={150} strokeWidth={1.2} />
          </span>
        </BrandGlyph>
        <span className={styles.sideShade} />

        <div className={styles.sideText}>
          <span className={styles.totalLabel}>นักเตะทั้งหมด</span>
          <span className={styles.total}>{formatCurrency(listed.length)}</span>
        </div>

        <button
          type="button"
          className={`${styles.search} ${isEmptyFilter(filter) ? '' : styles.searchActive}`}
          onClick={() => setSearching(true)}
        >
          {isEmptyFilter(filter) ? 'ค้นหา' : `ค้นหา · พบ ${formatCurrency(rows.length)}`}
        </button>
      </aside>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <SortSelect<MarketSort> value={sort} options={MARKET_SORTS} onChange={setSort} />

          <label className={styles.watch}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={watchOnly}
              onChange={(event) => setWatchOnly(event.target.checked)}
            />
            <span className={styles.box} aria-hidden="true" />
            <span className={styles.watchText}>
              รายการติดตาม: {watch.length}/{config.watchLimit}
            </span>
          </label>
        </div>

        <div className={styles.grid} onScroll={onScroll}>
          {rows.slice(0, shown).map((row) => (
            <MarketCell
              key={row.card.id}
              card={row.display}
              price={row.price}
              watched={watch.includes(row.card.id)}
              onOpen={() => setBuying(row.card)}
              onToggleWatch={() => {
                if (!toggleWatch(row.card.id)) {
                  onToast(`รายการติดตามเต็มแล้ว (${config.watchLimit})`);
                }
              }}
            />
          ))}

          {rows.length === 0 && (
            <p className={styles.empty}>
              {watchOnly ? 'ยังไม่มีนักเตะในรายการติดตาม' : 'ไม่พบนักเตะ'}
            </p>
          )}
        </div>
      </div>

      {searching && (
        <CardFilterDialog
          title="ค้นหานักเตะ"
          initial={filter}
          onClose={() => setSearching(false)}
          onApply={(next) => {
            setFilter(next);
            setSearching(false);
          }}
        />
      )}

      {buying && (
        <ConfirmDialog
          title="เซ็นสัญญานักเตะ"
          confirmLabel="แลก"
          blockedReason={blockedReason}
          onClose={() => setBuying(null)}
          onConfirm={confirmBuy}
        >
          <SquadCard player={cardToPlayer(buying)} scale={2.6} interactive={false} />
          <span className={styles.dialogName}>{buying.name}</span>
          <PriceTag amount={buyingPrice} size={40} />
          <span className={styles.dialogBalance}>
            คงเหลือหลังแลก {formatCurrency(Math.max(0, balance - buyingPrice))}
          </span>
        </ConfirmDialog>
      )}
    </div>
  );
}
