import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { currencyList } from '@/data/mock/currencies';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import { useAvatars } from '@/features/avatars/AvatarContext';
import type { CurrencyKind } from '@/features/currencies/types';
import {
  DESCRIPTION_MAX,
  ITEM_IMAGE,
  ITEM_TYPES,
  MAX_ITEMS,
  NAME_MAX,
  defaultEffect,
  itemId,
} from '@/features/items/constants';
import { countOf } from '@/features/items/inventory';
import { cardsInRange } from '@/features/items/items';
import { useItems } from '@/features/items/ItemsContext';
import type { ItemDef, ItemEffect, ItemType, ItemsConfig } from '@/features/items/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { MAX_PLUS } from '@/features/rankup/constants';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import { itemArt } from '@/components/items/itemArt';
import styles from './AdminItems.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไปแม้ย่อแล้ว ลองรูปที่เรียบกว่านี้',
  'decode-failed': 'เปิดรูปนี้ไม่ได้',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
};

const PLUS_LEVELS = Array.from({ length: MAX_PLUS }, (_, index) => index + 1);

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

function typeLabel(type: ItemType): string {
  return ITEM_TYPES.find((entry) => entry.type === type)?.label ?? type;
}

/**
 * ไอเท็ม: the item catalogue (name, art, and what each item does) and a tool to put
 * items straight into a player's bag. Items are handed out as rewards from the
 * missions and Star Pass tabs too.
 */
