import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  ICON_IMAGE,
  MAX_DRAWS,
  MAX_MATERIALS,
  MAX_PRIZES,
  MIN_DRAWS,
  MIN_MATERIALS,
  NAME_MAX,
  RARITY_LABEL,
  fusionId,
} from '@/features/fusion/constants';
import { chanceTotal, percentOf } from '@/features/fusion/fusion';
import { useFusion } from '@/features/fusion/FusionContext';
import {
  FUSION_RARITIES,
  type FusionConfig,
  type FusionPrize,
  type FusionRarity,
} from '@/features/fusion/types';
import { usePlayers } from '@/features/players/PlayerContext';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import AdminRewardList from './AdminRewardList';
import styles from './AdminFusion.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไปแม้ย่อแล้ว ลองรูปที่เรียบกว่านี้',
  'decode-failed': 'เปิดรูปนี้ไม่ได้',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
};

/** The picker lists at most this many matches; the search box narrows it. */
const CARD_OPTIONS_MAX = 120;

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * ผสมการ์ด settings: what a fusion eats, how many cards it deals, which catalogue
 * cards are locked out, and every prize with its chance.
 *
 * Chances are relative weights rather than percentages that must total 100 — the
 * real odds sit beside each row, so a list adding to 137 still reads honestly
 * instead of being quietly rescaled. Same rule as the gachapon's table.
 *
 * The two card lists do different jobs and are deliberately kept apart:
 * `materialIds` is what a player may feed in, `lockedIds` is what the bench may
 * never hand back out.
 */
