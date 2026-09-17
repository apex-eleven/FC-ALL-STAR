import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import { MAX_LEVELS, TITLE_MAX, starpassId } from '@/features/starpass/constants';
import { currentPass, levelOf } from '@/features/starpass/starpass';
import { useStarPass } from '@/features/starpass/StarPassContext';
import type { StarPassConfig, StarPassLevel } from '@/features/starpass/types';
import AdminRewardList from './AdminRewardList';
import styles from './AdminStarPass.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/** '' clears a price (not sold for that currency). */
function priceOf(raw: string): number | null {
  const value = whole(raw);
  return value > 0 ? value : null;
}

/**
 * Star Pass settings: XP rates, level size, premium price, the reward of every
 * level on both tracks, and a tool to open the premium track for a player.
 */
export default function AdminStarPass() {
  const { config, replace, reset, season, grant } = useStarPass();
  const { listAccounts } = useAuth();
  const latest = useRef(config);
  latest.current = config;
  const [status, setStatus] = useState<Status>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [target, setTarget] = useState('');

  const loadAccounts = () =>
    listAccounts().then((list) => setAccounts([...list].sort((a, b) => a.username.localeCompare(b.username))));

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listAccounts]);

  function commit(next: StarPassConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<StarPassConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchLevel(id: string, changes: Partial<StarPassLevel>) {
    patch({ levels: latest.current.levels.map((level) => (level.id === id ? { ...level, ...changes } : level)) });
  }

  function addLevel() {
    const last = latest.current.levels[latest.current.levels.length - 1];
    const level: StarPassLevel = {
      id: starpassId('lv'),
      free: last ? [...last.free] : [{ kind: 'exchange', amount: 500 }],
      premium: last ? [...last.premium] : [{ kind: 'gem', amount: 100 }],
    };
    patch({ levels: [...latest.current.levels, level] }, 'เพิ่มขั้นแล้ว');
  }

  const chosen = accounts.find((entry) => entry.username === target);
  const chosenPass = chosen ? currentPass(chosen.starpass, season) : null;

  async function setPremiumFor(premium: boolean) {
    if (!chosen) return;
    const saved = await grant(chosen.username, premium);
    setStatus(
      saved
        ? { tone: 'ok', text: premium ? `เปิดสายพิเศษให้ ${chosen.username} แล้ว` : `ปิดสายพิเศษของ ${chosen.username} แล้ว` }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' },
    );
    await loadAccounts();
  }

  const numberField = (label: string, value: number, apply: (value: number) => void) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        inputMode="numeric"
        defaultValue={value}
        key={`${label}-${value}`}
        // Committed on blur, so a half-typed number never clamps.
        onBlur={(event) => apply(whole(event.target.value))}
      />
    </label>
  );

  const priceField = (label: string, value: number | null, apply: (value: number | null) => void) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        inputMode="numeric"
        placeholder="ไม่ขาย"
        defaultValue={value ?? ''}
        key={`${label}-${value}`}
        onBlur={(event) => apply(priceOf(event.target.value))}
      />
    </label>
  );

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        Star Pass (ปุ่ม STAR PASS แถบซ้ายหน้าหลัก) · รอบเดียวกับซีซั่นเมเนเจอร์โหมด เริ่มซีซั่นใหม่ XP รางวัลที่รับ
        และสายพิเศษจะเริ่มใหม่ · XP ได้จากการกดรับภารกิจและการแข่งเมเนเจอร์จบนัด (ออกกลางคันไม่ได้) · ซีซั่นปัจจุบัน #
        {season + 1}
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
            <div className={styles.line}>
              <button
                type="button"
                className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
                onClick={() => patch({ enabled: !config.enabled })}
              >
                {config.enabled ? 'เปิด Star Pass อยู่' : 'ปิด Star Pass อยู่'}
              </button>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>ชื่อหน้าจอ</span>
              <input
                className={styles.input}
                maxLength={TITLE_MAX}
                value={config.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <div className={styles.pair}>
              {numberField('XP ต่อ 1 ขั้น', config.xpPerLevel, (value) => patch({ xpPerLevel: Math.max(1, value) }))}
              {numberField('XP จากภารกิจ (% ของแต้มภารกิจ)', config.missionRate, (value) =>
                patch({ missionRate: value }),
              )}
            </div>
            <div className={styles.triple}>
              {numberField('XP ชนะ', config.matchWin, (value) => patch({ matchWin: value }))}
              {numberField('XP เสมอ', config.matchDraw, (value) => patch({ matchDraw: value }))}
              {numberField('XP แพ้', config.matchLoss, (value) => patch({ matchLoss: value }))}
            </div>
            <div className={styles.pair}>
              {priceField('ราคาสายพิเศษ (เจม)', config.priceGem, (value) => patch({ priceGem: value }))}
              {priceField('ราคาสายพิเศษ (FC Point)', config.priceFcpoint, (value) => patch({ priceFcpoint: value }))}
            </div>
            <p className={styles.legend}>เว้นราคาว่าง = ไม่ขายด้วยสกุลนั้น · ว่างทั้งคู่ = เปิดได้โดยแอดมินเท่านั้น</p>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                if (window.confirm('รีเซ็ต Star Pass กลับเป็นค่าเริ่มต้นทั้งหมด?')) {
                  const result = reset();
                  setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
                }
              }}
            >
              รีเซ็ตทั้งหมด
            </button>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>เปิดสายพิเศษให้ผู้เล่น (ซีซั่นนี้)</h3>
            <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">— เลือกผู้เล่น —</option>
              {accounts.map((entry) => (
                <option key={entry.id} value={entry.username}>
                  {entry.username}
                </option>
              ))}
            </select>
            {chosenPass && (
              <p className={styles.legend}>
                ขั้น {levelOf(chosenPass.xp, config)} · XP {chosenPass.xp} · สายพิเศษ{' '}
                {chosenPass.premium ? 'เปิดแล้ว' : 'ยังไม่เปิด'}
              </p>
            )}
            <div className={styles.line}>
              <button
                type="button"
                className={styles.primary}
                disabled={!chosenPass || chosenPass.premium}
                onClick={() => void setPremiumFor(true)}
              >
                เปิดสายพิเศษ
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={!chosenPass || !chosenPass.premium}
                onClick={() => void setPremiumFor(false)}
              >
                ปิดสายพิเศษ
              </button>
            </div>
          </div>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            รางวัลแต่ละขั้น ({config.levels.length} ขั้น · ครบทุกขั้นที่ {config.levels.length * config.xpPerLevel} XP)
          </h3>
          <div className={styles.levelHead}>
            <span>ขั้น</span>
            <span>สายฟรี</span>
            <span>สายพิเศษ</span>
            <span />
          </div>
          {config.levels.map((level, index) => (
            <div key={level.id} className={styles.level}>
              <span className={styles.levelNo}>{index + 1}</span>
              <AdminRewardList rewards={level.free} onChange={(free) => patchLevel(level.id, { free })} />
              <AdminRewardList rewards={level.premium} onChange={(premium) => patchLevel(level.id, { premium })} />
              <button
                type="button"
                className={styles.danger}
                onClick={() =>
                  patch({ levels: latest.current.levels.filter((entry) => entry.id !== level.id) }, 'ลบขั้นแล้ว')
                }
              >
                ลบ
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.ghost}
            disabled={config.levels.length >= MAX_LEVELS}
            onClick={addLevel}
          >
            + เพิ่มขั้น (คัดลอกรางวัลขั้นสุดท้าย)
          </button>
        </div>
      </div>
    </div>
  );
}
