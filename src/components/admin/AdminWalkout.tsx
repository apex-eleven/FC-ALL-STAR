import { useRef, useState } from 'react';
import walkoutClip from '@/assets/video/walkout.mp4';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { CLIP_DURATION } from '@/features/walkout/constants';
import { useWalkout } from '@/features/walkout/WalkoutContext';
import type { WalkoutConfig } from '@/features/walkout/types';
import styles from './AdminWalkout.module.css';

interface BeatField {
  key: 'nationAt' | 'positionAt' | 'clubAt';
  label: string;
  short: string;
}

const BEATS: BeatField[] = [
  { key: 'nationAt', label: 'โชว์ธงชาติที่วินาที', short: 'ธง' },
  { key: 'positionAt', label: 'โชว์ตำแหน่งที่วินาที', short: 'ตำแหน่ง' },
  { key: 'clubAt', label: 'โชว์สโมสรที่วินาที', short: 'สโมสร' },
];

/**
 * Walkout tuning. Covers timings, the loop point and the trigger, not the video
 * file itself: a 9 MB clip cannot live in localStorage or a 1 MB settings document,
 * so replacing the footage is a file swap in src/assets/video/ rather than an upload.
 *
 * The loop point is picked by watching: the preview player here is the real clip,
 * and "use this moment" takes whatever frame it is sitting on.
 */
