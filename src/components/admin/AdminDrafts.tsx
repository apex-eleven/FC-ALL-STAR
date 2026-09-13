import { useRef, useState } from 'react';
import {
  DRAFT_BANNER_MAX_BYTES,
  DRAFT_BANNER_MAX_HEIGHT,
  DRAFT_BANNER_MAX_WIDTH,
  DRAFT_THUMB_MAX_BYTES,
  DRAFT_THUMB_MAX_HEIGHT,
  DRAFT_THUMB_MAX_WIDTH,
  NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '@/features/draft/constants';
import { useDraft } from '@/features/draft/DraftContext';
import type { SaveResult } from '@/features/draft/draftConfigStore';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import styles from './AdminDrafts.module.css';

type Slot = 'banner' | 'thumbnail';

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'decode-failed': 'เปิดไฟล์รูปไม่ได้ ลองไฟล์อื่น',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
  'too-large-to-store': 'รูปใหญ่เกินกว่าจะเก็บได้ ลองรูปที่เล็กลง',
};

const SAVE_ERROR: Record<'quota' | 'unavailable', string> = {
  quota: 'พื้นที่เก็บข้อมูลเต็ม ลองล้างรูปของดราฟต์อื่นก่อน',
  unavailable: 'เบราว์เซอร์บล็อกการบันทึก',
};

const BUDGETS: Record<Slot, { maxWidth: number; maxHeight: number; maxBytes: number }> = {
  banner: {
    maxWidth: DRAFT_BANNER_MAX_WIDTH,
    maxHeight: DRAFT_BANNER_MAX_HEIGHT,
    maxBytes: DRAFT_BANNER_MAX_BYTES,
  },
  thumbnail: {
    maxWidth: DRAFT_THUMB_MAX_WIDTH,
    maxHeight: DRAFT_THUMB_MAX_HEIGHT,
    maxBytes: DRAFT_THUMB_MAX_BYTES,
  },
};

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function describe(result: SaveResult, success: string): Status {
  return result.ok
    ? { tone: 'ok', text: success }
    : { tone: 'bad', text: SAVE_ERROR[result.reason] };
}

export default function AdminDrafts() {
  const { events, setRailName, setTitle, setBanner, setThumbnail, resetEvent, resetAll, hasOverrides } =
    useDraft();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const report = (id: string, value: Status) =>
    setStatus((current) => ({ ...current, [id]: value }));

  async function upload(id: string, slot: Slot, file: File | undefined) {
    if (!file) return;
    const key = `${id}:${slot}`;
    setBusy(key);
    report(id, null);

    const encoded = await encodeUploadedImage(file, BUDGETS[slot]);
    if (!encoded.ok || !encoded.dataUrl) {
      report(id, { tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      setBusy(null);
      return;
    }

    const result = slot === 'banner' ? setBanner(id, encoded.dataUrl) : setThumbnail(id, encoded.dataUrl);
    report(id, describe(result, `เปลี่ยนรูปแล้ว (${Math.round(encoded.bytes / 1024)} KB)`));
    setBusy(null);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          แก้ชื่อ หัวข้อ แบนเนอร์ และรูปย่อของดราฟต์ทั้ง {events.length} รายการ ·
          รูปจะถูกย่อและบีบอัดอัตโนมัติก่อนเก็บ
        </p>
        <button
          type="button"
          className={styles.reset}
          onClick={() => setStatus({ all: describe(resetAll(), 'คืนค่าเริ่มต้นแล้ว') })}
          disabled={!hasOverrides}
        >
          คืนค่าเริ่มต้นทั้งหมด
        </button>
      </div>

      <div className={styles.list}>
        {events.map((event) => {
          const changed =
            event.railNameOverridden ||
            event.titleOverridden ||
            event.bannerOverridden ||
            event.thumbnailOverridden;
          const current = status[event.id];

          return (
            <div key={event.id} className={`${styles.row} ${changed ? styles.rowChanged : ''}`}>
              <div className={styles.previews}>
                <img className={styles.banner} src={event.banner} alt="" />
                <div className={styles.thumbRow}>
                  <img className={styles.thumb} src={event.thumbnail} alt="" />
                  <div className={styles.uploads}>
                    {(['banner', 'thumbnail'] as Slot[]).map((slot) => (
                      <span key={slot}>
                        <input
                          ref={(element) => {
                            inputs.current[`${event.id}:${slot}`] = element;
                          }}
                          className={styles.hiddenInput}
                          type="file"
                          accept="image/*"
                          onChange={(changeEvent) => {
                            void upload(event.id, slot, changeEvent.target.files?.[0]);
                            // Lets the same file be picked again after a failure.
                            changeEvent.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          className={styles.action}
                          disabled={busy === `${event.id}:${slot}`}
                          onClick={() => inputs.current[`${event.id}:${slot}`]?.click()}
                        >
                          {busy === `${event.id}:${slot}`
                            ? 'กำลังแปลง…'
                            : slot === 'banner'
                              ? 'เปลี่ยนแบนเนอร์'
                              : 'เปลี่ยนรูปย่อ'}
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.fields}>
                <span className={styles.label}>ชื่อในเมนูซ้าย</span>
                <input
                  className={styles.input}
                  value={event.railName}
                  maxLength={NAME_MAX_LENGTH}
                  aria-label={`ชื่อในเมนูของ ${event.id}`}
                  onChange={(changeEvent) => {
                    const result = setRailName(event.id, changeEvent.target.value);
                    report(event.id, result.ok ? null : describe(result, ''));
                  }}
                />

                <span className={styles.label}>หัวข้อบนหน้าจอ</span>
                <input
                  className={styles.input}
                  value={event.title}
                  maxLength={TITLE_MAX_LENGTH}
                  aria-label={`หัวข้อของ ${event.id}`}
                  onChange={(changeEvent) => {
                    const result = setTitle(event.id, changeEvent.target.value);
                    report(event.id, result.ok ? null : describe(result, ''));
                  }}
                />

                <div className={styles.thumbRow}>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={!changed}
                    onClick={() =>
                      report(event.id, describe(resetEvent(event.id), 'คืนค่าเริ่มต้นแล้ว'))
                    }
                  >
                    คืนค่าเริ่มต้น
                  </button>
                  <span
                    className={`${styles.status} ${current?.tone === 'ok' ? styles.ok : styles.bad}`}
                  >
                    {current?.text ?? ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
