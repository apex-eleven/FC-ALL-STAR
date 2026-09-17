import { useRef, useState, type ChangeEvent } from 'react';
import {
  CASE_IMAGE,
  MAX_KEY_COST,
  MAX_PRIZES,
  NAME_MAX,
  RARITY_LABEL,
  gachaId,
} from '@/features/gacha/constants';
import { chanceTotal, percentOf } from '@/features/gacha/gacha';
import { useGacha } from '@/features/gacha/GachaContext';
import { GACHA_RARITIES, type GachaConfig, type GachaPrize, type GachaRarity } from '@/features/gacha/types';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import useRewardView from '@/components/shop/useRewardView';
import AdminRewardList from './AdminRewardList';
import styles from './AdminGacha.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไปแม้ย่อแล้ว ลองรูปที่เรียบกว่านี้',
  'decode-failed': 'เปิดรูปนี้ไม่ได้',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
};

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/**
 * กาชาปอง settings: what a spin costs, the case art, and every prize with its
 * chance.
 *
 * Chances are relative weights, not percentages that have to add to 100 — the real
 * odds are shown beside each row so a list adding to 137 still reads honestly rather
 * than being silently rescaled behind the admin's back.
 */
export default function AdminGacha() {
  const { config, replace, reset } = useGacha();
  const view = useRewardView();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  function commit(next: GachaConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<GachaConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchPrize(id: string, changes: Partial<GachaPrize>) {
    patch({
      prizes: latest.current.prizes.map((prize) => (prize.id === id ? { ...prize, ...changes } : prize)),
    });
  }

  function addPrize() {
    const prize: GachaPrize = {
      id: gachaId(),
      enabled: true,
      name: '',
      reward: { kind: 'exchange', amount: 1_000 },
      chance: 10,
      rarity: 'common',
      announce: false,
    };
    patch({ prizes: [...latest.current.prizes, prize] }, 'เพิ่มรางวัลแล้ว');
  }

  async function uploadCase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    const encoded = await encodeUploadedImage(file, CASE_IMAGE);
    setBusy(false);
    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    patch({ caseImage: encoded.dataUrl }, `แนบรูปแล้ว (${Math.round(encoded.bytes / 1000)} KB)`);
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

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        กาชาปอง (ปุ่ม กิจกรรม แถบซ้ายหน้าหลัก) · หมุน 1 ครั้งหักกุญแจตามที่ตั้งไว้ แล้วจ่ายรางวัล 1 ชิ้น ·
        เติมกุญแจให้ผู้เล่นได้ที่แท็บ &quot;เงินในเกม&quot; · รางวัลเป็นอะไรก็ได้ที่เกมมี: สกุลเงิน การ์ดนักเตะ
        หรือไอเท็มในกระเป๋า
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
            {config.enabled ? 'เปิดกาชาปองอยู่' : 'ปิดกาชาปองอยู่'}
          </button>
          <p className={styles.legend}>ปิดแล้วปุ่ม กิจกรรม จะกดไม่ได้</p>

          {textField('ชื่อหน้าจอ', config.title, (title) => patch({ title }))}
          {textField('ชื่อกล่อง', config.caseName, (caseName) => patch({ caseName }))}
          {textField('คำโฆษณาใต้ชื่อ', config.subtitle, (subtitle) => patch({ subtitle }))}

          <label className={styles.field}>
            <span className={styles.label}>กุญแจต่อการหมุน 1 ครั้ง (0 = ฟรี)</span>
            <input
              className={styles.input}
              inputMode="numeric"
              defaultValue={config.keyCost}
              key={`cost-${config.keyCost}`}
              // Committed on blur, so a half-typed number never clamps.
              onBlur={(event) => patch({ keyCost: Math.min(MAX_KEY_COST, whole(event.target.value)) })}
            />
          </label>

          <h3 className={styles.blockTitle}>รูปกล่อง</h3>
          <div className={styles.caseRow}>
            <span className={styles.caseThumb}>
              {config.caseImage ? <img src={config.caseImage} alt="" /> : 'รูปเริ่มต้น'}
            </span>
            <div className={styles.caseSide}>
              <label className={styles.ghost}>
                {busy ? 'กำลังแปลงรูป…' : 'อัปโหลดรูปกล่อง'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={busy}
                  onChange={(event) => void uploadCase(event)}
                />
              </label>
              {config.caseImage && (
                <button type="button" className={styles.danger} onClick={() => patch({ caseImage: '' })}>
                  ลบรูป
                </button>
              )}
              <p className={styles.legend}>
                PNG พื้นใสแนวนอน {CASE_IMAGE.maxWidth}×{CASE_IMAGE.maxHeight} สวยที่สุด
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('รีเซ็ตกาชาปองกลับเป็นค่าเริ่มต้นทั้งหมด?')) {
                const result = reset();
                setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
              }
            }}
          >
            รีเซ็ตทั้งหมด
          </button>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            รางวัลและเปอร์เซ็นต์ ({config.prizes.length} รายการ · เปิดอยู่ {live} · น้ำหนักรวม {total})
          </h3>
          <p className={styles.legend}>
            ช่อง &quot;น้ำหนัก&quot; ไม่ต้องรวมกันได้ 100 — เปอร์เซ็นต์จริงคิดจากน้ำหนักหารผลรวม และแสดงไว้ให้ข้าง ๆ
            แล้ว · ใส่น้ำหนัก 0 หรือปิดรายการ = ไม่ออก
          </p>

          <div className={styles.prizeHead}>
            <span>รางวัล</span>
            <span>น้ำหนัก / โอกาส</span>
            <span>ระดับ</span>
            <span />
          </div>

          {config.prizes.map((prize) => {
            const shown = view(prize.reward);
            return (
              <div key={prize.id} className={`${styles.prize} ${prize.enabled ? '' : styles.prizeOff}`}>
                <div className={styles.prizeMain}>
                  <div className={styles.prizeTop}>
                    <img className={styles.prizeIcon} src={shown.icon} alt="" />
                    <span className={styles.prizeLabel}>{prize.name.trim() || shown.label}</span>
                  </div>
                  <AdminRewardList
                    rewards={[prize.reward]}
                    min={1}
                    max={1}
                    onChange={(next) => {
                      const reward = next[0];
                      if (reward) patchPrize(prize.id, { reward });
                    }}
                  />
                  <input
                    className={styles.input}
                    maxLength={NAME_MAX}
                    placeholder="ชื่อที่โชว์ (เว้นว่าง = ชื่อของรางวัลเอง)"
                    value={prize.name}
                    onChange={(event) => patchPrize(prize.id, { name: event.target.value })}
                  />
                </div>

                <div className={styles.prizeChance}>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    defaultValue={prize.chance}
                    key={`${prize.id}-${prize.chance}`}
                    onBlur={(event) => patchPrize(prize.id, { chance: whole(event.target.value) })}
                  />
                  <span className={styles.percent}>{percentOf(config, prize).toFixed(2)}%</span>
                </div>

                <div className={styles.prizeSide}>
                  <select
                    className={styles.input}
                    value={prize.rarity}
                    onChange={(event) => patchPrize(prize.id, { rarity: event.target.value as GachaRarity })}
                  >
                    {GACHA_RARITIES.map((rarity) => (
                      <option key={rarity} value={rarity}>
                        {RARITY_LABEL[rarity]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`${styles.toggle} ${prize.enabled ? styles.toggleOn : ''}`}
                    onClick={() => patchPrize(prize.id, { enabled: !prize.enabled })}
                  >
                    {prize.enabled ? 'เปิด' : 'ปิด'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggle} ${prize.announce ? styles.toggleOn : ''}`}
                    title="ประกาศชื่อผู้ที่ได้รางวัลนี้ให้ทุกคนเห็น"
                    onClick={() => patchPrize(prize.id, { announce: !prize.announce })}
                  >
                    ประกาศ
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.danger}
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
            );
          })}

          <button
            type="button"
            className={styles.ghost}
            disabled={config.prizes.length >= MAX_PRIZES}
            onClick={addPrize}
          >
            + เพิ่มรางวัล
          </button>
          {total === 0 && <p className={styles.legend}>ยังไม่มีรางวัลที่ออกได้ — หน้าจอกาชาปองจะหมุนไม่ได้</p>}
        </div>
      </div>
    </div>
  );
}