export default function AdminItems() {
  const { config, replace, reset, grant } = useItems();
  const { listAccounts } = useAuth();
  const { avatars } = useAvatars();
  const { players } = usePlayers();
  const latest = useRef(config);
  latest.current = config;
  const [status, setStatus] = useState<Status>(null);
  const [selectedId, setSelectedId] = useState<string | null>(config.items[0]?.id ?? null);
  const [newType, setNewType] = useState<ItemType>('box');
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [target, setTarget] = useState('');
  const [grantItemId, setGrantItemId] = useState('');
  const [grantAmount, setGrantAmount] = useState(1);

  const loadAccounts = () =>
    listAccounts().then((list) => setAccounts([...list].sort((a, b) => a.username.localeCompare(b.username))));

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listAccounts]);

  function commit(next: ItemsConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patchItem(id: string, changes: Partial<ItemDef>, text?: string) {
    commit(
      { items: latest.current.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) },
      text,
    );
  }

  function patchEffect(item: ItemDef, changes: Partial<ItemEffect>) {
    patchItem(item.id, { effect: { ...item.effect, ...changes } as ItemEffect });
  }

  function addItem() {
    const label = typeLabel(newType);
    const item: ItemDef = {
      id: itemId(),
      enabled: true,
      name: label.replace(/\s*\(.*\)$/, ''),
      description: '',
      image: '',
      effect: defaultEffect(newType),
    };
    commit({ items: [...latest.current.items, item] }, 'เพิ่มไอเท็มแล้ว');
    setSelectedId(item.id);
  }

  function removeItem(id: string) {
    const items = latest.current.items.filter((item) => item.id !== id);
    commit({ items }, 'ลบไอเท็มแล้ว');
    setSelectedId(items[0]?.id ?? null);
  }

  async function upload(item: ItemDef, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    const encoded = await encodeUploadedImage(file, ITEM_IMAGE);
    setBusy(false);
    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    patchItem(item.id, { image: encoded.dataUrl }, `แนบรูปแล้ว (${Math.round(encoded.bytes / 1000)} KB)`);
  }

  const selected = config.items.find((item) => item.id === selectedId) ?? config.items[0];
  const chosen = accounts.find((entry) => entry.username === target);
  const grantTarget = config.items.find((item) => item.id === grantItemId) ?? config.items[0];

  async function give(sign: 1 | -1) {
    if (!chosen || !grantTarget || grantAmount <= 0) return;
    const saved = await grant(chosen.username, grantTarget.id, sign * grantAmount);
    setStatus(
      saved
        ? {
            tone: 'ok',
            text:
              sign > 0
                ? `ส่ง ${grantTarget.name} x${grantAmount} ให้ ${chosen.username} แล้ว`
                : `หัก ${grantTarget.name} x${grantAmount} จาก ${chosen.username} แล้ว`,
          }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' },
    );
    await loadAccounts();
  }

  const numberField = (label: string, value: number, apply: (value: number) => void, key: string) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        inputMode="numeric"
        defaultValue={value}
        key={`${key}-${value}`}
        onBlur={(event) => apply(whole(event.target.value))}
      />
    </label>
  );

  function effectFields(item: ItemDef) {
    const effect = item.effect;
    switch (effect.type) {
      case 'avatar':
        return (
          <label className={styles.field}>
            <span className={styles.label}>รูปโปรไฟล์ที่ปลดล็อก</span>
            <select
              className={styles.input}
              value={effect.avatarId}
              onChange={(event) => patchEffect(item, { avatarId: event.target.value })}
            >
              <option value="">— เลือกรูป —</option>
              {avatars.map((avatar) => (
                <option key={avatar.id} value={avatar.id}>
                  {avatar.name} (ปกติเลเวล {avatar.requiredLevel})
                </option>
              ))}
            </select>
            {effect.avatarId && (
              <img
                className={styles.avatarThumb}
                src={avatars.find((avatar) => avatar.id === effect.avatarId)?.source}
                alt=""
              />
            )}
          </label>
        );
      case 'pack': {
        const pool = cardsInRange(players, effect.ovrMin, effect.ovrMax).length;
        return (
          <>
            <div className={styles.quad}>
              {numberField('OVR ต่ำสุด', effect.ovrMin, (value) => patchEffect(item, { ovrMin: value }), `${item.id}-omin`)}
              {numberField('OVR สูงสุด', effect.ovrMax, (value) => patchEffect(item, { ovrMax: value }), `${item.id}-omax`)}
              {numberField('บวกต่ำสุด', effect.plusMin, (value) => patchEffect(item, { plusMin: value }), `${item.id}-pmin`)}
              {numberField('บวกสูงสุด', effect.plusMax, (value) => patchEffect(item, { plusMax: value }), `${item.id}-pmax`)}
            </div>
            <p className={`${styles.legend} ${pool === 0 ? styles.warnText : ''}`}>
              การ์ดในคลังที่อยู่ในช่วงนี้ {pool} ใบ · สุ่มเท่ากันทุกใบ · ระดับบวกสูงสุด +{MAX_PLUS}
            </p>
          </>
        );
      }
      case 'plus':
        return (
          <label className={styles.field}>
            <span className={styles.label}>ตั้งการ์ดที่เลือกเป็น</span>
            <select
              className={styles.input}
              value={effect.plus}
              onChange={(event) => patchEffect(item, { plus: Number(event.target.value) })}
            >
              {PLUS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  +{level}
                </option>
              ))}
            </select>
          </label>
        );
      case 'box':
        return (
          <div className={styles.triple}>
            <label className={styles.field}>
              <span className={styles.label}>สกุลเงิน</span>
              <select
                className={styles.input}
                value={effect.currency}
                onChange={(event) => patchEffect(item, { currency: event.target.value as CurrencyKind })}
              >
                {currencyList.map((currency) => (
                  <option key={currency.kind} value={currency.kind}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
            {numberField('สุ่มต่ำสุด', effect.min, (value) => patchEffect(item, { min: value }), `${item.id}-min`)}
            {numberField('สุ่มสูงสุด', effect.max, (value) => patchEffect(item, { max: value }), `${item.id}-max`)}
          </div>
        );
      case 'pick': {
        const pool = cardsInRange(players, effect.ovrMin, effect.ovrMax).length;
        return (
          <>
            <div className={styles.pair}>
              {numberField('OVR ต่ำสุด', effect.ovrMin, (value) => patchEffect(item, { ovrMin: value }), `${item.id}-omin`)}
              {numberField('OVR สูงสุด', effect.ovrMax, (value) => patchEffect(item, { ovrMax: value }), `${item.id}-omax`)}
            </div>
            <p className={`${styles.legend} ${pool === 0 ? styles.warnText : ''}`}>
              ผู้เล่นเลือกได้จากการ์ด {pool} ใบ · ได้การ์ด +0
            </p>
          </>
        );
      }
      case 'shield':
        return (
          <p className={styles.legend}>
            ผู้เล่นเปิดสวิตช์ที่หน้าเมเนเจอร์โหมด · แพ้แมตช์จัดอันดับ (เล่นจนจบ) ดาวไม่ลดและใช้โล่ 1 อัน · ชนะ/เสมอไม่เสียโล่
          </p>
        );
      case 'rename':
        return <p className={styles.legend}>เปลี่ยนชื่อที่แสดงในเกม ไอดีที่ใช้ล็อกอินไม่เปลี่ยน</p>;
      case 'premium':
        return <p className={styles.legend}>เปิดสายพิเศษ Star Pass ของซีซั่นที่ใช้ ถ้าเปิดอยู่แล้วจะใช้ไม่ได้</p>;
      default:
        return null;
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ไอเท็มในกระเป๋า (ปุ่ม &quot;กระเป๋า&quot; แถบซ้ายหน้าหลัก) · สร้างไอเท็มที่นี่ แล้วแจกเป็นรางวัลในแท็บภารกิจ /
        Star Pass (เลือก &quot;ไอเท็ม&quot;) หรือส่งให้ผู้เล่นโดยตรงด้านล่าง · Special Point เติม/หักได้ที่แท็บเงินในเกม
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>{status.text}</span>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>รายการไอเท็ม ({config.items.length})</h3>
            <div className={styles.list}>
              {config.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.row} ${selected?.id === item.id ? styles.rowOn : ''} ${item.enabled ? '' : styles.off}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <img src={itemArt(item)} alt="" />
                  <span className={styles.rowText}>
                    <b>{item.name}</b>
                    <small>{typeLabel(item.effect.type)}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.line}>
              <select
                className={styles.input}
                value={newType}
                onChange={(event) => setNewType(event.target.value as ItemType)}
              >
                {ITEM_TYPES.map((entry) => (
                  <option key={entry.type} value={entry.type}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.ghost}
                disabled={config.items.length >= MAX_ITEMS}
                onClick={addItem}
              >
                + เพิ่มไอเท็ม
              </button>
            </div>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                if (window.confirm('รีเซ็ตรายการไอเท็มกลับเป็นค่าเริ่มต้นทั้งหมด?')) {
                  const result = reset();
                  setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
                }
              }}
            >
              รีเซ็ตทั้งหมด
            </button>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>ส่งไอเท็มให้ผู้เล่น</h3>
            <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">— เลือกผู้เล่น —</option>
              {accounts.map((entry) => (
                <option key={entry.id} value={entry.username}>
                  {entry.username}
                  {entry.displayName ? ` (${entry.displayName})` : ''}
                </option>
              ))}
            </select>
            <div className={styles.grantRow}>
              <select
                className={styles.input}
                value={grantTarget?.id ?? ''}
                onChange={(event) => setGrantItemId(event.target.value)}
              >
                {config.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                className={styles.input}
                inputMode="numeric"
                value={grantAmount}
                onChange={(event) => setGrantAmount(Math.max(1, whole(event.target.value)))}
              />
            </div>
            {chosen && grantTarget && (
              <p className={styles.legend}>
                {chosen.username} มี {grantTarget.name} อยู่ {countOf(chosen.inventory, grantTarget.id)} ชิ้น
              </p>
            )}
            <div className={styles.line}>
              <button type="button" className={styles.primary} disabled={!chosen || !grantTarget} onClick={() => void give(1)}>
                ส่งไอเท็ม
              </button>
              <button type="button" className={styles.danger} disabled={!chosen || !grantTarget} onClick={() => void give(-1)}>
                หักไอเท็ม
              </button>
            </div>
          </div>
        </div>

        <div className={styles.block}>
          {selected ? (
            <>
              <h3 className={styles.blockTitle}>แก้ไขไอเท็ม · {typeLabel(selected.effect.type)}</h3>
              <div className={styles.editorHead}>
                <span className={styles.art}>
                  <img src={itemArt(selected)} alt="" />
                </span>
                <div className={styles.stack}>
                  <div className={styles.line}>
                    <button
                      type="button"
                      className={`${styles.toggle} ${selected.enabled ? styles.toggleOn : ''}`}
                      onClick={() => patchItem(selected.id, { enabled: !selected.enabled })}
                    >
                      {selected.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </button>
                    <label className={styles.ghost}>
                      {busy ? 'กำลังแปลงรูป…' : 'อัปโหลดรูป'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={busy}
                        onChange={(event) => void upload(selected, event)}
                      />
                    </label>
                    {selected.image && (
                      <button type="button" className={styles.ghost} onClick={() => patchItem(selected.id, { image: '' })}>
                        ใช้รูปเริ่มต้น
                      </button>
                    )}
                    <button type="button" className={styles.danger} onClick={() => removeItem(selected.id)}>
                      ลบไอเท็ม
                    </button>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.label}>ชื่อ</span>
                    <input
                      className={styles.input}
                      maxLength={NAME_MAX}
                      value={selected.name}
                      onChange={(event) => patchItem(selected.id, { name: event.target.value })}
                    />
                  </label>
                </div>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>คำอธิบาย</span>
                <textarea
                  className={styles.textarea}
                  maxLength={DESCRIPTION_MAX}
                  value={selected.description}
                  onChange={(event) => patchItem(selected.id, { description: event.target.value })}
                />
              </label>
              {effectFields(selected)}
              <p className={styles.legend}>รหัสไอเท็ม {selected.id} · ปิดใช้งาน = ผู้เล่นยังเห็นในกระเป๋าแต่กดใช้ไม่ได้</p>
            </>
          ) : (
            <p className={styles.legend}>ยังไม่มีไอเท็ม</p>
          )}
        </div>
      </div>
    </div>
  );
}
