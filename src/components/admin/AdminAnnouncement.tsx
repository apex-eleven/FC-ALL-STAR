import { useState, type ChangeEvent } from 'react';
import { useAnnouncement } from '@/features/announcement/AnnouncementContext';
import { isLive } from '@/features/announcement/announcementStore';
import type { SaveResult } from '@/features/announcement/announcementStore';
import {
  BODY_MAX,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_H,
  IMAGE_MAX_W,
  LABEL_MAX,
  TITLE_MAX,
  TONE_LABEL,
} from '@/features/announcement/constants';
import type { AnnouncementAction, AnnouncementTone } from '@/features/announcement/types';
import { ROUTE_IDS } from '@/features/navigation/routes';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import styles from './AdminAnnouncement.module.css';

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'decode-failed': 'เปิดไฟล์รูปไม่ได้ ลองไฟล์อื่น',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
  'too-large-to-store': 'รูปใหญ่เกินกว่าจะเก็บได้ ลองความละเอียดต่ำกว่านี้',
};

const SAVE_ERROR: Record<'quota' | 'unavailable', string> = {
  quota: 'พื้นที่เก็บข้อมูลเต็ม',
  unavailable: 'เบราว์เซอร์บล็อกการบันทึก',
};

const ROUTE_LABEL: Record<string, string> = {
  home: 'หน้าหลัก',
  draft: 'เปิดแพ็ค',
  club: 'สโมสร',
  league: 'ลีก',
  rankup: 'ตีบวกการ์ด',
  transfer: 'การเซ็นสัญญา',
};

