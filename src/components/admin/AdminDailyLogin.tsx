import { useRef, useState } from 'react';
import { CYCLE_LABEL, TITLE_MAX } from '@/features/dailylogin/constants';
import { useDailyLogin } from '@/features/dailylogin/DailyLoginContext';
import { daysFor } from '@/features/dailylogin/dailyloginConfigStore';
import { LOGIN_CYCLES, type DailyLoginConfig, type LoginCycle, type LoginDay } from '@/features/dailylogin/types';
import AdminRewardList from './AdminRewardList';
import styles from './AdminDailyLogin.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * เข้าเกมรายวัน settings: the calendar's shape, when a day turns over, and what
 * each tile pays.
 *
 * Switching between week and month keeps the first seven tiles' rewards — the
 * store matches tiles by position — so trying the other shape costs nothing.
 */
export default function AdminDailyLogin() {
  const { config, replace, reset, progress, tile } = useDailyLogin();
  const [status, setStatus] = useState<Status>(null);
  // Several edits can land before a re-render, so patches build on the last one saved.
  const latest = useRef(config);
  latest.current = config;

  function commit(next: DailyLoginConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<DailyLoginConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchDay(day: number, changes: Partial<LoginDay>) {
    patch({
      days: latest.current.days.map((entry) => (entry.day === day ? { ...entry, ...changes } : entry)),
    });
  }

  function setCycle(cycle: LoginCycle) {
    // Re-shape the list here rather than leaving it to normalize, so the admin sees
    // the new tile count the moment they pick it.
    patch({ cycle, days: daysFor(cycle, latest.current.days) }, 'เปลี่ยนรูปแบบแล้ว');
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        เข้าเกมรายวัน · เด้งขึ้นเองที่หน้าหลักเมื่อยังไม่ได้รับของวันนี้ และเปิดดูได้จากแท็บในกล่องจดหมาย ·
        แบบ 7 วัน: รับครบ 7 ช่องแล้ววนใหม่ ขาดวันไม่รีเซ็ต · แบบรายเดือน: ช่องละวัน
        เริ่มใหม่ทุกต้นเดือน ขาดวันไหนช่องท้าย ๆ จะไปไม่ถึง
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
            {config.enabled ? 'เปิดระบบอยู่' : 'ปิดระบบอยู่'}
          </button>

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
            <span className={styles.label}>รูปแบบปฏิทิน</span>
            <select
              className={styles.input}
              value={config.cycle}
              onChange={(event) => setCycle(event.target.value as LoginCycle)}
            >
              {LOGIN_CYCLES.map((cycle) => (
                <option key={cycle} value={cycle}>
                  {CYCLE_LABEL[cycle]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>วันใหม่เริ่มตอน (นาฬิกาเครื่องผู้เล่น)</span>
            <select
              className={styles.input}
              value={config.resetHour}
              onChange={(event) => patch({ resetHour: Number(event.target.value) })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`${styles.toggle} ${config.autoOpen ? styles.toggleOn : ''}`}
            onClick={() => patch({ autoOpen: !config.autoOpen })}
          >
            {config.autoOpen ? 'เด้งขึ้นเองที่หน้าหลัก' : 'ไม่เด้งขึ้นเอง'}
          </button>
          <p className={styles.legend}>
            ปิดแล้วผู้เล่นต้องเปิดจากแท็บ &quot;เข้าเกมรายวัน&quot; ในกล่องจดหมายเอง
          </p>

          {progress && (
            <span className={styles.mine}>
              ไอดีนี้: รับแล้ว {progress.claimedDays.length}/{config.days.length} วัน · วันนี้ช่องที่ {tile}
              {progress.streak > 0 ? ` · ต่อเนื่อง ${progress.streak} วัน` : ''}
            </span>
          )}

          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('รีเซ็ตรางวัลทุกวันกลับเป็นค่าเริ่มต้น?')) {
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
          <h3 className={styles.blockTitle}>รางวัลแต่ละวัน ({config.days.length} ช่อง)</h3>
          <p className={styles.legend}>
            &quot;วันพิเศษ&quot; วาดช่องให้เด่นกว่าปกติ — ใช้กับวันที่ให้ของใหญ่ ·
            ช่องที่ไม่มีรางวัลยังรับได้ แต่ได้แค่ขีดว่าเข้าเกมแล้ว
          </p>

          <div className={styles.row}>
            {config.days.map((day) => (
              <div key={day.day} className={`${styles.day} ${day.big ? styles.dayBig : ''}`}>
                <div className={styles.dayHead}>
                  <span className={styles.dayTitle}>วันที่ {day.day}</span>
                  {progress && day.day === tile && <span className={styles.dayToday}>วันนี้ของไอดีนี้</span>}
                  <button
                    type="button"
                    className={`${styles.toggle} ${day.big ? styles.toggleOn : ''}`}
                    onClick={() => patchDay(day.day, { big: !day.big })}
                  >
                    {day.big ? 'วันพิเศษ' : 'วันปกติ'}
                  </button>
                </div>
                <AdminRewardList rewards={day.rewards} onChange={(rewards) => patchDay(day.day, { rewards })} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
