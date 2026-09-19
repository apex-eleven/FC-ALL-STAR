import { useRef, useState } from 'react';
import {
  CODE_MAX,
  MAX_CODES,
  MAX_PER_ACCOUNT,
  NAME_MAX,
  NOTE_MAX,
  TITLE_MAX,
  normalizeCodeText,
  redeemId,
} from '@/features/redeem/constants';
import { useRedeem } from '@/features/redeem/RedeemContext';
import type { RedeemCode, RedeemConfig } from '@/features/redeem/types';
import AdminRewardList from './AdminRewardList';
import styles from './AdminRedeem.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

/** Random, readable, and unlikely to collide: 4 letters + 4 digits. */
function suggestCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 4; i += 1) out += letters[Math.floor(Math.random() * letters.length)];
  return `${out}${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`;
}

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/** '' or 'YYYY-MM-DDTHH:mm' for a datetime-local input. */
function forInput(iso: string): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const local = new Date(time - new Date(time).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromInput(value: string): string {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

/**
 * แลกโค้ด settings: the codes themselves, what each one pays, and how long it lives.
 *
 * The per-account limit is the only one on offer. A cap across every player would
 * have to be counted somewhere a player can write to, and the code list is admin
 * config that players only read — a number here would be counted per browser and
 * would mean nothing.
 */
export default function AdminRedeem() {
  const { config, replace, reset, progress } = useRedeem();
  const [status, setStatus] = useState<Status>(null);
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  function commit(next: RedeemConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<RedeemConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchCode(id: string, changes: Partial<RedeemCode>) {
    patch({
      codes: latest.current.codes.map((code) => (code.id === id ? { ...code, ...changes } : code)),
    });
  }

  function addCode() {
    const code: RedeemCode = {
      id: redeemId(),
      code: suggestCode(),
      enabled: true,
      name: '',
      rewards: [{ kind: 'exchange', amount: 1_000 }],
      perAccount: 1,
      startAt: '',
      endAt: '',
    };
    patch({ codes: [...latest.current.codes, code] }, 'เพิ่มโค้ดแล้ว');
  }

  const live = config.codes.filter((code) => code.enabled).length;

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        แลกโค้ด (ปุ่ม แลกโค้ด แถบซ้ายหน้าหลัก) · ผู้เล่นพิมพ์โค้ดแล้วได้รางวัลที่ตั้งไว้ ·
        รางวัลเป็นอะไรก็ได้ที่เกมมี: สกุลเงิน การ์ดนักเตะ หรือไอเท็มในกระเป๋า ·
        โค้ดใช้ตัวอักษร A–Z ตัวเลข 0–9 และ - _ เท่านั้น พิมพ์เล็กหรือใหญ่ก็ตรงกัน
      </p>
      <p className={styles.legend}>
        &quot;ครั้งต่อไอดี&quot; คือลิมิตจริงอันเดียวที่บังคับได้ — ตัวนับรวมทั้งเซิร์ฟทำไม่ได้
        เพราะรายชื่อโค้ดเป็นค่าตั้งที่ผู้เล่นอ่านได้อย่างเดียว ถ้าอยากปิดโค้ดกลางทางให้กดปิดหรือตั้งเวลาหมดอายุแทน
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
            {config.enabled ? 'เปิดระบบแลกโค้ดอยู่' : 'ปิดระบบแลกโค้ดอยู่'}
          </button>
          <p className={styles.legend}>ปิดแล้วปุ่ม แลกโค้ด จะกดไม่ได้</p>

          <label className={styles.field}>
            <span className={styles.label}>ชื่อหน้าจอ</span>
            <input
              className={styles.input}
              maxLength={TITLE_MAX}
              value={config.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>คำอธิบายใต้ช่องกรอกโค้ด</span>
            <textarea
              className={styles.area}
              maxLength={NOTE_MAX}
              rows={3}
              value={config.note}
              onChange={(event) => patch({ note: event.target.value })}
            />
          </label>

          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('ลบโค้ดทั้งหมดและรีเซ็ตกลับเป็นค่าเริ่มต้น?')) {
                const result = reset();
                setStatus(
                  result.ok
                    ? { tone: 'ok', text: 'รีเซ็ตแล้ว' }
                    : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' },
                );
              }
            }}
          >
            รีเซ็ตทั้งหมด
          </button>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            โค้ดทั้งหมด ({config.codes.length} รายการ · เปิดอยู่ {live})
          </h3>

          {config.codes.length === 0 && (
            <p className={styles.legend}>ยังไม่มีโค้ด — กด &quot;เพิ่มโค้ด&quot; ด้านล่าง</p>
          )}

          {config.codes.map((code) => (
            <div key={code.id} className={`${styles.code} ${code.enabled ? '' : styles.codeOff}`}>
              <div className={styles.codeTop}>
                <label className={styles.field}>
                  <span className={styles.label}>โค้ด</span>
                  <input
                    className={`${styles.input} ${styles.codeInput}`}
                    maxLength={CODE_MAX}
                    value={code.code}
                    onChange={(event) =>
                      patchCode(code.id, { code: normalizeCodeText(event.target.value) })
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>ชื่อที่โชว์ (เว้นว่าง = ใช้ตัวโค้ด)</span>
                  <input
                    className={styles.input}
                    maxLength={NAME_MAX}
                    value={code.name}
                    onChange={(event) => patchCode(code.id, { name: event.target.value })}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>ครั้งต่อไอดี (0 = ไม่จำกัด)</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    defaultValue={code.perAccount}
                    key={`${code.id}-${code.perAccount}`}
                    // Committed on blur, so a half-typed number never clamps.
                    onBlur={(event) =>
                      patchCode(code.id, {
                        perAccount: Math.min(MAX_PER_ACCOUNT, whole(event.target.value)),
                      })
                    }
                  />
                </label>

                <div className={styles.codeSide}>
                  <button
                    type="button"
                    className={`${styles.toggle} ${code.enabled ? styles.toggleOn : ''}`}
                    onClick={() => patchCode(code.id, { enabled: !code.enabled })}
                  >
                    {code.enabled ? 'เปิด' : 'ปิด'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => {
                      void navigator.clipboard?.writeText(code.code);
                      setStatus({ tone: 'ok', text: `คัดลอก ${code.code} แล้ว` });
                    }}
                  >
                    คัดลอก
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    onClick={() =>
                      patch(
                        { codes: latest.current.codes.filter((entry) => entry.id !== code.id) },
                        'ลบโค้ดแล้ว',
                      )
                    }
                  >
                    ลบ
                  </button>
                </div>
              </div>

              <div className={styles.window}>
                <label className={styles.field}>
                  <span className={styles.label}>เริ่มใช้ได้ (เว้นว่าง = ทันที)</span>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={forInput(code.startAt)}
                    onChange={(event) =>
                      patchCode(code.id, { startAt: fromInput(event.target.value) })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>หมดอายุ (เว้นว่าง = ไม่หมด)</span>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={forInput(code.endAt)}
                    onChange={(event) => patchCode(code.id, { endAt: fromInput(event.target.value) })}
                  />
                </label>
                <span className={styles.mine}>
                  ไอดีนี้ใช้ไปแล้ว {progress.used[code.id]?.count ?? 0} ครั้ง
                </span>
              </div>

              <span className={styles.label}>รางวัลที่ได้</span>
              <AdminRewardList
                rewards={code.rewards}
                min={1}
                onChange={(rewards) => patchCode(code.id, { rewards })}
              />
              {code.rewards.length === 0 && (
                <p className={styles.legend}>โค้ดที่ไม่มีรางวัลจะใช้ไม่ได้</p>
              )}
            </div>
          ))}

          <button
            type="button"
            className={styles.ghost}
            disabled={config.codes.length >= MAX_CODES}
            onClick={addCode}
          >
            + เพิ่มโค้ด
          </button>
        </div>
      </div>
    </div>
  );
}