const TONES: readonly AnnouncementTone[] = ['info', 'event', 'warning'];

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function describe(result: SaveResult, success: string): Status {
  return result.ok ? { tone: 'ok', text: success } : { tone: 'bad', text: SAVE_ERROR[result.reason] };
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time; storage holds ISO. */
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Writes the notice that appears in the middle of every player's screen.
 *
 * Two separate saves on purpose. "บันทึก" edits quietly, so fixing a typo does not
 * reopen the box for people who already closed it; "เผยแพร่" bumps the revision and
 * puts it back in front of everyone. Getting those confused is how a small
 * correction turns into a popup the whole player base sees twice.
 */
export default function AdminAnnouncement() {
  const { config, update, publish, clear } = useAnnouncement();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const live = isLive(config);

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    const encoded = await encodeUploadedImage(file, {
      maxWidth: IMAGE_MAX_W,
      maxHeight: IMAGE_MAX_H,
      maxBytes: IMAGE_MAX_BYTES,
    });

    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      setBusy(false);
      return;
    }

    setStatus(describe(update({ image: encoded.dataUrl }), 'แนบรูปแล้ว'));
    setBusy(false);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={`${styles.pill} ${live ? styles.pillLive : ''}`}>
          {live ? 'กำลังแสดงอยู่' : 'ยังไม่แสดง'}
        </span>
        <p className={styles.note}>ประกาศจะขึ้นกลางจอผู้เล่นทุกคนที่เปิดเกม</p>
      </div>

      {status && (
        <p className={`${styles.status} ${status.tone === 'ok' ? styles.ok : styles.bad}`}>
          {status.text}
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>
              หัวข้อ <em>{config.title.length}/{TITLE_MAX}</em>
            </span>
            <input
              className={styles.input}
              value={config.title}
              maxLength={TITLE_MAX}
              placeholder="เช่น ปิดปรับปรุงเซิร์ฟเวอร์"
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              เนื้อหา <em>{config.body.length}/{BODY_MAX}</em>
            </span>
            <textarea
              className={styles.textarea}
              value={config.body}
              maxLength={BODY_MAX}
              rows={6}
              placeholder={'ขึ้นบรรทัดใหม่ได้\nแต่ละบรรทัดจะแสดงเป็นย่อหน้า'}
              onChange={(event) => update({ body: event.target.value })}
            />
          </label>

          <div className={styles.field}>
            <span className={styles.label}>รูปแบบ</span>
            <div className={styles.chips}>
              {TONES.map((tone) => (
                <button
                  type="button"
                  key={tone}
                  className={`${styles.chip} ${styles[tone]} ${
                    config.tone === tone ? styles.chipOn : ''
                  }`}
                  onClick={() => update({ tone })}
                >
                  {TONE_LABEL[tone]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.split}>
            <label className={styles.field}>
              <span className={styles.label}>เริ่มแสดง (เว้นว่าง = ทันที)</span>
              <input
                type="datetime-local"
                className={styles.input}
                value={toLocalInput(config.startAt)}
                onChange={(event) => update({ startAt: fromLocalInput(event.target.value) })}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>หยุดแสดง (เว้นว่าง = ไม่มีกำหนด)</span>
              <input
                type="datetime-local"
                className={styles.input}
                value={toLocalInput(config.endAt)}
                onChange={(event) => update({ endAt: fromLocalInput(event.target.value) })}
              />
            </label>
          </div>

          <div className={styles.split}>
            <label className={styles.field}>
              <span className={styles.label}>ปุ่มลัด</span>
              <select
                className={styles.input}
                value={config.action}
                onChange={(event) =>
                  update({ action: event.target.value as AnnouncementAction })
                }
              >
                <option value="none">ไม่มีปุ่ม</option>
                {ROUTE_IDS.map((route) => (
                  <option key={route} value={route}>
                    {ROUTE_LABEL[route] ?? route}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>ข้อความบนปุ่ม</span>
              <input
                className={styles.input}
                value={config.actionLabel}
                maxLength={LABEL_MAX}
                disabled={config.action === 'none'}
                placeholder="ไปที่หน้านั้น"
                onChange={(event) => update({ actionLabel: event.target.value })}
              />
            </label>
          </div>

          <div className={styles.imageRow}>
            <div className={styles.thumb}>
              {config.image ? (
                <img src={config.image} alt="" />
              ) : (
                <span className={styles.thumbEmpty}>ไม่มีรูป</span>
              )}
            </div>
            <div className={styles.imageActions}>
              <label className={styles.upload}>
                {busy ? 'กำลังอัปโหลด…' : 'แนบรูปหัวประกาศ'}
                <input type="file" accept="image/*" hidden disabled={busy} onChange={uploadImage} />
              </label>
              <button
                type="button"
                className={styles.ghost}
                disabled={!config.image}
                onClick={() => setStatus(describe(update({ image: '' }), 'เอารูปออกแล้ว'))}
              >
                เอารูปออก
              </button>
            </div>
          </div>

          <div className={styles.toggles}>
            <button
              type="button"
              className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
              onClick={() => setStatus(describe(update({ enabled: !config.enabled }), 'บันทึกแล้ว'))}
            >
              <span className={styles.dot} />
              เปิดประกาศ
            </button>

            <button
              type="button"
              className={`${styles.toggle} ${config.once ? styles.toggleOn : ''}`}
              onClick={() => setStatus(describe(update({ once: !config.once }), 'บันทึกแล้ว'))}
            >
              <span className={styles.dot} />
              แสดงครั้งเดียวต่อคน
            </button>
          </div>

          <p className={styles.hint}>
            {config.once
              ? 'ผู้เล่นที่กดปิดแล้วจะไม่เห็นอีก จนกว่าจะกด "เผยแพร่" ครั้งใหม่'
              : 'ประกาศจะขึ้นใหม่ทุกครั้งที่ผู้เล่นเปิดเกม ตราบใดที่ยังอยู่ในช่วงเวลาที่ตั้งไว้'}
          </p>

          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.publish}
              disabled={!config.title && !config.body}
              onClick={() =>
                setStatus(
                  describe(publish({ enabled: true }), 'เผยแพร่แล้ว ผู้เล่นทุกคนจะเห็นประกาศนี้'),
                )
              }
            >
              เผยแพร่
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setStatus(describe(update({ enabled: false }), 'ปิดประกาศแล้ว'))}
            >
              หยุดแสดง
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setStatus(describe(clear(), 'ล้างประกาศแล้ว'))}
            >
              ล้างทั้งหมด
            </button>
          </div>
        </div>

        <div className={styles.previewPane}>
          <span className={styles.label}>ตัวอย่าง</span>
          <div className={`${styles.preview} ${styles[`edge-${config.tone}`]}`}>
            {config.image && <img className={styles.previewBanner} src={config.image} alt="" />}
            <h4 className={styles.previewTitle}>{config.title || 'ประกาศ'}</h4>
            <div className={styles.previewBody}>
              {config.body
                ? config.body.split('\n').map((line, index) => <p key={index}>{line}</p>)
                : <p className={styles.thumbEmpty}>ยังไม่ได้ใส่เนื้อหา</p>}
            </div>
            <div className={styles.previewButtons}>
              {config.action !== 'none' && (
                <span className={styles.previewGo}>{config.actionLabel || 'ไปที่หน้านั้น'}</span>
              )}
              <span className={styles.previewOk}>รับทราบ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
