import { useMemo, useState } from 'react';
import { currencyList } from '@/data/mock/currencies';
import type { CurrencyKind } from '@/features/currencies/types';
import { useItems } from '@/features/items/ItemsContext';
import { MAX_ITEM_COUNT } from '@/features/items/constants';
import { usePlayers } from '@/features/players/PlayerContext';
import { MAX_PLUS } from '@/features/rankup/constants';
import { MAX_CARD_COPIES, MAX_REWARDS } from '@/features/shop/constants';
import type { ShopReward } from '@/features/shop/types';
import useRewardView from '@/components/shop/useRewardView';
import styles from './AdminRewardList.module.css';

export interface AdminRewardListProps {
  rewards: readonly ShopReward[];
  onChange(next: ShopReward[]): void;
  /** Fewest lines the list may hold; at the floor the remove buttons are hidden. */
  min?: number;
  /** Most lines the list may hold. Defaults to the shop's own cap. */
  max?: number;
}

/** The card dropdown lists at most this many matches; search narrows it. */
const CARD_OPTIONS_MAX = 200;
/** +0 … +8, the rank-up range. */
const PLUS_LEVELS = Array.from({ length: MAX_PLUS + 1 }, (_, level) => level);

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * A reward list in the shop's shape — any currency, or catalogue cards at +0..+8 —
 * the same controls the shop tab uses, for tabs that pay rewards outside the shop.
 */
export default function AdminRewardList({
  rewards,
  onChange,
  min = 0,
  max = MAX_REWARDS,
}: AdminRewardListProps) {
  const { players } = usePlayers();
  const { config: itemsConfig } = useItems();
  const view = useRewardView();
  const [query, setQuery] = useState<Record<number, string>>({});

  const cardsByRating = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)),
    [players],
  );

  const replaceAt = (index: number, next: ShopReward) =>
    onChange(rewards.map((entry, i) => (i === index ? next : entry)));

  /** Keeps the amount when switching between currencies; a card starts at one copy. */
  function withKind(reward: ShopReward, kind: string): ShopReward {
    if (kind === 'card') {
      if (reward.kind === 'card') return reward;
      const first = cardsByRating[0];
      return first ? { kind: 'card', cardId: first.id, amount: 1, plus: 0 } : reward;
    }
    if (kind === 'item') {
      if (reward.kind === 'item') return reward;
      const first = itemsConfig.items[0];
      return first ? { kind: 'item', itemId: first.id, amount: 1 } : reward;
    }
    const amount = reward.kind === 'card' || reward.kind === 'item' ? 100 : reward.amount;
    return { kind: kind as CurrencyKind, amount };
  }

  function cardPicker(index: number, reward: Extract<ShopReward, { kind: 'card' }>) {
    const search = (query[index] ?? '').trim().toLowerCase();
    const matches = cardsByRating.filter(
      (card) =>
        card.id === reward.cardId ||
        search === '' ||
        [card.name, card.id, card.club, card.nation, card.position, String(card.rating)].some((field) =>
          field.toLowerCase().includes(search),
        ),
    );
    const selected = matches.find((card) => card.id === reward.cardId);
    const shown = matches.slice(0, CARD_OPTIONS_MAX);
    if (selected && !shown.includes(selected)) shown.unshift(selected);

    return (
      <div className={styles.cardPick}>
        <input
          className={styles.input}
          placeholder="ค้นหาการ์ด ชื่อ / OVR / ตำแหน่ง / สโมสร"
          value={query[index] ?? ''}
          onChange={(event) => setQuery((prev) => ({ ...prev, [index]: event.target.value }))}
        />
        <select
          className={styles.input}
          value={reward.cardId}
          onChange={(event) => replaceAt(index, { ...reward, cardId: event.target.value })}
        >
          {!selected && <option value={reward.cardId}>(การ์ดนี้ถูกลบแล้ว — เลือกใบใหม่)</option>}
          {shown.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name} · OVR {card.rating} · {card.position} · {card.set}
              {card.club ? ` · ${card.club}` : ''}
            </option>
          ))}
        </select>
        <select
          className={`${styles.input} ${styles.plusPick}`}
          title="ระดับบวกของการ์ดที่ได้รับ"
          value={reward.plus}
          onChange={(event) => replaceAt(index, { ...reward, plus: Number(event.target.value) })}
        >
          {PLUS_LEVELS.map((level) => (
            <option key={level} value={level}>
              +{level}
            </option>
          ))}
        </select>
        {selected && <img className={styles.cardThumb} src={view(reward).icon} alt="" />}
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {rewards.map((reward, index) => (
        <div className={styles.block} key={index}>
          <div className={styles.row}>
            <select
              className={styles.input}
              value={reward.kind}
              onChange={(event) => replaceAt(index, withKind(reward, event.target.value))}
            >
              {currencyList.map((currency) => (
                <option key={currency.kind} value={currency.kind}>
                  {currency.label}
                </option>
              ))}
              <option value="card" disabled={cardsByRating.length === 0}>
                การ์ดนักเตะ{cardsByRating.length === 0 ? ' (คลังการ์ดว่าง)' : ''}
              </option>
              <option value="item" disabled={itemsConfig.items.length === 0}>
                ไอเท็ม{itemsConfig.items.length === 0 ? ' (ยังไม่มีไอเท็ม)' : ''}
              </option>
            </select>
            <input
              className={styles.input}
              inputMode="numeric"
              title={reward.kind === 'card' ? `จำนวนใบ (สูงสุด ${MAX_CARD_COPIES})` : 'จำนวน'}
              value={reward.amount}
              onChange={(event) => {
                const amount = whole(event.target.value);
                replaceAt(
                  index,
                  reward.kind === 'card'
                    ? { ...reward, amount: Math.min(MAX_CARD_COPIES, amount) }
                    : reward.kind === 'item'
                      ? { ...reward, amount: Math.min(MAX_ITEM_COUNT, amount) }
                      : { ...reward, amount },
                );
              }}
            />
            {rewards.length > min && (
              <button
                type="button"
                className={styles.remove}
                onClick={() => onChange(rewards.filter((_, i) => i !== index))}
                aria-label="ลบรางวัล"
              >
                ✕
              </button>
            )}
          </div>
          {reward.kind === 'card' && cardPicker(index, reward)}
          {reward.kind === 'item' && (
            <select
              className={`${styles.input} ${styles.itemPick}`}
              value={reward.itemId}
              onChange={(event) => replaceAt(index, { ...reward, itemId: event.target.value })}
            >
              {!itemsConfig.items.some((item) => item.id === reward.itemId) && (
                <option value={reward.itemId}>(ไอเท็มนี้ถูกลบแล้ว — เลือกใหม่)</option>
              )}
              {itemsConfig.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.enabled ? '' : ' (ปิดอยู่)'}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      {rewards.length < max && (
        <button
          type="button"
          className={styles.add}
          onClick={() => onChange([...rewards, { kind: 'exchange', amount: 100 }])}
        >
          + รางวัล
        </button>
      )}
    </div>
  );
}
