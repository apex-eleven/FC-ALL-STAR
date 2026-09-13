import { useRef, useState } from 'react';
import {
  applySnapshot,
  collectSnapshot,
  downloadSnapshot,
  readSnapshotFile,
  saveConfigToRepo,
  CONFIG_FILE,
} from '@/features/backup/backup';
import styles from './AdminBackup.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

/**
 * Moving the game to another machine, and getting it back when something is lost.
 *
 * The split here is the whole point: admin data can live in the repo because it holds
 * nothing secret, accounts cannot because they hold password hashes and `public/` is
 * served to the world.
 */
export default function AdminBackup() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'replace' | 'missing-only'>('replace');
  const fileInput = useRef<HTMLInputElement>(null);

  const configCount = Object.keys(collectSnapshot(false).entries).length;
  const fullCount = Object.keys(collectSnapshot(true).entries).length;

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        สำรองและกู้คืนข้อมูลทั้งหมดของเกมในเครื่องนี้ ·
        ใช้ตอนย้ายโปรเจกต์ไปเครื่องอื่น หรือก่อนล้างข้อมูลเบราว์เซอร์
      </p>

      <div className={styles.columns}>
        {/* ---- repo mirror ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>บันทึกลงโปรเจกต์ (ติดไปกับ repo)</h3>

          <p className={styles.legend}>
            เก็บ <strong>คลังการ์ด · แพ็ค · ดราฟต์ · ลีก · แบนเนอร์ · walkout · อวตาร</strong>{' '}
            ลงไฟล์ <code>{CONFIG_FILE}</code> ในโปรเจกต์
            <br />
            คอมมิตไฟล์นี้แล้วข้อมูลจะติดไปกับ repo — ย้ายเครื่อง เปิดมาก็มีครบ
            <br />
            <strong>ไม่มีข้อมูลไอดีผู้เล่นอยู่ในไฟล์นี้</strong> เพราะ <code>public/</code>{' '}
            ถูกเสิร์ฟให้ทุกคนที่เปิดเว็บ เอารหัสผ่านไปวางไว้ตรงนั้นไม่ได้
          </p>

          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void saveConfigToRepo().then((state) => {
                  setBusy(false);
                  setStatus(
                    state === 'saved'
                      ? { tone: 'ok', text: `บันทึก ${configCount} รายการลงโปรเจกต์แล้ว` }
                      : state === 'unavailable'
                        ? { tone: 'bad', text: 'ต้องรันด้วย npm run dev ถึงจะเขียนไฟล์ได้' }
                        : { tone: 'bad', text: 'เขียนไฟล์ไม่สำเร็จ' },
                  );
                });
              }}
            >
              บันทึกลงโปรเจกต์เดี๋ยวนี้
            </button>

            <button
              type="button"
              className={styles.ghost}
              onClick={() => downloadSnapshot(collectSnapshot(false))}
            >
              ดาวน์โหลดไฟล์ตั้งค่า (ไม่มีไอดี)
            </button>
          </div>

          <p className={styles.legend}>
            ระบบบันทึกให้อัตโนมัติทุกครั้งที่ปิดแผงแอดมินด้วย ปุ่มนี้มีไว้กดย้ำก่อนย้ายเครื่อง
          </p>
        </div>

        {/* ---- full export ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>สำรองทั้งหมด (รวมไอดีผู้เล่น)</h3>

          <p className={styles.legend}>
            ไฟล์เดียวจบ: ตั้งค่าทั้งหมด + ทุกไอดีในเครื่องนี้ (การ์ดในสโมสร เงิน ทีม ลีก
            และรหัสผ่านที่เข้ารหัสไว้)
            <br />
            เก็บไฟล์นี้ไว้นอก repo — อย่าคอมมิตขึ้น git
          </p>

          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                downloadSnapshot(collectSnapshot(true));
                setStatus({ tone: 'ok', text: `ดาวน์โหลดไฟล์สำรอง ${fullCount} รายการแล้ว` });
              }}
            >
              ดาวน์โหลดไฟล์สำรองทั้งหมด
            </button>
          </div>

          <h3 className={styles.blockTitle}>กู้คืนจากไฟล์</h3>

          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.chip} ${mode === 'replace' ? styles.chipOn : ''}`}
              onClick={() => setMode('replace')}
            >
              ทับของเดิม
            </button>
            <button
              type="button"
              className={`${styles.chip} ${mode === 'missing-only' ? styles.chipOn : ''}`}
              onClick={() => setMode('missing-only')}
            >
              เติมเฉพาะที่ขาด
            </button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className={styles.hiddenInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared right away so the same file can be picked again after a failure.
              event.target.value = '';
              if (!file) return;

              void readSnapshotFile(file).then((snapshot) => {
                if (!snapshot) {
                  setStatus({ tone: 'bad', text: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของเกม' });
                  return;
                }

                const applied = applySnapshot(snapshot, mode);
                setStatus({
                  tone: 'ok',
                  text: `กู้คืน ${applied} รายการแล้ว · กำลังโหลดหน้าใหม่…`,
                });
                // Every context read its storage once, at mount. A reload is the only
                // honest way to make the restored data the data on screen.
                window.setTimeout(() => window.location.reload(), 900);
              });
            }}
          />

          <div className={styles.row}>
            <button type="button" className={styles.ghost} onClick={() => fileInput.current?.click()}>
              เลือกไฟล์สำรอง…
            </button>
          </div>

          <p className={styles.legend}>
            กู้คืนแล้วหน้าจะโหลดใหม่เอง เพราะทุกส่วนของเกมอ่านข้อมูลตอนเปิดครั้งเดียว
          </p>
        </div>
      </div>

      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}
    </div>
  );
}