export default function AdminWalkout() {
  const { config, update, reset, isDefault } = useWalkout();
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(CLIP_DURATION);
  const [cursor, setCursor] = useState(0);

  const report = (result: { ok: boolean }) =>
    setError(result.ok ? null : 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลอาจเต็ม');

  function setNumber(key: keyof WalkoutConfig, raw: string, decimals = false) {
    if (raw === '') return;
    const value = decimals ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) return;
    report(update({ [key]: value } as Partial<WalkoutConfig>));
  }

  const beatsOutOfOrder =
    config.nationAt > config.positionAt || config.positionAt > config.clubAt;
  // A fact timed after the loop point never shows: the intro is over by then.
  const beatsTooLate = BEATS.some((beat) => config[beat.key] > config.loopStart);
  const loopTooLate = config.loopStart > duration - 0.5;

  /** Takes whatever frame the preview is sitting on. */
  function takeCursor() {
    const video = previewRef.current;
    if (!video) return;
    report(update({ loopStart: Math.round(video.currentTime * 100) / 100 }));
  }

  /**
   * Jumps the preview to a second before the end and plays, so the seam can be
   * watched: it runs out, jumps back to the loop point, and keeps going.
   */
  function watchSeam() {
    const video = previewRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, duration - 1.5);
    void video.play().catch(() => undefined);
  }

  /** The preview loops the same way the real overlay does, so the seam here is honest. */
  function onPreviewTime() {
    const video = previewRef.current;
    if (!video) return;
    setCursor(video.currentTime);
    if (!video.paused && video.currentTime >= duration - 1 / 60) {
      video.currentTime = Math.min(config.loopStart, duration - 0.5);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          ตั้งค่าแอนิเมชัน walkout · คลิปเดียวยาว {duration.toFixed(2)} วินาที · เล่นช่วงแรกครั้งเดียว
          แล้ววนลูปตั้งแต่จุดที่เลือกจนจบคลิป
        </p>
        <button type="button" className={styles.reset} onClick={() => report(reset())} disabled={isDefault}>
          คืนค่าเริ่มต้น
        </button>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>เงื่อนไขการเล่น</h3>

        <div className={styles.line}>
          <span className={styles.lineLabel}>เปิดใช้งาน</span>
          <button
            type="button"
            aria-pressed={config.enabled}
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() => report(update({ enabled: !config.enabled }))}
          >
            <span className={styles.dot} />
            {config.enabled ? 'เปิด' : 'ปิด'}
          </button>
        </div>

        <div className={styles.line}>
          <span className={styles.lineLabel}>เล่นเมื่อได้ชุด</span>
          <span className={styles.chips}>
            {PLAYER_SETS.map((set) => {
              const on = config.sets.includes(set);
              return (
                <button
                  key={set}
                  type="button"
                  data-sound="toggle"
                  aria-pressed={on}
                  className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                  onClick={() =>
                    report(
                      update({
                        sets: on
                          ? config.sets.filter((entry) => entry !== set)
                          : ([...config.sets, set] as PlayerSet[]),
                      }),
                    )
                  }
                >
                  ชุด {set}
                </button>
              );
            })}
          </span>
          <span className={styles.unit}>
            {config.sets.length === 0 ? 'ไม่เลือกเลย = ทุกชุดผ่านเงื่อนไขนี้' : ''}
          </span>
        </div>

        <div className={styles.line}>
          <span className={styles.lineLabel}>ใช้เงื่อนไข OVR ด้วย</span>
          <button
            type="button"
            data-sound="toggle"
            aria-pressed={config.useMinRating}
            className={`${styles.toggle} ${config.useMinRating ? styles.toggleOn : ''}`}
            onClick={() => report(update({ useMinRating: !config.useMinRating }))}
          >
            <span className={styles.dot} />
            {config.useMinRating ? 'ใช้' : 'ไม่ใช้'}
          </button>
          <input
            className={styles.num}
            value={config.minRating}
            inputMode="numeric"
            disabled={!config.useMinRating}
            aria-label="เรตติ้งขั้นต่ำ"
            onChange={(event) => setNumber('minRating', event.target.value.replace(/[^\d]/g, ''))}
          />
          <span className={styles.unit}>ขึ้นไป</span>
        </div>

        <div className={styles.line}>
          <span className={styles.lineLabel}>ปิดอัตโนมัติหลังจาก</span>
          <input
            className={styles.num}
            value={config.autoCloseSeconds}
            inputMode="numeric"
            aria-label="ปิดอัตโนมัติ"
            onChange={(event) =>
              setNumber('autoCloseSeconds', event.target.value.replace(/[^\d]/g, ''))
            }
          />
          <span className={styles.unit}>วินาที · ใส่ 0 = วนลูปจนกว่าจะกดออก</span>
        </div>

        <p className={styles.legend}>
          เงื่อนไขสองอันนี้ต้องผ่าน<strong>ทั้งคู่</strong> — เลือก "ชุด A" อย่างเดียวคือทุกใบชุด A
          ได้ walkout ไม่ว่า OVR เท่าไหร่ · เปิด OVR ด้วยคือต้องเป็นชุด A และถึงเลขนั้นด้วย
          <br />
          สุ่มทีละ 10 ใบแล้วเข้าเงื่อนไขหลายใบ จะเล่น walkout ให้ใบที่ OVR สูงสุดใบเดียว
          ไม่งั้นต้องนั่งดูวิดีโอนานถึง 70 วินาทีกว่าจะเห็นว่าได้อะไรบ้าง
        </p>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>จุดเริ่มวนลูป</h3>

        <video
          ref={previewRef}
          className={styles.preview}
          src={walkoutClip}
          controls
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const length = event.currentTarget.duration;
            if (Number.isFinite(length)) setDuration(length);
          }}
          onTimeUpdate={onPreviewTime}
        />

        <div className={styles.line}>
          <span className={styles.lineLabel}>วนลูปตั้งแต่วินาที</span>
          <input
            className={styles.num}
            value={config.loopStart}
            inputMode="decimal"
            aria-label="จุดเริ่มวนลูป"
            onChange={(event) =>
              setNumber('loopStart', event.target.value.replace(/[^\d.]/g, ''), true)
            }
          />
          <span className={styles.unit}>วินาที</span>
          <button type="button" className={styles.reset} onClick={takeCursor}>
            ใช้เวลาที่หยุดไว้ ({cursor.toFixed(2)}s)
          </button>
          <button type="button" className={styles.reset} onClick={watchSeam}>
            ดูตรงรอยต่อ
          </button>
        </div>

        <p className={styles.legend}>
          เลื่อนตัวเล่นข้างบนไปเฟรมที่ต้องการแล้วกด "ใช้เวลาที่หยุดไว้" · กด "ดูตรงรอยต่อ"
          เพื่อดูว่าตอนจบคลิปแล้วกระโดดกลับมาเนียนไหม — ตัวเล่นนี้วนลูปแบบเดียวกับของจริง
          <br />
          จุดที่ตรงกับ keyframe จะวนได้เนียนที่สุด คลิปที่ใส่ไว้ตอนนี้มี keyframe ที่
          3.86 · 5.52 · 6.94 · <strong>7.08</strong> · 11.30 · 15.47 · 19.63 · 23.80 · 27.97
          (7.08 คือรอยต่อเดิมระหว่างสองคลิป) จุดอื่นใช้ได้เหมือนกันแต่อาจกระตุกนิดหน่อยบนมือถือ
        </p>

        <div className={styles.timeline}>
          {/* The intro is everything before the loop point; the loop is the rest. */}
          <span
            className={styles.flash}
            style={{
              left: `${(Math.min(config.loopStart, duration) / duration) * 100}%`,
              width: `${(Math.max(0, duration - config.loopStart) / duration) * 100}%`,
            }}
          />
          {BEATS.map((beat) => (
            <span
              key={beat.key}
              className={styles.marker}
              style={{ left: `${(Math.min(config[beat.key], duration) / duration) * 100}%` }}
            >
              <span className={styles.markerLabel}>{beat.short}</span>
            </span>
          ))}
        </div>
        <p className={styles.legend}>แถบสว่างคือช่วงที่วนลูป · หมุดคือจังหวะที่โชว์ข้อมูลนักเตะ</p>

        {loopTooLate && (
          <p className={styles.warn}>
            จุดเริ่มวนลูปชิดท้ายคลิปเกินไป — ระบบจะถอยมาให้เหลือช่วงวนอย่างน้อยครึ่งวินาที
          </p>
        )}
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>จังหวะโชว์ข้อมูลนักเตะ</h3>

        {BEATS.map((beat) => (
          <div className={styles.line} key={beat.key}>
            <span className={styles.lineLabel}>{beat.label}</span>
            <input
              className={styles.num}
              value={config[beat.key]}
              inputMode="decimal"
              aria-label={beat.label}
              onChange={(event) =>
                setNumber(beat.key, event.target.value.replace(/[^\d.]/g, ''), true)
              }
            />
            <span className={styles.unit}>วินาที</span>
          </div>
        ))}

        {beatsOutOfOrder && (
          <p className={styles.warn}>
            ลำดับเวลาไม่เรียง — ธงควรมาก่อนตำแหน่ง และตำแหน่งมาก่อนสโมสร
          </p>
        )}
        {beatsTooLate && (
          <p className={styles.warn}>
            มีจังหวะที่ตั้งไว้หลังจุดเริ่มวนลูป จังหวะนั้นจะไม่โชว์ เพราะช่วงแรกจบไปแล้ว
          </p>
        )}
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>ไฟล์วิดีโอ</h3>
        <p className={styles.legend}>
          เปลี่ยนคลิปได้โดยวางไฟล์ทับที่ <code>src/assets/video/walkout.mp4</code> ชื่อเดิม
          <br />
          ไม่ได้ทำเป็นปุ่มอัปโหลดเพราะไฟล์ขนาดราว 9 MB ซึ่งเกินพื้นที่เก็บค่าตั้งของเกม
          <br />
          เปลี่ยนคลิปแล้วให้กลับมาตั้งจุดเริ่มวนลูปใหม่ด้วยตัวเล่นข้างบน
        </p>
      </div>

      {error && <span className={styles.status}>{error}</span>}
    </div>
  );
}
