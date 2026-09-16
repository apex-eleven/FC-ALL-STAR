import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { currencyList } from '@/data/mock/currencies';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import { formatCurrency } from '@/features/currencies/constants';
import type { CurrencyKind } from '@/features/currencies/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { MAX_PLUS } from '@/features/rankup/constants';
import {
  IMAGE_BUDGET_WARN,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_H,
  IMAGE_MAX_W,
  MAX_CARD_COPIES,
  MAX_CATEGORIES,
  MAX_ITEMS,
  MAX_REWARDS,
  MAX_SECTIONS,
  NAME_MAX,
  NOTE_MAX,
  TEXT_MAX,
  blankCategory,
  blankItem,
  blankSection,
  shopId,
} from '@/features/shop/constants';
import { formatBaht } from '@/features/shop/shop';
import { useShop } from '@/features/shop/ShopContext';
import type {
  ShopCategory,
  ShopConfig,
  ShopItem,
  ShopReward,
  ShopSection,
} from '@/features/shop/types';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import useRewardView, { type RewardView } from '@/components/shop/useRewardView';
import styles from './AdminShop.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไปแม้ย่อแล้ว ลองรูปที่เรียบกว่านี้',
  'decode-failed': 'เปิดรูปนี้ไม่ได้',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
};

const GRANT_ERROR: Record<string, string> = {
  'limit-reached': 'ไอดีนี้ซื้อครบตามจำนวนที่กำหนดแล้ว',
  'at-cap': 'ยอดเงินของไอดีนี้เต็ม รับของเพิ่มไม่ได้',
  'club-full': 'คลังนักเตะของไอดีนี้เต็ม รับการ์ดเพิ่มไม่ได้',
  'card-missing': 'การ์ดในไอเท็มนี้ถูกลบออกจากคลังการ์ดแล้ว',
  unavailable: 'หาไอดีไม่เจอหรือบันทึกไม่สำเร็จ',
};

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Blank = null ("not sold this way"). */
function wholeOrNull(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? null : Number.parseInt(digits, 10);
}

function bahtOrNull(raw: string): number | null {
  const clean = raw.replace(/[^\d.]/g, '');
  if (clean === '') return null;
  const value = Number.parseFloat(clean);
  return Number.isFinite(value) ? value : null;
}

function whole(raw: string): number {
  return wholeOrNull(raw) ?? 0;
}

function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [entry] = next.splice(index, 1);
  next.splice(target, 0, entry!);
  return next;
}

/** Shown in the reward "ได้รับ" dropdown next to the currencies. */
const CARD_OPTION_LABEL = 'การ์ดนักเตะ';
/** The card dropdown lists at most this many matches; search narrows it. */
const CARD_OPTIONS_MAX = 200;
/** +0 … +8, the rank-up range. */
const PLUS_LEVELS = Array.from({ length: MAX_PLUS + 1 }, (_, level) => level);

function itemLabel(item: ShopItem, view: (reward: ShopReward) => RewardView): string {
  if (item.title) return item.title;
  const first = item.rewards[0];
  return first ? view(first).text : '(ไม่มีชื่อ)';
}

function priceLabel(item: ShopItem): string {
  const parts: string[] = [];
  if (item.priceBaht !== null) parts.push(formatBaht(item.priceBaht));
  if (item.priceFcpoint !== null) parts.push(`FC ${formatCurrency(item.priceFcpoint)}`);
  if (item.priceGem !== null) parts.push(`เจม ${formatCurrency(item.priceGem)}`);
  return parts.join(' / ') || 'ยังไม่ตั้งราคา';
}

/**
 * The item shop, top to bottom: shop-wide settings, delivering money purchases, the
 * three levels (tab → rail category → item), and the editor for the chosen item.
 */
