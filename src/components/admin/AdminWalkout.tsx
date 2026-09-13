import { useState } from 'react';
import { PLAYER_SETS, type PlayerSet } from '@/features/draft/types';
import { FLASH_START, FLIGHT_DURATION } from '@/features/walkout/constants';
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
 * Walkout tuning. Deliberately covers timings and the trigger rating, not the video
 * files: an 11 MB clip cannot live in localStorage, so replacing the footage is a
 * file swap in src/assets/video/ rather than an upload.
 */
export default function AdminWalkout() {
  const { config, update, reset, isDefault } = useWalkout();
  const [error, setError] = useState<string | null>(null);

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
  const beatsTooLate = BEATS.some(
    (beat) => config[beat.key] > FLIGHT_DURATION - config.crossfade,
  );
  const crossfadeTooLong = config.crossfade > FLIGHT_DURATION - FLASH_START;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.note}>
          ตั้งค่าแอนิเมชัน walkout · คลิปแรกยาว {FLIGHT_DURATION} วินาที คลิปที่สองวนลูป
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
        <h3 className={styles.blockTitle}>จังหวะในคลิปแรก</h3>

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

        <div className={styles.line}>
          <span className={styles.lineLabel}>ครอสเฟดเข้าคลิปที่สอง</span>
          <input
            className={styles.num}
            value={config.crossfade}
            inputMode="decimal"
            aria-label="ครอสเฟด"
            onChange={(event) =>
              setNumber('crossfade', event.target.value.replace(/[^\d.]/g, ''), true)
            }
          />
          <span className={styles.unit}>
            วินาทีก่อนคลิปแรกจบ · แฟลชขาวเต็มที่กว้าง {(FLIGHT_DURATION - FLASH_START).toFixed(2)} วินาที
          </span>
        </div>

        <div className={styles.line}>
          <span className={styles.lineLabel}>เวลาเฟดแฟลชขาวออก</span>
          <input
            className={styles.num}
            value={config.flashOut}
            inputMode="decimal"
            aria-label="เฟดแฟลชออก"
            onChange={(event) =>
              setNumber('flashOut', event.target.value.replace(/[^\d.]/g, ''), true)
            }
          />
          <span className={styles.unit}>วินาที หลังจากตัดเข้าคลิปที่สอง</span>
        </div>

        <div className={styles.timeline}>
          {BEATS.map((beat) => (
            <span
              key={beat.key}
              className={styles.marker}
              style={{ left: `${(config[beat.key] / FLIGHT_DURATION) * 100}%` }}
            >
              <span className={styles.markerLabel}>{beat.short}</span>
            </span>
          ))}
          <span
            className={styles.flash}
            style={{ width: `${((FLIGHT_DURATION - FLASH_START) / FLIGHT_DURATION) * 100}%` }}
          />
        </div>
        <p className={styles.legend}>
          แถบขาวด้านขวาคือช่วงที่คลิปแรกขาวเต็มที่ วัดทีละเฟรมได้{' '}
          {(FLIGHT_DURATION - FLASH_START).toFixed(2)} วินาที (6.83–7.04s)
          คลิปที่สองต้องเริ่มเล่นภายในช่วงนี้เท่านั้น รอยต่อถึงจะมองไม่เห็น
        </p>

        {beatsOutOfOrder && (
          <p className={styles.warn}>
            ลำดับเวลาไม่เรียง — ธงควรมาก่อนตำแหน่ง และตำแหน่งมาก่อนสโมสร
          </p>
        )}
        {crossfadeTooLong && (
          <p className={styles.warn}>
            ครอสเฟดยาวเกินช่วงแฟลชขาว ({(FLIGHT_DURATION - FLASH_START).toFixed(2)} วินาที) —
            จะเริ่มเฟดตอนภาพยังไม่ขาว ทำให้เห็นรอยต่อ
          </p>
        )}
        {beatsTooLate && (
          <p className={styles.warn}>
            มีจังหวะที่ตั้งไว้ช้ากว่าตอนที่คลิปตัดไปคลิปที่สอง จังหวะนั้นจะไม่ทันโชว์
          </p>
        )}
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>ไฟล์วิดีโอ</h3>
        <p className={styles.legend}>
          เปลี่ยนคลิปได้โดยวางไฟล์ทับที่ <code>src/assets/video/walkout-flight.mp4</code> และ{' '}
          <code>walkout-stage.mp4</code> ชื่อเดิม
          <br />
          ไม่ได้ทำเป็นปุ่มอัปโหลดเพราะไฟล์รวมกัน 11 MB ซึ่งเกินโควตา localStorage
          ที่ระบบอื่นในเกมใช้เก็บข้อมูลอยู่
          <br />
          ถ้าเปลี่ยนคลิปแรกที่ความยาวไม่เท่าเดิม ต้องมาแก้ตัวเลขจังหวะข้างบนตามด้วย
        </p>
      </div>

      {error && <span className={styles.status}>{error}</span>}
    </div>
  );
}
