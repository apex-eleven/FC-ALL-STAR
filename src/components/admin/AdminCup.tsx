import { useState } from 'react';
import { currencyList } from '@/data/mock/currencies';
import { useCup } from '@/features/cup/CupContext';
import {
  CUP_BACKGROUND_IMAGE,
  CUP_LABEL,
  CUP_SIZES,
  CUP_TROPHY_IMAGE,
  MAX_BAND_TOKENS,
  MAX_ENTRIES,
  MAX_ROUND_REWARDS,
  isTitleBand,
  roundCount,
} from '@/features/cup/constants';
import type { CupCompetition, CupConfig, CupKind, CupRoundReward } from '@/features/cup/types';
import { encodeUploadedImage } from '@/lib/imageEncoding';
import type { ShopReward } from '@/features/shop/types';
import AdminCupShop from './AdminCupShop';
import AdminRewardList from './AdminRewardList';
import styles from './AdminCup.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/** Currencies an entry may be charged in. Matches `CupCompetition.entryCurrency`. */
const ENTRY_CURRENCIES = ['ticket', 'gem', 'fcpoint', 'exchange'] as const;

export default function AdminCup() {
  const { config, replace, reset, state } = useCup();
  const [status, setStatus] = useState<Status>(null);
  const [tab, setTab] = useState<CupKind>('daily');
  // The shop is its own page of settings, not a third competition.
  const [shopTab, setShopTab] = useState(false);

  function apply(next: CupConfig, message = 'บันทึกแล้ว') {
    const result = replace(next);
    setStatus(
      result.ok
        ? { tone: 'ok', text: message }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(kind: CupKind, changes: Partial<CupCompetition>, message?: string) {
    apply({ ...config, [kind]: { ...config[kind], ...changes } }, message);
  }

  function number(raw: string, fallback: number): number {
    const value = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(value) ? value : fallback;
  }

  async function upload(kind: CupKind, field: 'background' | 'trophy', file: File | undefined) {
    if (!file) return;
    const budget = field === 'background' ? CUP_BACKGROUND_IMAGE : CUP_TROPHY_IMAGE;
    const encoded = await encodeUploadedImage(file, budget);
    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: 'ไฟล์รูปใหญ่เกินไปหรืออ่านไม่ได้' });
      return;
    }
    patch(kind, { [field]: encoded.dataUrl }, 'อัปโหลดรูปแล้ว');
  }

  const competition = config[tab];
  const rounds = roundCount(competition.size);

  function patchBand(index: number, changes: Partial<CupRoundReward>) {
    const rewards = competition.rewards.map((band, i) =>
      i === index ? { ...band, ...changes } : band,
    );
    patch(tab, { rewards });
  }

  function addBand() {
    if (competition.rewards.length >= MAX_ROUND_REWARDS) return;
    const used = new Set(competition.rewards.map((band) => band.wins));
    let wins = 1;
    while (used.has(wins) && wins <= 8) wins += 1;
    patch(tab, {
      rewards: [...competition.rewards, { wins, rewards: [] as ShopReward[], tokens: 0 }].sort(
        (a, b) => a.wins - b.wins,
      ),
    });
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ฟุตบอลถ้วยแบบแพ้ตกรอบ แทนที่ลีกประจำวันเดิม · คู่แข่งดึงจากทีมตัวจริงที่ผู้เล่นคนอื่นเผยแพร่ไว้
        เติมด้วยทีมจำลองเมื่อคนไม่พอ · ค่าที่ตั้งที่นี่มีผลกับทุกไอดี
      </p>

      <div className={styles.head}>
        <div className={styles.tabs}>
          {(['daily', 'weekend'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`${styles.tab} ${!shopTab && tab === kind ? styles.tabOn : ''}`}
              onClick={() => {
                setTab(kind);
                setShopTab(false);
              }}
            >
              {config[kind].name || CUP_LABEL[kind]}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.tab} ${shopTab ? styles.tabOn : ''}`}
            onClick={() => setShopTab(true)}
          >
            ร้าน Cup Token
          </button>
        </div>

        <div className={styles.line}>
          <span className={styles.lineLabel}>เปิดทั้งระบบ</span>
          <button
            type="button"
            data-sound="toggle"
            aria-pressed={config.enabled}
            className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
            onClick={() =>
              apply(
                { ...config, enabled: !config.enabled },
                config.enabled ? 'ปิดฟุตบอลถ้วยแล้ว' : 'เปิดฟุตบอลถ้วยแล้ว',
              )
            }
          >
            {config.enabled ? 'เปิด' : 'ปิด'}
          </button>
        </div>

        {status && (
          <span className={status.tone === 'ok' ? styles.ok : styles.bad}>{status.text}</span>
        )}
      </div>

      {shopTab ? (
        <AdminCupShop config={config} apply={apply} />
      ) : (
      <div className={styles.columns}>
        {/* ---- the competition ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>รายการนี้</h3>

          <div className={styles.line}>
            <span className={styles.lineLabel}>เปิดรายการ</span>
            <button
              type="button"
              data-sound="toggle"
              aria-pressed={competition.enabled}
              className={`${styles.toggle} ${competition.enabled ? styles.toggleOn : ''}`}
              onClick={() => patch(tab, { enabled: !competition.enabled })}
            >
              {competition.enabled ? 'เปิด' : 'ปิด'}
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>ชื่อรายการ</span>
            <input
              className={styles.input}
              value={competition.name}
              onChange={(event) => patch(tab, { name: event.target.value })}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>ขนาดสาย</span>
            <div className={styles.chips}>
              {CUP_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`${styles.chip} ${competition.size === size ? styles.chipOn : ''}`}
                  onClick={() => patch(tab, { size })}
                >
                  {size} ทีม
                </button>
              ))}
            </div>
            <span className={styles.hint}>
              {competition.size} ทีม = ชนะ {rounds} นัดถึงแชมป์
            </span>
          </div>

          <div className={styles.pair}>
            <div className={styles.field}>
              <span className={styles.label}>ค่าสมัคร</span>
              <input
                className={styles.input}
                value={competition.entryCost}
                inputMode="numeric"
                onChange={(event) =>
                  patch(tab, { entryCost: number(event.target.value, competition.entryCost) })
                }
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>จ่ายด้วย</span>
              <select
                className={styles.input}
                value={competition.entryCurrency}
                onChange={(event) =>
                  patch(tab, {
                    entryCurrency: event.target.value as CupCompetition['entryCurrency'],
                  })
                }
              >
                {ENTRY_CURRENCIES.map((kind) => (
                  <option key={kind} value={kind}>
                    {currencyList.find((entry) => entry.kind === kind)?.label ?? kind}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.pair}>
            <div className={styles.field}>
              <span className={styles.label}>สมัครได้กี่ครั้งต่อรอบ</span>
              <input
                className={styles.input}
                value={competition.entries}
                inputMode="numeric"
                onChange={(event) =>
                  patch(tab, { entries: number(event.target.value, competition.entries) })
                }
              />
              <span className={styles.hint}>สูงสุด {MAX_ENTRIES}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>ช่วง OVR ทีมจำลอง (±)</span>
              <input
                className={styles.input}
                value={competition.botSpread}
                inputMode="numeric"
                onChange={(event) =>
                  patch(tab, { botSpread: number(event.target.value, competition.botSpread) })
                }
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>เปิดวันไหนบ้าง</span>
            <div className={styles.chips}>
              {DAY_NAMES.map((name, day) => {
                const on = competition.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                    onClick={() =>
                      patch(tab, {
                        days: on
                          ? competition.days.filter((entry) => entry !== day)
                          : [...competition.days, day].sort((a, b) => a - b),
                      })
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <span className={styles.hint}>
              {competition.days.length === 0
                ? 'ไม่เลือกเลย = เปิดทุกวัน'
                : 'วันที่ติดกันนับเป็นรอบเดียว — สิทธิ์สมัครไม่รีเซ็ตระหว่างวัน'}
            </span>
          </div>

          <div className={styles.pair}>
            <div className={styles.field}>
              <span className={styles.label}>รีเซ็ตตอนกี่โมง</span>
              <input
                className={styles.input}
                value={config.resetHour}
                inputMode="numeric"
                onChange={(event) =>
                  apply({ ...config, resetHour: number(event.target.value, config.resetHour) })
                }
              />
              <span className={styles.hint}>0–23 น.</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>ดูสด 90 นาทีกี่วินาที</span>
              <input
                className={styles.input}
                value={config.matchSeconds}
                inputMode="numeric"
                onChange={(event) =>
                  apply({ ...config, matchSeconds: number(event.target.value, config.matchSeconds) })
                }
              />
              <span className={styles.hint}>ที่ความเร็ว x1</span>
            </div>
          </div>

          <div className={styles.pair}>
            <label className={styles.upload}>
              พื้นหลังหน้าจอ
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void upload(tab, 'background', event.target.files?.[0])}
              />
            </label>
            <label className={styles.upload}>
              รูปถ้วยรางวัล
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void upload(tab, 'trophy', event.target.files?.[0])}
              />
            </label>
          </div>
          <span className={styles.hint}>
            ไม่อัปโหลด = ใช้ <code>/brand/cup_background.jpg</code> และถ้วยที่วาดด้วยโค้ด ·
            รูปถูกย่อให้ไม่เกิน {Math.round(CUP_BACKGROUND_IMAGE.maxBytes / 1000)} KB (พื้นหลัง) และ{' '}
            {Math.round(CUP_TROPHY_IMAGE.maxBytes / 1000)} KB (ถ้วย)
          </span>
        </div>

        {/* ---- rewards ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>รางวัลตามรอบที่ไปถึง</h3>
          <p className={styles.note}>
            ตั้งตามจำนวนนัดที่ชนะ ไม่ใช่ชื่อรอบ — เปลี่ยนขนาดสายทีหลังแล้วรางวัลจะไม่เลื่อนไปผิดรอบ
            · ชนะครบ {rounds} นัดคือแชมป์ · รางวัลรอบก่อนแชมป์จ่ายทันทีที่ชนะ รางวัลแชมป์ผู้เล่นต้องกดรับเอง
            · Cup Token เก็บสะสมไว้บนบัญชี (ยังไม่มีร้านให้ใช้)
          </p>

          <div className={styles.bands}>
            {competition.rewards.map((band, index) => (
              <div key={index} className={styles.band}>
                <div className={styles.bandHead}>
                  <span className={styles.label}>ชนะ</span>
                  <input
                    className={styles.numSmall}
                    value={band.wins}
                    inputMode="numeric"
                    onChange={(event) =>
                      patchBand(index, { wins: Math.max(1, number(event.target.value, band.wins)) })
                    }
                  />
                  <span className={styles.hint}>
                    นัด{isTitleBand(band.wins, competition.size) ? ' · แชมป์ (ผู้เล่นกด CLAIM REWARD เอง)' : ''}
                  </span>
                  <span className={styles.label}>Cup Token</span>
                  <input
                    className={styles.numSmall}
                    value={band.tokens}
                    inputMode="numeric"
                    onChange={(event) =>
                      patchBand(index, {
                        tokens: Math.min(MAX_BAND_TOKENS, number(event.target.value, band.tokens)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() =>
                      patch(tab, { rewards: competition.rewards.filter((_, i) => i !== index) })
                    }
                  >
                    ลบ
                  </button>
                </div>
                <AdminRewardList
                  rewards={band.rewards}
                  onChange={(next) => patchBand(index, { rewards: next })}
                />
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.ghost}
              onClick={addBand}
              disabled={competition.rewards.length >= MAX_ROUND_REWARDS}
            >
              + เพิ่มรอบรางวัล
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                reset();
                setStatus({ tone: 'ok', text: 'คืนค่าเริ่มต้นแล้ว' });
              }}
            >
              คืนค่าเริ่มต้นทั้งหมด
            </button>
          </div>

          {state && (
            <p className={styles.note}>
              ไอดีนี้: ใช้สิทธิ์ไปแล้ว {state.used[tab] ?? 0} ครั้งในรอบนี้ · ถ้วยที่ได้{' '}
              {state.trophies[tab] ?? 0} ใบ · Cup Token {state.tokens}
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