export default function AdminFusion() {
  const { config, replace, reset } = useFusion();
  const { players } = usePlayers();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [materialQuery, setMaterialQuery] = useState('');
  const [lockQuery, setLockQuery] = useState('');
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  const byRating = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)),
    [players],
  );

  function commit(next: FusionConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<FusionConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchPrize(id: string, changes: Partial<FusionPrize>) {
    patch({
      prizes: latest.current.prizes.map((prize) =>
        prize.id === id ? { ...prize, ...changes } : prize,
      ),
    });
  }

  function addPrize() {
    const prize: FusionPrize = {
      id: fusionId(),
      enabled: true,
      name: '',
      reward: { kind: 'exchange', amount: 1_000 },
      chance: 10,
      rarity: 'common',
      announce: false,
    };
    patch({ prizes: [...latest.current.prizes, prize] }, 'เพิ่มรางวัลแล้ว');
  }

  function toggleId(field: 'materialIds' | 'lockedIds', cardId: string) {
    const current = latest.current[field];
    const next = current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : [...current, cardId];
    patch({ [field]: next } as Partial<FusionConfig>);
  }

  async function uploadIcon(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    const encoded = await encodeUploadedImage(file, ICON_IMAGE);
    setBusy(false);
    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    patch({ icon: encoded.dataUrl }, `เปลี่ยนไอคอนแล้ว (${Math.round(encoded.bytes / 1000)} KB)`);
  }

  const total = chanceTotal(config);
  const live = config.prizes.filter((prize) => prize.enabled && prize.chance > 0).length;

  const textField = (label: string, value: string, apply: (value: string) => void) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        maxLength={NAME_MAX}
        value={value}
        onChange={(event) => apply(event.target.value)}
      />
    </label>
  );

  const numberField = (
    label: string,
    value: number,
    min: number,
    max: number,
    apply: (value: number) => void,
  ) => (
    <label className={styles.field}>
      <span className={styles.label}>
        {label} ({min}–{max})
      </span>
      <input
        className={styles.input}
        inputMode="numeric"
        value={String(value)}
        onChange={(event) => apply(Math.max(min, Math.min(max, whole(event.target.value))))}
      />
    </label>
  );

  /** One card list. `empty` says what an empty list means, which differs per field. */
  const cardPicker = (
    field: 'materialIds' | 'lockedIds',
    query: string,
    setQuery: (value: string) => void,
    empty: string,
  ) => {
    const chosen = config[field];
    const needle = query.trim().toLowerCase();
    const matches = byRating
      .filter((card) => needle === '' || card.name.toLowerCase().includes(needle))
      .slice(0, CARD_OPTIONS_MAX);

    return (
      <>
        <p className={styles.hint}>{chosen.length === 0 ? empty : `เลือกไว้ ${chosen.length} ใบ`}</p>
        <input
          className={styles.input}
          placeholder="ค้นหาชื่อนักเตะ"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {chosen.length > 0 && (
          <button type="button" className={styles.clear} onClick={() => patch({ [field]: [] } as Partial<FusionConfig>)}>
            ล้างทั้งหมด
          </button>
        )}
        <div className={styles.picker}>
          {matches.map((card) => {
            const on = chosen.includes(card.id);
            return (
              <button
                type="button"
                key={card.id}
                className={`${styles.pick} ${on ? styles.pickOn : ''}`}
                onClick={() => toggleId(field, card.id)}
              >
                {card.name} · {card.rating}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ผสมการ์ด (ปุ่มใต้ STAR PASS แถบซ้ายหน้าหลัก) · ผู้เล่นเอาการ์ดในสโมสรมาเผาตามจำนวนที่ตั้งไว้
        แล้วระบบแจกการ์ดคว่ำหน้าให้เลือกเก็บได้ใบเดียว · รางวัลเป็นอะไรก็ได้ที่เกมมี: สกุลเงิน
        ไอเท็มในกระเป๋า หรือการ์ดนักเตะพร้อมระดับ +0 ถึง +8 · การ์ดที่ผู้เล่นกดล็อคไว้เอง
        (ล็อคเดียวกับที่กันขาย) จะไม่ถูกใช้เป็นวัตถุดิบ
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.columns}>
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
          <button
            type="button"
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() => patch({ enabled: !config.enabled })}
          >
            {config.enabled ? 'เปิดใช้งานอยู่' : 'ปิดอยู่'}
          </button>

          {textField('ชื่อหน้าจอ', config.title, (value) => patch({ title: value }))}
          {textField('คำอธิบายใต้ชื่อ', config.subtitle, (value) => patch({ subtitle: value }))}
          {numberField('ใช้การ์ดกี่ใบต่อครั้ง', config.materials, MIN_MATERIALS, MAX_MATERIALS, (value) =>
            patch({ materials: value }),
          )}
          {numberField('แจกการ์ดให้เลือกกี่ใบ', config.draws, MIN_DRAWS, MAX_DRAWS, (value) =>
            patch({ draws: value }),
          )}

          <div className={styles.field}>
            <span className={styles.label}>ไอคอนเมนู</span>
            <div className={styles.iconRow}>
              {config.icon ? (
                <img className={styles.iconPreview} src={config.icon} alt="" />
              ) : (
                <span className={styles.iconEmpty}>ยังไม่ได้ตั้ง</span>
              )}
              <label className={styles.upload}>
                {busy ? 'กำลังแปลงรูป…' : 'อัปโหลดรูป'}
                <input type="file" accept="image/*" hidden disabled={busy} onChange={uploadIcon} />
              </label>
              {config.icon && (
                <button
                  type="button"
                  className={styles.clear}
                  onClick={() => patch({ icon: '' }, 'กลับไปใช้ไอคอนเดิม')}
                >
                  ใช้ไอคอนเดิม
                </button>
              )}
            </div>
            <p className={styles.hint}>รูปวงกลมโปร่งใส 256×256 px ให้ผลดีที่สุด</p>
          </div>

          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              const result = reset();
              setStatus(
                result.ok
                  ? { tone: 'ok', text: 'คืนค่าเริ่มต้นแล้ว' }
                  : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' },
              );
            }}
          >
            คืนค่าเริ่มต้น
          </button>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>การ์ดที่ใช้เป็นวัตถุดิบได้</h3>
          {cardPicker(
            'materialIds',
            materialQuery,
            setMaterialQuery,
            'ว่างไว้ = ใช้การ์ดใบไหนก็ได้',
          )}
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ล็อคการ์ดไม่ให้ออก</h3>
          {cardPicker(
            'lockedIds',
            lockQuery,
            setLockQuery,
            'ว่างไว้ = ไม่ได้ล็อคใบไหน',
          )}
          <p className={styles.hint}>
            การ์ดที่ล็อคไว้จะไม่ถูกแจกเลย ถึงจะยังมีรายการรางวัลอยู่ในตารางก็ตาม —
            ล็อคไว้ดีกว่าลบทิ้ง เพราะพอถึงซีซั่นหน้าแค่ปลดล็อคก็กลับมาใช้ได้เลย
          </p>
        </div>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>
          รางวัล ({live} รายการที่ออกได้ · น้ำหนักรวม {total})
        </h3>

        {config.prizes.map((prize) => (
          <div key={prize.id} className={styles.prize}>
            <div className={styles.prizeHead}>
              <button
                type="button"
                className={`${styles.toggle} ${prize.enabled ? styles.toggleOn : ''}`}
                onClick={() => patchPrize(prize.id, { enabled: !prize.enabled })}
              >
                {prize.enabled ? 'เปิด' : 'ปิด'}
              </button>

              <input
                className={styles.input}
                maxLength={NAME_MAX}
                placeholder="ชื่อที่แสดง (ว่าง = ใช้ชื่อรางวัล)"
                value={prize.name}
                onChange={(event) => patchPrize(prize.id, { name: event.target.value })}
              />

              <label className={styles.inline}>
                <span className={styles.label}>น้ำหนัก</span>
                <input
                  className={styles.small}
                  inputMode="numeric"
                  value={String(prize.chance)}
                  onChange={(event) => patchPrize(prize.id, { chance: whole(event.target.value) })}
                />
              </label>

              <span className={styles.percent}>{percentOf(config, prize).toFixed(2)}%</span>

              <select
                className={styles.select}
                value={prize.rarity}
                onChange={(event) =>
                  patchPrize(prize.id, { rarity: event.target.value as FusionRarity })
                }
              >
                {FUSION_RARITIES.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {RARITY_LABEL[rarity]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`${styles.toggle} ${prize.announce ? styles.toggleOn : ''}`}
                title="ประกาศให้ทุกคนเห็นในฟีดผู้โชคดี เมื่อมีคนเก็บรางวัลนี้"
                onClick={() => patchPrize(prize.id, { announce: !prize.announce })}
              >
                {prize.announce ? 'ประกาศ' : 'ไม่ประกาศ'}
              </button>

              <button
                type="button"
                className={styles.remove}
                onClick={() =>
                  patch(
                    { prizes: latest.current.prizes.filter((entry) => entry.id !== prize.id) },
                    'ลบรางวัลแล้ว',
                  )
                }
              >
                ลบ
              </button>
            </div>

            <AdminRewardList
              rewards={[prize.reward]}
              min={1}
              max={1}
              onChange={(next) => {
                const line = next[0];
                if (line) patchPrize(prize.id, { reward: line });
              }}
            />
          </div>
        ))}

        <button
          type="button"
          className={styles.add}
          onClick={addPrize}
          disabled={config.prizes.length >= MAX_PRIZES}
        >
          เพิ่มรางวัล
        </button>
      </div>
    </div>
  );
}
