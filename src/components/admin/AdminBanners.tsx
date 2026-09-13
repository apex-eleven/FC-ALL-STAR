import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  BANNER_MAX_BYTES,
  BANNER_MAX_HEIGHT,
  BANNER_MAX_WIDTH,
  HEADING_MAX_LENGTH,
} from '@/features/news/constants';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import { useNews } from '@/features/news/NewsContext';
import type { SaveResult } from '@/features/news/newsConfigStore';
import styles from './AdminBanners.module.css';

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'decode-failed': 'เปิดไฟล์รูปไม่ได้ ลองไฟล์อื่น',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
  'too-large-to-store': 'รูปใหญ่เกินกว่าจะเก็บได้ ลองรูปที่เล็กลงหรือความละเอียดต่ำกว่านี้',
};

const SAVE_ERROR: Record<'quota' | 'unavailable', string> = {
  quota: 'พื้นที่เก็บข้อมูลเต็ม ลองล้างรูปของสไลด์อื่นก่อน',
  unavailable: 'เบราว์เซอร์บล็อกการบันทึก',
};

type Status = { tone: 'ok' | 'bad'; text: string } | null;

function describe(result: SaveResult, success: string): Status {
  return result.ok
    ? { tone: 'ok', text: success }
    : { tone: 'bad', text: SAVE_ERROR[result.reason] };
}

function formatKB(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Banner headings and artwork are game configuration, not player data: one setting
 * applies to every account in the browser.
 */
export default function AdminBanners() {
  const {
    slides,
    setHeading,
    setArtwork,
    createSlide,
    deleteSlide,
    removedSlides,
    restoreSlide,
    atLimit,
    resetSlide,
    resetAll,
    hasOverrides,
  } = useNews();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newHeading, setNewHeading] = useState('');
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const report = (id: string, value: Status) =>
    setStatus((current) => ({ ...current, [id]: value }));

  async function upload(id: string, file: File | undefined) {
    if (!file) return;
    setBusy(id);
    report(id, null);

    const encoded = await encodeUploadedImage(file, {
      maxWidth: BANNER_MAX_WIDTH,
      maxHeight: BANNER_MAX_HEIGHT,
      maxBytes: BANNER_MAX_BYTES,
    });
    if (!encoded.ok || !encoded.dataUrl) {
      report(id, { tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      setBusy(null);
      return;
    }

    report(id, describe(setArtwork(id, encoded.dataUrl), `เปลี่ยนรูปแล้ว (${formatKB(encoded.bytes)})`));
    setBusy(null);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          แก้หัวข้อและรูปของแบนเนอร์ได้ทั้ง {slides.length} สไลด์ · รูปจะถูกย่อและบีบอัดอัตโนมัติก่อนเก็บ
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

      <div className={styles.createRow}>
        <input
          className={styles.input}
          placeholder="หัวข้อแบนเนอร์ใหม่"
          value={newHeading}
          maxLength={HEADING_MAX_LENGTH}
          onChange={(event) => setNewHeading(event.target.value)}
        />
        <button
          type="button"
          className={styles.action}
          disabled={atLimit}
          onClick={() => {
            const { result, id } = createSlide(newHeading);
            setStatus({
              [id ?? 'all']: result.ok
                ? { tone: 'ok', text: 'เพิ่มแบนเนอร์แล้ว — เลือกรูปให้มันด้วย' }
                : { tone: 'bad', text: atLimit ? 'ใส่ได้สูงสุด 8 แบนเนอร์' : SAVE_ERROR[result.reason] },
            });
            setNewHeading('');
          }}
        >
          เพิ่มแบนเนอร์
        </button>
        {status.all?.text && (
          <span className={`${styles.status} ${status.all.tone === 'ok' ? styles.ok : styles.bad}`}>
            {status.all.text}
          </span>
        )}
      </div>

      {removedSlides.length > 0 && (
        <div className={styles.createRow}>
          <span className={styles.label}>แบนเนอร์ที่ลบไปแล้ว ({removedSlides.length})</span>
          {/* Catalogue slides ship in code and cannot be erased at runtime, so a
              deleted one is remembered as deleted — and can be brought back. */}
          {removedSlides.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.action}
              onClick={() => setStatus({ all: describe(restoreSlide(id), 'คืนค่าแบนเนอร์แล้ว') })}
            >
              คืนค่า {id}
            </button>
          ))}
        </div>
      )}

      <div className={styles.list}>
        {slides.map((slide) => {
          const changed = slide.headingOverridden || slide.artworkOverridden;
          const current = status[slide.id];

          return (
            <div
              key={slide.id}
              className={`${styles.row} ${changed ? styles.rowChanged : ''}`}
            >
              <div className={styles.preview}>
                {slide.artwork ? (
                  <img className={styles.previewImage} src={slide.artwork} alt="" />
                ) : (
                  <span className={styles.previewEmpty}>ยังไม่มีรูป</span>
                )}
                <span className={styles.previewStrip}>{slide.heading}</span>
              </div>

              <div className={styles.fields}>
                <span className={styles.labelRow}>
                  <span className={styles.label}>หัวข้อ</span>
                  <span className={styles.counter}>
                    {[...slide.heading].length}/{HEADING_MAX_LENGTH}
                  </span>
                </span>
                <input
                  className={styles.input}
                  value={slide.heading}
                  maxLength={HEADING_MAX_LENGTH}
                  aria-label={`หัวข้อสไลด์ ${slide.id}`}
                  onChange={(event) => {
                    // Typing is frequent, so only failures are surfaced — a success
                    // toast on every keystroke would be noise.
                    const result = setHeading(slide.id, event.target.value);
                    report(slide.id, result.ok ? null : describe(result, ''));
                  }}
                />

                <div className={styles.actions}>
                  <input
                    ref={(element) => {
                      inputs.current[slide.id] = element;
                    }}
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void upload(slide.id, event.target.files?.[0]);
                      // Lets the same file be picked again after a failed attempt.
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className={styles.action}
                    disabled={busy === slide.id}
                    onClick={() => inputs.current[slide.id]?.click()}
                  >
                    {busy === slide.id ? 'กำลังแปลงรูป…' : 'เลือกรูป'}
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={!changed}
                    onClick={() =>
                      report(slide.id, describe(resetSlide(slide.id), 'คืนค่าเริ่มต้นแล้ว'))
                    }
                  >
                    คืนค่าเริ่มต้น
                  </button>

                  {confirmDelete === slide.id ? (
                    <>
                      <button
                        type="button"
                        className={styles.action}
                        data-sound="back"
                        onClick={() => {
                          setConfirmDelete(null);
                          setStatus({ all: describe(deleteSlide(slide.id), 'ลบแบนเนอร์แล้ว') });
                        }}
                      >
                        ยืนยันลบ
                      </button>
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() => setConfirmDelete(null)}
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.action}
                      aria-label={`ลบแบนเนอร์ ${slide.heading}`}
                      onClick={() => setConfirmDelete(slide.id)}
                    >
                      <Trash2 size={16} strokeWidth={2.4} />
                    </button>
                  )}

                  {current?.text && (
                    <span
                      className={`${styles.status} ${current.tone === 'ok' ? styles.ok : styles.bad}`}
                    >
                      {current.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
