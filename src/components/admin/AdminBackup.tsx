import { useRef, useState } from 'react';
import {
  applySnapshot,
  collectSnapshot,
  downloadSnapshot,
  readSnapshotFile,
  saveConfigToRepo,
  storageUsage,
  CONFIG_FILE,
} from '@/features/backup/backup';
import {
  lastPullResult,
  lastPushGuard,
  lastPushSize,
  pullConfigFromCloud,
  pushConfigToCloud,
  type ConfigPushState,
  type PullResult,
} from '@/features/cloud/cloudConfig';
import { isCloudEnabled } from '@/features/cloud/firebase';
import styles from './AdminBackup.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

/** Characters to megabytes, one decimal — localStorage and Firestore both count characters here. */
function mb(chars: number): string {
  return `${(chars / 1_000_000).toFixed(1)} MB`;
}

/** The last settings key segment, which is the readable part: `draft-events:v2` → `draft-events`. */
function shortKey(key: string): string {
  return key.replace(/^football-home-ui:/, '').replace(/:v\d+$/, '');
}

/**
 * One line saying what the cloud pull did — or why it did not.
 *
 * This is what makes "the other browser still shows old packs" answerable: the
 * pull used to report only a count, and 0 and a half-finished write looked the same
 * as success.
 */
/** What a push did, in words — including the two refusals that protect the cloud copy. */
function describePush(state: ConfigPushState): Status {
  const guard = lastPushGuard();
  const cloud = guard
    ? `บนคลาวด์มี ${guard.cloudEntries ?? '?'} รายการ${guard.cloudChars ? ` ${mb(guard.cloudChars)}` : ''}`
    : '';
  const here = guard ? `เครื่องนี้มี ${guard.localEntries} รายการ ${mb(guard.localChars)}` : '';
  switch (state) {
    case 'saved':
      return { tone: 'ok', text: `ส่งขึ้นคลาวด์แล้ว (${mb(lastPushSize())}) · ผู้เล่นทุกคนจะเห็นตอนเปิดครั้งถัดไป` };
    case 'stale':
      return {
        tone: 'bad',
        text:
          `ยังไม่ได้ส่ง — มีคนบันทึกค่าตั้งขึ้นคลาวด์หลังจากที่เครื่องนี้ดึงมาครั้งล่าสุด ` +
          `ถ้าส่งตอนนี้จะทับงานของเขา · ${cloud} · ${here}`,
      };
    case 'would-shrink':
      return {
        tone: 'bad',
        text: `ยังไม่ได้ส่ง — เครื่องนี้มีค่าตั้งน้อยกว่าบนคลาวด์ ถ้าส่งจะลบส่วนที่ขาดทิ้ง · ${cloud} · ${here}`,
      };
    case 'too-large':
      return { tone: 'bad', text: 'ตั้งค่าใหญ่เกินไป (เกิน ~9 MB) — ลดขนาดหรือจำนวนรูปที่อัปโหลดลงก่อน' };
    case 'denied':
      return { tone: 'bad', text: 'ไอดีนี้ไม่ใช่แอดมินบนคลาวด์ (ต้องมี admins/{uid} ใน Firestore)' };
    default:
      return { tone: 'bad', text: 'ส่งขึ้นคลาวด์ไม่สำเร็จ' };
  }
}

