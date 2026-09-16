import { useEffect, useMemo, useState, type UIEvent } from 'react';
import { Filter } from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import { syncOwned } from '@/features/club/sync';
import { formatCurrency } from '@/features/currencies/constants';
import { usePlayers } from '@/features/players/PlayerContext';
import { ratingWithPlus } from '@/features/rankup/plus';
import { OWNED_SORTS, type OwnedSort } from '@/features/transfers/constants';
import {
  EMPTY_FILTER,
  isEmptyFilter,
  matchesFilter,
  type CardFilter,
} from '@/features/transfers/filter';
import { sellBlock, sellPrice, type SellBlock } from '@/features/transfers/transfer';
import { useTransfer } from '@/features/transfers/TransferContext';
import CardFilterDialog from './CardFilterDialog';
import ConfirmDialog from './ConfirmDialog';
import OwnedCell from './OwnedCell';
import PriceTag from './PriceTag';
import SortSelect from './SortSelect';
import styles from './OwnedTab.module.css';

export interface OwnedTabProps {
  onToast(text: string): void;
}

const PAGE = 70;

const BLOCK_TEXT: Record<Exclude<SellBlock, null>, string> = {
  lineup: 'การ์ดอยู่ในไลน์อัป ขายไม่ได้',
  locked: 'การ์ดถูกล็อกไว้ ปลดล็อกก่อนขาย',
  'no-price': 'การ์ดใบนี้แลกเป็นแต้มไม่ได้',
};

/** Tab 2 — the player's own cards, picked and exchanged back for points. */
export default function OwnedTab({ onToast }: OwnedTabProps) {
  const account = useAccount();
  const { byId } = usePlayers();
  const { config, sell, toggleLock } = useTransfer();

  const [sort, setSort] = useState<OwnedSort>('ovr-asc');
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER);
  const [filtering, setFiltering] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const cards = useMemo(() => {
    return syncOwned(account.club.players, byId).map((card) => ({
      card,
      rating: ratingWithPlus(card),
      price: sellPrice(card, config),
      block: sellBlock(card, account, config),
    }));
  }, [account, byId, config]);

  const rows = useMemo(() => {
    const list = cards.filter((row) => matchesFilter(row.card, row.rating, filter));
    if (sort === 'newest') {
      return list.sort((a, b) => b.card.acquiredAt.localeCompare(a.card.acquiredAt));
    }
    const direction = sort.endsWith('desc') ? -1 : 1;
    const key = sort.startsWith('price')
      ? (row: (typeof list)[number]) => row.price
      : (row: (typeof list)[number]) => row.rating;
    return list.sort(
      (a, b) => (key(a) - key(b)) * direction || a.card.name.localeCompare(b.card.name),
    );
  }, [cards, filter, sort]);

  useEffect(() => setShown(PAGE), [sort, filter]);

  // A selection only ever holds cards that can still go: a card that was locked,
  // moved into the lineup, or sold drops out on its own.
  useEffect(() => {
    const sellable = new Set(cards.filter((row) => row.block === null).map((row) => row.card.id));
    setSelected((current) => {
      const kept = [...current].filter((id) => sellable.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [cards]);

  const total = useMemo(
    () =>
      cards.reduce((sum, row) => (selected.has(row.card.id) ? sum + row.price : sum), 0),
    [cards, selected],
  );

  function toggleSelect(id: string, block: SellBlock) {
    if (block !== null) {
      onToast(BLOCK_TEXT[block]);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function autoSelect() {
    if (selected.size > 0) {
      setSelected(new Set());
      return;
    }
    const pick = rows.filter((row) => row.block === null).map((row) => row.card.id);
    if (pick.length === 0) onToast('ไม่มีการ์ดที่ขายได้');
    setSelected(new Set(pick));
  }

  function confirmSell() {
    const result = sell([...selected]);
    setConfirming(false);
    if (result.ok) {
      setSelected(new Set());
      onToast(`ขาย ${result.sold} ใบ ได้รับ ${formatCurrency(result.earned)} แต้ม`);
    } else if (result.error === 'at-cap') {
      onToast('แต้มแลกเปลี่ยนเต็มแล้ว');
    } else {
      onToast('ขายไม่สำเร็จ');
    }
  }

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && shown < rows.length) {
      setShown((count) => count + PAGE);
    }
  }

  return (
    <div className={styles.tab}>
      <SortSelect<OwnedSort> className={styles.sort} value={sort} options={OWNED_SORTS} onChange={setSort} />

      <button
        type="button"
        className={`${styles.filter} ${isEmptyFilter(filter) ? '' : styles.filterOn}`}
        onClick={() => setFiltering(true)}
      >
        <Filter size={30} strokeWidth={2.4} />
        <span>ตัวกรอง</span>
      </button>

      <div className={styles.grid} onScroll={onScroll}>
        {rows.slice(0, shown).map((row) => (
          <OwnedCell
            key={row.card.id}
            card={row.card}
            price={row.price}
            block={row.block}
            selected={selected.has(row.card.id)}
            onToggleSelect={() => toggleSelect(row.card.id, row.block)}
            onToggleLock={() => toggleLock(row.card.id)}
          />
        ))}

        {rows.length === 0 && (
          <p className={styles.empty}>
            {cards.length === 0 ? 'ยังไม่มีนักเตะในสโมสร' : 'ไม่พบนักเตะตามตัวกรอง'}
          </p>
        )}
      </div>

      <div className={styles.actionBar}>
        <button type="button" className={styles.auto} onClick={autoSelect}>
          {selected.size > 0 ? `ยกเลิกการเลือก (${selected.size})` : 'เลือกอัตโนมัติ'}
        </button>

        <button
          type="button"
          className={`${styles.sell} ${selected.size > 0 ? styles.sellReady : ''}`}
          disabled={selected.size === 0}
          onClick={() => setConfirming(true)}
        >
          <span className={styles.sellLabel}>ขาย</span>
          <span className={styles.sellDivider} />
          <span className={styles.sellTotal}>
            <PriceTag amount={total} size={34} />
          </span>
        </button>
      </div>

      {filtering && (
        <CardFilterDialog
          title="ตัวกรอง"
          initial={filter}
          onClose={() => setFiltering(false)}
          onApply={(next) => {
            setFilter(next);
            setFiltering(false);
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="แลกการ์ดเป็นแต้ม"
          confirmLabel="ขาย"
          onClose={() => setConfirming(false)}
          onConfirm={confirmSell}
        >
          <span>ขายการ์ด {selected.size} ใบ</span>
          <PriceTag amount={total} size={44} />
          <span className={styles.warn}>การ์ดที่ขายแล้วจะหายไปจากสโมสร เรียกคืนไม่ได้</span>
        </ConfirmDialog>
      )}
    </div>
  );
}