export default function AdminShop() {
  const { config, replace, reset, grant } = useShop();
  const { listAccounts } = useAuth();
  const { players } = usePlayers();
  const view = useRewardView();
  const label = (entry: ShopItem) => itemLabel(entry, view);
  // Search text for each card reward row, keyed by editor and row.
  const [cardQuery, setCardQuery] = useState<Record<string, string>>({});
  // Edits build on the newest config, not the one captured when a handler was
  // created — an image upload resolves after an await, by which time the render
  // that started it may be stale.
  const latest = useRef(config);
  latest.current = config;
  const [status, setStatus] = useState<Status>(null);
  const [sectionId, setSectionId] = useState(config.sections[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [itemId, setItemId] = useState('');
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [grantUser, setGrantUser] = useState('');
  const [grantItem, setGrantItem] = useState('');

  useEffect(() => {
    let cancelled = false;
    void listAccounts().then((list) => {
      if (cancelled) return;
      setAccounts([...list].sort((a, b) => a.username.localeCompare(b.username)));
    });
    return () => {
      cancelled = true;
    };
  }, [listAccounts]);

  const section = config.sections.find((entry) => entry.id === sectionId) ?? config.sections[0];
  const category =
    section?.categories.find((entry) => entry.id === categoryId) ?? section?.categories[0];
  const item = category?.items.find((entry) => entry.id === itemId) ?? null;

  const allItems = useMemo(
    () =>
      config.sections.flatMap((sec) =>
        sec.categories.flatMap((cat) =>
          cat.items.map((entry) => ({ item: entry, path: `${sec.name} › ${cat.name}` })),
        ),
      ),
    [config],
  );

  const cardsByRating = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)),
    [players],
  );

  const imageBytes = useMemo(
    () => allItems.reduce((sum, entry) => sum + Math.round(entry.item.image.length * 0.75), 0),
    [allItems],
  );

  function commit(next: ShopConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
    return result.ok;
  }

  function patchShop(changes: Partial<ShopConfig>) {
    commit({ ...latest.current, ...changes });
  }

  function mapSections(fn: (sections: ShopSection[]) => ShopSection[], text?: string) {
    commit({ ...latest.current, sections: fn(latest.current.sections) }, text);
  }

  function patchSection(id: string, changes: Partial<ShopSection>) {
    mapSections((list) => list.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
  }

  function mapCategories(fn: (categories: ShopCategory[]) => ShopCategory[], text?: string) {
    if (!section) return;
    mapSections(
      (list) =>
        list.map((entry) =>
          entry.id === section.id ? { ...entry, categories: fn(entry.categories) } : entry,
        ),
      text,
    );
  }

  function patchCategory(id: string, changes: Partial<ShopCategory>) {
    mapCategories((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
    );
  }

  function mapItems(fn: (items: ShopItem[]) => ShopItem[], text?: string) {
    if (!category) return;
    mapCategories(
      (list) =>
        list.map((entry) => (entry.id === category.id ? { ...entry, items: fn(entry.items) } : entry)),
      text,
    );
  }

  function patchItem(changes: Partial<ShopItem>) {
    if (!item) return;
    mapItems((list) => list.map((entry) => (entry.id === item.id ? { ...entry, ...changes } : entry)));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !item) return;

    setBusy(true);
    const encoded = await encodeUploadedImage(file, {
      maxWidth: IMAGE_MAX_W,
      maxHeight: IMAGE_MAX_H,
      maxBytes: IMAGE_MAX_BYTES,
    });
    setBusy(false);

    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    patchItem({ image: encoded.dataUrl });
    setStatus({ tone: 'ok', text: `แนบรูปแล้ว (${Math.round(encoded.bytes / 1000)} KB)` });
  }

  async function deliver() {
    const target = allItems.find((entry) => entry.item.id === grantItem)?.item;
    if (!grantUser || !target) return;
    setBusy(true);
    const result = await grant(grantUser, target);
    setBusy(false);
    setStatus(
      result.ok
        ? {
            tone: 'ok',
            text: `ส่ง "${label(target)}" ให้ ${grantUser} แล้ว — ${result.payout
              .map((reward) => view(reward).text)
              .join(', ')}`,
          }
        : { tone: 'bad', text: GRANT_ERROR[result.error ?? ''] ?? 'ส่งของไม่สำเร็จ' },
    );
  }

  /** Keeps the amount when switching between currencies; a card starts at one copy. */
  function withKind(reward: ShopReward, kind: string): ShopReward {
    if (kind === 'card') {
      if (reward.kind === 'card') return reward;
      const first = cardsByRating[0];
      return first ? { kind: 'card', cardId: first.id, amount: 1, plus: 0 } : reward;
    }
    const amount = reward.kind === 'card' ? 100 : reward.amount;
    return { kind: kind as CurrencyKind, amount };
  }

  function cardPicker(
    key: string,
    reward: Extract<ShopReward, { kind: 'card' }>,
    onPick: (changes: { cardId?: string; plus?: number }) => void,
  ) {
    const query = (cardQuery[key] ?? '').trim().toLowerCase();
    const matches = cardsByRating.filter(
      (card) =>
        card.id === reward.cardId ||
        query === '' ||
        [card.name, card.id, card.club, card.nation, card.position, String(card.rating)].some((field) =>
          field.toLowerCase().includes(query),
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
          value={cardQuery[key] ?? ''}
          onChange={(event) => setCardQuery((prev) => ({ ...prev, [key]: event.target.value }))}
        />
        <select
          className={styles.input}
          value={reward.cardId}
          onChange={(event) => onPick({ cardId: event.target.value })}
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
          onChange={(event) => onPick({ plus: Number(event.target.value) })}
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

  function rewardEditor(
    title: string,
    list: readonly ShopReward[],
    onChange: (next: ShopReward[]) => void,
  ) {
    const replaceAt = (index: number, next: ShopReward) =>
      onChange(list.map((entry, i) => (i === index ? next : entry)));

    return (
      <div className={styles.field}>
        <span className={styles.label}>{title}</span>
        {list.map((reward, index) => (
          <div className={styles.rewardBlock} key={index}>
            <div className={styles.rewardRow}>
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
                  {CARD_OPTION_LABEL}
                  {cardsByRating.length === 0 ? ' (คลังการ์ดว่าง)' : ''}
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
                      : { ...reward, amount },
                  );
                }}
              />
              <button
                type="button"
                className={styles.danger}
                onClick={() => onChange(list.filter((_, i) => i !== index))}
              >
                ลบ
              </button>
            </div>
            {reward.kind === 'card' &&
              cardPicker(`${title}-${index}`, reward, (changes) =>
                replaceAt(index, { ...reward, ...changes }),
              )}
          </div>
        ))}
        <button
          type="button"
          className={styles.ghost}
          disabled={list.length >= MAX_REWARDS}
          onClick={() => onChange([...list, { kind: 'fcpoint', amount: 100 }])}
        >
          + เพิ่ม
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ร้านค้า · หัวข้อหลัก = แท็บด้านบน · หัวข้อย่อย = เมนูด้านซ้าย · ไอเท็มตั้งราคาเป็นบาท แต้ม FC
        และเจมได้พร้อมกัน ผู้เล่นเลือกจ่ายเอง · ราคาบาทให้ผู้เล่นติดต่อแอดมิน แล้วส่งของจากกล่อง
        &quot;ส่งของให้ผู้เล่น&quot;
      </p>

      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      {/* ---- shop-wide ---- */}
      <div className={styles.topRow}>
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าร้านค้า</h3>
          <div className={styles.line}>
            <span className={styles.lineLabel}>เปิดร้านค้า</span>
            <button
              type="button"
              aria-pressed={config.enabled}
              className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
              onClick={() => patchShop({ enabled: !config.enabled })}
            >
              {config.enabled ? 'เปิด' : 'ปิด'}
            </button>
            <span className={styles.lineLabel}>รีเซ็ตจำกัดรายวัน</span>
            <input
              className={styles.num}
              inputMode="numeric"
              value={config.dailyResetHour}
              onChange={(event) => patchShop({ dailyResetHour: whole(event.target.value) })}
            />
            <span className={styles.unit}>นาฬิกา</span>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>ลิงก์ติดต่อแอดมิน (ซื้อด้วยเงินจริง)</span>
            <input
              className={styles.input}
              placeholder="https://line.me/…"
              maxLength={NOTE_MAX}
              value={config.contactUrl}
              onChange={(event) => patchShop({ contactUrl: event.target.value.trim() })}
            />
          </label>
          <div className={styles.pair}>
            <label className={styles.field}>
              <span className={styles.label}>ข้อความบนปุ่มติดต่อ</span>
              <input
                className={styles.input}
                maxLength={NAME_MAX}
                value={config.contactLabel}
                onChange={(event) => patchShop({ contactLabel: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>ข้อความใต้เมนูซ้าย</span>
              <input
                className={styles.input}
                maxLength={NOTE_MAX}
                value={config.footerNote}
                onChange={(event) => patchShop({ footerNote: event.target.value })}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>คำอธิบายในหน้าซื้อด้วยเงินจริง</span>
            <textarea
              className={styles.textarea}
              maxLength={NOTE_MAX}
              value={config.contactNote}
              onChange={(event) => patchShop({ contactNote: event.target.value })}
            />
          </label>
          <p className={`${styles.legend} ${imageBytes > IMAGE_BUDGET_WARN ? styles.warnText : ''}`}>
            รูปไอเท็มทั้งหมด {Math.round(imageBytes / 1000)} KB · แนะนำไม่เกิน{' '}
            {Math.round(IMAGE_BUDGET_WARN / 1000)} KB เพราะค่าตั้งทั้งเกมเก็บในเอกสารเดียวที่จำกัด 1 MB
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                if (!window.confirm('ล้างร้านค้าทั้งหมดกลับเป็นค่าเริ่มต้น?')) return;
                const result = reset();
                setStatus(
                  result.ok
                    ? { tone: 'ok', text: 'คืนค่าเริ่มต้นแล้ว' }
                    : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' },
                );
                setSectionId('');
                setCategoryId('');
                setItemId('');
              }}
            >
              คืนค่าร้านค้าเริ่มต้น
            </button>
          </div>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ส่งของให้ผู้เล่น (ซื้อด้วยเงินจริง)</h3>
          <label className={styles.field}>
            <span className={styles.label}>ไอดี</span>
            <select
              className={styles.input}
              value={grantUser}
              onChange={(event) => setGrantUser(event.target.value)}
            >
              <option value="">— เลือกไอดี —</option>
              {accounts.map((entry) => (
                <option key={entry.id} value={entry.username}>
                  {entry.username}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>ไอเท็ม</span>
            <select
              className={styles.input}
              value={grantItem}
              onChange={(event) => setGrantItem(event.target.value)}
            >
              <option value="">— เลือกไอเท็ม —</option>
              {allItems.map(({ item: entry, path }) => (
                <option key={entry.id} value={entry.id}>
                  {label(entry)} · {priceLabel(entry)} · {path}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !grantUser || !grantItem}
            onClick={() => void deliver()}
          >
            ส่งของ
          </button>
          <p className={styles.legend}>
            นับเป็นการซื้อ 1 ครั้ง — จำกัดการซื้อและโบนัสซื้อครั้งแรกคิดเหมือนผู้เล่นซื้อเอง
            ไม่หักเงินในเกม · ส่งแล้วบันทึกในประวัติเงินของไอดีนั้น
          </p>
        </div>
      </div>

      {/* ---- tree ---- */}
      <div className={styles.tree}>
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>หัวข้อหลัก (แท็บบน)</h3>
          {config.sections.map((entry, index) => (
            <div
              key={entry.id}
              className={`${styles.node} ${entry.id === section?.id ? styles.nodeOn : ''}`}
            >
              <button
                type="button"
                className={styles.pick}
                onClick={() => {
                  setSectionId(entry.id);
                  setCategoryId('');
                  setItemId('');
                }}
              >
                {entry.name || '(ไม่มีชื่อ)'} {!entry.enabled && <em>ซ่อน</em>}
              </button>
              <button type="button" className={styles.icon} onClick={() => mapSections((l) => move(l, index, -1))}>
                ↑
              </button>
              <button type="button" className={styles.icon} onClick={() => mapSections((l) => move(l, index, 1))}>
                ↓
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.ghost}
            disabled={config.sections.length >= MAX_SECTIONS}
            onClick={() => {
              const created = blankSection();
              mapSections((list) => [...list, created], 'เพิ่มหัวข้อหลักแล้ว');
              setSectionId(created.id);
              setCategoryId('');
              setItemId('');
            }}
          >
            + หัวข้อหลัก
          </button>

          {section && (
            <div className={styles.nodeEditor}>
              <input
                className={styles.input}
                maxLength={NAME_MAX}
                value={section.name}
                onChange={(event) => patchSection(section.id, { name: event.target.value })}
              />
              <div className={styles.line}>
                <span className={styles.unit}>เลขแจ้งเตือน</span>
                <input
                  className={styles.num}
                  inputMode="numeric"
                  value={section.badge}
                  onChange={(event) => patchSection(section.id, { badge: whole(event.target.value) })}
                />
                <button
                  type="button"
                  className={`${styles.toggle} ${section.enabled ? styles.toggleOn : ''}`}
                  onClick={() => patchSection(section.id, { enabled: !section.enabled })}
                >
                  {section.enabled ? 'แสดง' : 'ซ่อน'}
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    if (!window.confirm(`ลบหัวข้อ "${section.name}" และทุกอย่างข้างใน?`)) return;
                    mapSections((list) => list.filter((e) => e.id !== section.id), 'ลบหัวข้อหลักแล้ว');
                    setSectionId('');
                  }}
                >
                  ลบ
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>หัวข้อย่อย (เมนูซ้าย)</h3>
          {section?.categories.map((entry, index) => (
            <div
              key={entry.id}
              className={`${styles.node} ${entry.id === category?.id ? styles.nodeOn : ''}`}
            >
              <button
                type="button"
                className={styles.pick}
                onClick={() => {
                  setCategoryId(entry.id);
                  setItemId('');
                }}
              >
                {entry.name || '(ไม่มีชื่อ)'} <small>({entry.items.length})</small>{' '}
                {!entry.enabled && <em>ซ่อน</em>}
              </button>
              <button type="button" className={styles.icon} onClick={() => mapCategories((l) => move(l, index, -1))}>
                ↑
              </button>
              <button type="button" className={styles.icon} onClick={() => mapCategories((l) => move(l, index, 1))}>
                ↓
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.ghost}
            disabled={!section || section.categories.length >= MAX_CATEGORIES}
            onClick={() => {
              const created = blankCategory();
              mapCategories((list) => [...list, created], 'เพิ่มหัวข้อย่อยแล้ว');
              setCategoryId(created.id);
              setItemId('');
            }}
          >
            + หัวข้อย่อย
          </button>

          {category && (
            <div className={styles.nodeEditor}>
              <input
                className={styles.input}
                maxLength={NAME_MAX}
                value={category.name}
                onChange={(event) => patchCategory(category.id, { name: event.target.value })}
              />
              <div className={styles.line}>
                <button
                  type="button"
                  className={`${styles.toggle} ${category.cardSize === 'tall' ? styles.toggleOn : ''}`}
                  onClick={() =>
                    patchCategory(category.id, {
                      cardSize: category.cardSize === 'tall' ? 'regular' : 'tall',
                    })
                  }
                >
                  การ์ด{category.cardSize === 'tall' ? 'สูง' : 'ปกติ'}
                </button>
                <button
                  type="button"
                  className={`${styles.toggle} ${category.enabled ? styles.toggleOn : ''}`}
                  onClick={() => patchCategory(category.id, { enabled: !category.enabled })}
                >
                  {category.enabled ? 'แสดง' : 'ซ่อน'}
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    if (!window.confirm(`ลบหัวข้อย่อย "${category.name}" และไอเท็มข้างใน?`)) return;
                    mapCategories((list) => list.filter((e) => e.id !== category.id), 'ลบหัวข้อย่อยแล้ว');
                    setCategoryId('');
                  }}
                >
                  ลบ
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ไอเท็ม</h3>
          {category?.items.map((entry, index) => (
            <div
              key={entry.id}
              className={`${styles.node} ${entry.id === item?.id ? styles.nodeOn : ''}`}
            >
              <button type="button" className={styles.pick} onClick={() => setItemId(entry.id)}>
                {label(entry)} <small>{priceLabel(entry)}</small>{' '}
                {!entry.enabled && <em>ซ่อน</em>}
              </button>
              <button type="button" className={styles.icon} onClick={() => mapItems((l) => move(l, index, -1))}>
                ↑
              </button>
              <button type="button" className={styles.icon} onClick={() => mapItems((l) => move(l, index, 1))}>
                ↓
              </button>
            </div>
          ))}
          <div className={styles.row}>
            <button
              type="button"
              className={styles.ghost}
              disabled={!category || category.items.length >= MAX_ITEMS}
              onClick={() => {
                const created = { ...blankItem(), title: 'ไอเท็มใหม่', rewards: [{ kind: 'fcpoint' as const, amount: 100 }] };
                mapItems((list) => [...list, created], 'เพิ่มไอเท็มแล้ว');
                setItemId(created.id);
              }}
            >
              + ไอเท็ม
            </button>
            <button
              type="button"
              className={styles.ghost}
              disabled={!item || !category || category.items.length >= MAX_ITEMS}
              onClick={() => {
                if (!item) return;
                const copy = { ...item, id: shopId('it') };
                mapItems((list) => [...list, copy], 'คัดลอกไอเท็มแล้ว');
                setItemId(copy.id);
              }}
            >
              คัดลอก
            </button>
          </div>
        </div>
      </div>

      {/* ---- item editor ---- */}
      {item && (
        <div className={`${styles.block} ${styles.editor}`}>
          <h3 className={styles.blockTitle}>แก้ไขไอเท็ม · {label(item)}</h3>

          <div className={styles.editorGrid}>
            <div className={styles.artCol}>
              <div className={styles.artSlot}>
                {item.image ? <img src={item.image} alt="" /> : <span>ยังไม่มีรูป</span>}
              </div>
              <label className={styles.ghost}>
                {busy ? 'กำลังแปลงรูป…' : 'อัปโหลดรูป'}
                <input type="file" accept="image/*" hidden disabled={busy} onChange={uploadImage} />
              </label>
              <button
                type="button"
                className={styles.ghost}
                disabled={!item.image}
                onClick={() => patchItem({ image: '' })}
              >
                เอารูปออก
              </button>
              <p className={styles.legend}>
                รูปการ์ดสูง ~{IMAGE_MAX_W}x{IMAGE_MAX_H} · ย่อให้อัตโนมัติ ไม่เกิน{' '}
                {Math.round(IMAGE_MAX_BYTES / 1000)} KB
              </p>
            </div>

            <div className={styles.fieldsCol}>
              <div className={styles.pair}>
                <label className={styles.field}>
                  <span className={styles.label}>ชื่อบนการ์ด</span>
                  <input
                    className={styles.input}
                    maxLength={TEXT_MAX}
                    value={item.title}
                    onChange={(event) => patchItem({ title: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ข้อความรอง</span>
                  <input
                    className={styles.input}
                    maxLength={TEXT_MAX}
                    value={item.subtitle}
                    placeholder="เช่น โบนัสซื้อครั้งแรก"
                    onChange={(event) => patchItem({ subtitle: event.target.value })}
                  />
                </label>
              </div>

              <div className={styles.triple}>
                <label className={styles.field}>
                  <span className={styles.label}>ราคา ฿ (เงินจริง)</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    placeholder="ว่าง = ไม่ขาย"
                    value={item.priceBaht ?? ''}
                    onChange={(event) => patchItem({ priceBaht: bahtOrNull(event.target.value) })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ราคา FC POINT</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    placeholder="ว่าง = ไม่ขาย"
                    value={item.priceFcpoint ?? ''}
                    onChange={(event) => patchItem({ priceFcpoint: wholeOrNull(event.target.value) })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ราคา GEM</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    placeholder="ว่าง = ไม่ขาย"
                    value={item.priceGem ?? ''}
                    onChange={(event) => patchItem({ priceGem: wholeOrNull(event.target.value) })}
                  />
                </label>
              </div>

              <div className={styles.line}>
                <span className={styles.unit}>แสดงราคาแบบ</span>
                <button
                  type="button"
                  className={`${styles.toggle} ${item.priceStyle === 'band' ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ priceStyle: 'band' })}
                >
                  แถบเข้ม
                </button>
                <button
                  type="button"
                  className={`${styles.toggle} ${item.priceStyle === 'button' ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ priceStyle: 'button' })}
                >
                  ปุ่มเขียว
                </button>
                <button
                  type="button"
                  className={`${styles.toggle} ${item.enabled ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ enabled: !item.enabled })}
                >
                  {item.enabled ? 'วางขาย' : 'ซ่อน'}
                </button>
              </div>

              <div className={styles.pair}>
                {rewardEditor('ได้รับ', item.rewards, (next) => patchItem({ rewards: next }))}
                {rewardEditor('โบนัสซื้อครั้งแรก', item.firstBonus, (next) =>
                  patchItem({ firstBonus: next }),
                )}
              </div>
              <div className={styles.line}>
                <button
                  type="button"
                  className={`${styles.toggle} ${item.showRewards ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ showRewards: !item.showRewards })}
                >
                  แสดงของที่ได้บนการ์ด (+ BONUS)
                </button>
              </div>

              <div className={styles.line}>
                <span className={styles.unit}>จำกัดการซื้อ</span>
                <input
                  className={styles.num}
                  inputMode="numeric"
                  value={item.limit}
                  onChange={(event) => patchItem({ limit: whole(event.target.value) })}
                />
                <button
                  type="button"
                  className={`${styles.toggle} ${item.limitPeriod === 'lifetime' ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ limitPeriod: 'lifetime' })}
                >
                  ตลอดไป
                </button>
                <button
                  type="button"
                  className={`${styles.toggle} ${item.limitPeriod === 'daily' ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ limitPeriod: 'daily' })}
                >
                  ต่อวัน
                </button>
                <button
                  type="button"
                  className={`${styles.toggle} ${item.showLimit ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ showLimit: !item.showLimit })}
                >
                  แสดงบนการ์ด
                </button>
                <span className={styles.unit}>0 = ไม่จำกัด</span>
              </div>

              <div className={styles.line}>
                <span className={styles.unit}>ป้าย VALUE %</span>
                <input
                  className={styles.num}
                  inputMode="numeric"
                  value={item.valuePercent}
                  onChange={(event) => patchItem({ valuePercent: whole(event.target.value) })}
                />
                <span className={styles.unit}>ตัวเลขแถบนิ้วโป้ง</span>
                <input
                  className={styles.num}
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(event) => patchItem({ quantity: whole(event.target.value) })}
                />
                <span className={styles.unit}>0 = ไม่แสดง</span>
              </div>

              <div className={styles.line}>
                <span className={styles.unit}>เริ่มขาย</span>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={toLocalInput(item.startAt)}
                  onChange={(event) => patchItem({ startAt: fromLocalInput(event.target.value) })}
                />
                <span className={styles.unit}>หมดอายุ</span>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={toLocalInput(item.endAt)}
                  onChange={(event) => patchItem({ endAt: fromLocalInput(event.target.value) })}
                />
                <button
                  type="button"
                  className={`${styles.toggle} ${item.showCountdown ? styles.toggleOn : ''}`}
                  onClick={() => patchItem({ showCountdown: !item.showCountdown })}
                >
                  นับถอยหลัง
                </button>
              </div>

              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => {
                    if (!window.confirm(`ลบไอเท็ม "${label(item)}"?`)) return;
                    mapItems((list) => list.filter((e) => e.id !== item.id), 'ลบไอเท็มแล้ว');
                    setItemId('');
                  }}
                >
                  ลบไอเท็ม
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