function describePull(result: PullResult | null): Status {
  if (!result) return null;
  switch (result.state) {
    case 'disabled':
      return { tone: 'bad', text: 'ไม่ได้เชื่อม Firebase — เว็บนี้ build โดยไม่มีค่า Firebase' };
    case 'no-config':
      return { tone: 'bad', text: 'บนคลาวด์ยังไม่มีตั้งค่าเลย — กด "ส่งตั้งค่าขึ้นคลาวด์" จากเครื่องแอดมินก่อน' };
    case 'read-failed':
      return { tone: 'bad', text: `ดึงจากคลาวด์ไม่สำเร็จ: ${result.reason}` };
    case 'applied': {
      const when = new Date(result.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
      if (result.skipped.length === 0) {
        return { tone: 'ok', text: `ดึงจากคลาวด์ครบ ${result.applied}/${result.total} รายการ · ${mb(result.chars)} · บันทึกเมื่อ ${when}` };
      }
      const missing = result.skipped.map((entry) => `${shortKey(entry.key)} (${mb(entry.chars)})`).join(', ');
      return {
        tone: 'bad',
        text:
          `พื้นที่เก็บในเบราว์เซอร์นี้ไม่พอ — เขียนได้ ${result.applied}/${result.total} รายการ ` +
          `ขาด: ${missing} · ตั้งค่าทั้งหมด ${mb(result.chars)} ใช้พื้นที่เครื่องอยู่ ${mb(storageUsage())}`,
      };
    }
  }
}

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
  // What the pull at start-up did. Read once: it describes this session's boot.
  const [bootPull] = useState<Status>(() => describePull(lastPullResult()));
  // A push the guard held back — shows the confirm-and-overwrite button.
  const [held, setHeld] = useState(false);
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

      {isCloudEnabled() && (
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>คลาวด์ (Firebase) — ทุกคนเห็นพร้อมกัน</h3>

          {bootPull && (
            <p className={`${styles.pull} ${bootPull.tone === 'bad' ? styles.pullBad : ''}`}>
              <b>ตอนเปิดเกมครั้งนี้:</b> {bootPull.text}
            </p>
          )}

          <p className={styles.legend}>
            ส่งตั้งค่าทั้งหมดขึ้น Firestore · ผู้เล่นทุกคนจะได้ของใหม่ตอนเปิดเกมครั้งถัดไป
            <br />
            ปกติระบบส่งให้เองทุกครั้งที่ปิดแผงแอดมินอยู่แล้ว ปุ่มนี้มีไว้กดย้ำ
          </p>

          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void pushConfigToCloud().then((state) => {
                  setBusy(false);
                  setStatus(describePush(state));
                  setHeld(state === 'stale' || state === 'would-shrink');
                });
              }}
            >
              ส่งตั้งค่าขึ้นคลาวด์
            </button>

            {/*
              Only offered after a push was held back and the numbers are on screen.
              It is the one way to overwrite a bigger or newer cloud copy on purpose.
            */}
            {held && (
              <button
                type="button"
                className={styles.danger}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void pushConfigToCloud({ force: true }).then((state) => {
                    setBusy(false);
                    setHeld(false);
                    setStatus(describePush(state));
                  });
                }}
              >
                ยืนยันส่งทับของบนคลาวด์
              </button>
            )}

            <button
              type="button"
              className={styles.ghost}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void pullConfigFromCloud().then((result) => {
                  setBusy(false);
                  const status = describePull(result);
                  setStatus(status);
                  // Reload only on a complete pull. A failed or partial one stays on
                  // screen, because the message is the whole point of pressing this.
                  if (result.state === 'applied' && result.skipped.length === 0) {
                    setStatus({ tone: 'ok', text: `${status?.text ?? ''} · กำลังโหลดหน้าใหม่…` });
                    window.setTimeout(() => window.location.reload(), 1500);
                  }
                });
              }}
            >
              ดึงตั้งค่าจากคลาวด์ (ทับของในเครื่อง)
            </button>
          </div>

          <p className={styles.legend}>
            ตั้งค่าถูกแบ่งเก็บหลาย document (Firestore รับได้ 1 MiB ต่อ document) รวมได้ราว 9 MB ·
            รูปที่อัปโหลดถูกเก็บเป็น data URL จึงเป็นตัวที่กินที่มากที่สุด
          </p>
        </div>
      )}

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

                // Every context read its storage once, at mount, so a reload is the
                // only honest way to show restored data. On a cloud deployment the
                // restore has to reach the cloud first: the reload pulls the cloud
                // copy over local storage, and would quietly undo the restore.
                if (!isCloudEnabled()) {
                  setStatus({ tone: 'ok', text: `กู้คืน ${applied} รายการแล้ว · กำลังโหลดหน้าใหม่…` });
                  window.setTimeout(() => window.location.reload(), 900);
                  return;
                }

                setStatus({ tone: 'ok', text: `กู้คืน ${applied} รายการในเครื่องแล้ว · กำลังส่งขึ้นคลาวด์…` });
                setBusy(true);
                // Forced: choosing a backup file and pressing restore is the admin
                // saying "this is the game's settings now".
                void pushConfigToCloud({ force: true }).then((state) => {
                  setBusy(false);
                  if (state !== 'saved') {
                    const why = describePush(state);
                    setStatus({
                      tone: 'bad',
                      text: `กู้ในเครื่องแล้ว แต่ส่งขึ้นคลาวด์ไม่สำเร็จ — ${why?.text ?? ''} · ยังไม่รีโหลด กดส่งซ้ำได้`,
                    });
                    return;
                  }
                  setStatus({
                    tone: 'ok',
                    text: `กู้คืน ${applied} รายการ และส่งขึ้นคลาวด์แล้ว (${mb(lastPushSize())}) · กำลังโหลดหน้าใหม่…`,
                  });
                  window.setTimeout(() => window.location.reload(), 1500);
                });
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
