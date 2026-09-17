import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { currencyList } from '@/data/mock/currencies';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import type { CurrencyKind } from '@/features/currencies/types';
import {
  BACKGROUND_IMAGE,
  BANNER_IMAGE,
  FIGURE_IMAGE,
  IMAGE_BUDGET_WARN,
  MATCH_SECONDS_MAX,
  MATCH_SECONDS_MIN,
  MAX_BANNERS,
  MAX_MILESTONE_REWARDS,
  MAX_MILESTONES,
  MAX_TIER_STARS,
  MAX_TIERS,
  NAME_MAX,
  TIER_IMAGE,
  managerId,
} from '@/features/manager/constants';
import { currentState } from '@/features/manager/manager';
import { useManager } from '@/features/manager/ManagerContext';
import type {
  ManagerBanner,
  ManagerConfig,
  ManagerMilestone,
  ManagerTier,
} from '@/features/manager/types';
import { encodeUploadedImage, type EncodeOptions, type UploadedImageError } from '@/lib/imageEncoding';
import styles from './AdminManager.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไปแม้ย่อแล้ว ลองรูปที่เรียบกว่านี้',
  'decode-failed': 'เปิดรูปนี้ไม่ได้',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
};

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [entry] = next.splice(index, 1);
  next.splice(target, 0, entry!);
  return next;
}

/** Size of a data URL in bytes, near enough for a budget line. */
function bytesOf(dataUrl: string): number {
  return Math.round(dataUrl.length * 0.75);
}

/**
 * เมเนเจอร์โหมด settings: the screen's text and art, the season clock, the tier
 * ladder, the weekly win milestones, and a tool to set a player's rank by hand.
 */
export default function AdminManager() {
  const { config, replace, reset } = useManager();
  const { listAccounts, updateOther } = useAuth();
  // Edits build on the newest config — an upload resolves after an await, by which
  // time the render that started it may be stale.
  const latest = useRef(config);
  latest.current = config;
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [target, setTarget] = useState('');
  const [targetTier, setTargetTier] = useState(0);
  const [targetStars, setTargetStars] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listAccounts().then((list) => {
      if (!cancelled) setAccounts([...list].sort((a, b) => a.username.localeCompare(b.username)));
    });
    return () => {
      cancelled = true;
    };
  }, [listAccounts]);

  const imageBytes = useMemo(
    () =>
      [
        config.background,
        config.figure,
        ...config.tiers.map((tier) => tier.image),
        ...config.banners.map((banner) => banner.image),
      ].reduce((sum, value) => sum + bytesOf(value), 0),
    [config],
  );

  function commit(next: ManagerConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<ManagerConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchTier(id: string, changes: Partial<ManagerTier>) {
    patch({ tiers: latest.current.tiers.map((tier) => (tier.id === id ? { ...tier, ...changes } : tier)) });
  }

  function patchBanner(id: string, changes: Partial<ManagerBanner>) {
    patch({
      banners: latest.current.banners.map((banner) => (banner.id === id ? { ...banner, ...changes } : banner)),
    });
  }

  function patchMilestone(id: string, changes: Partial<ManagerMilestone>) {
    patch({
      milestones: latest.current.milestones.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    });
  }

  /** Encodes an upload, then hands the data URL to `apply` against the newest config. */
  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    options: EncodeOptions,
    apply: (dataUrl: string) => void,
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    const encoded = await encodeUploadedImage(file, options);
    setBusy(false);
    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    apply(encoded.dataUrl);
    setStatus({ tone: 'ok', text: `แนบรูปแล้ว (${Math.round(encoded.bytes / 1000)} KB)` });
  }

  function uploadButton(label: string, options: EncodeOptions, apply: (dataUrl: string) => void) {
    return (
      <label className={styles.ghost}>
        {busy ? 'กำลังแปลงรูป…' : label}
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={busy}
          onChange={(event) => void upload(event, options, apply)}
        />
      </label>
    );
  }

  async function setRank() {
    if (!target) return;
    const tier = Math.min(targetTier, config.tiers.length - 1);
    const stars = Math.min(targetStars, config.tiers[tier]?.stars ?? 0);
    setBusy(true);
    const saved = await updateOther(target, (current) => ({
      ...current,
      manager: { ...currentState(current.manager, config, new Date()), tier, stars },
    }));
    setBusy(false);
    setStatus(
      saved
        ? { tone: 'ok', text: `ตั้งแรงค์ ${target} เป็น ${config.tiers[tier]?.name} ${stars} ดาวแล้ว` }
        : { tone: 'bad', text: 'หาไอดีไม่เจอหรือบันทึกไม่สำเร็จ' },
    );
  }

  async function resetWeek() {
    if (!target) return;
    setBusy(true);
    const saved = await updateOther(target, (current) => ({
      ...current,
      manager: { ...currentState(current.manager, config, new Date()), weekWins: 0, claimed: [] },
    }));
    setBusy(false);
    setStatus(
      saved
        ? { tone: 'ok', text: `ล้างชนะสะสมสัปดาห์นี้ของ ${target} แล้ว` }
        : { tone: 'bad', text: 'หาไอดีไม่เจอหรือบันทึกไม่สำเร็จ' },
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        เมเนเจอร์โหมด (ปุ่ม &quot;เล่น&quot; หน้าหลัก) · แข่งกับทีมผู้เล่นจริงที่ OVR ใกล้เคียง ถ้าไม่มีจะเจอบอท ·
        ชนะ +1 ดาว แพ้ -1 ดาว · รูปพื้นหลังและรูปนักเตะวางไฟล์ได้ที่ public/brand/manager_background.jpg
        และ manager_figure.png ถ้าไม่อัปโหลดที่นี่
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.columns}>
        {/* ---- general ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
          <div className={styles.line}>
            <button
              type="button"
              className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
              onClick={() => patch({ enabled: !config.enabled })}
            >
              {config.enabled ? 'เปิดโหมดอยู่' : 'ปิดโหมดอยู่'}
            </button>
          </div>
          <div className={styles.pair}>
            <label className={styles.field}>
              <span className={styles.label}>ชื่อหน้าจอ</span>
              <input
                className={styles.input}
                maxLength={NAME_MAX}
                value={config.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>คำโลโก้ตัวใหญ่</span>
              <input
                className={styles.input}
                maxLength={16}
                value={config.modeName}
                onChange={(event) => patch({ modeName: event.target.value })}
              />
            </label>
          </div>
          <div className={styles.pair}>
            <label className={styles.field}>
              <span className={styles.label}>ซีซั่นแรกเริ่มวันที่</span>
              <input
                className={styles.input}
                type="date"
                value={config.seasonAnchor}
                onChange={(event) => event.target.value && patch({ seasonAnchor: event.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>ซีซั่นละ (วัน)</span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={config.seasonDays}
                onChange={(event) => patch({ seasonDays: Math.max(1, whole(event.target.value)) })}
              />
            </label>
          </div>
          <div className={styles.triple}>
            <label className={styles.field}>
              <span className={styles.label}>ขึ้นซีซั่นใหม่ลดกี่แรงค์</span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={config.seasonDrop}
                onChange={(event) => patch({ seasonDrop: whole(event.target.value) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>รีเซ็ตเวลา (ชม.)</span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={config.resetHour}
                onChange={(event) => patch({ resetHour: Math.min(23, whole(event.target.value)) })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>บอท OVR ± </span>
              <input
                className={styles.input}
                inputMode="numeric"
                value={config.botSpread}
                onChange={(event) => patch({ botSpread: Math.min(40, whole(event.target.value)) })}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>
              ความยาวแมตช์ที่ความเร็ว x1 (วินาที {MATCH_SECONDS_MIN}–{MATCH_SECONDS_MAX})
            </span>
            <input
              className={styles.input}
              inputMode="numeric"
              defaultValue={config.matchSeconds}
              key={config.matchSeconds}
              // Committed on blur: typing "180" passes through "1" and "18", which the
              // normalizer would clamp up to the minimum.
              onBlur={(event) => patch({ matchSeconds: whole(event.target.value) })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>เงินที่แสดงมุมขวาบน</span>
            <select
              className={styles.input}
              value={config.headerCurrency}
              onChange={(event) => patch({ headerCurrency: event.target.value as CurrencyKind })}
            >
              {currencyList.map((currency) => (
                <option key={currency.kind} value={currency.kind}>
                  {currency.label}
                </option>
              ))}
            </select>
          </label>

          <span className={styles.label}>รูปพื้นหลัง / รูปนักเตะตรงกลาง</span>
          <div className={styles.artRow}>
            <div className={styles.artCol}>
              <span className={`${styles.art} ${styles.artWide}`}>
                {config.background ? <img src={config.background} alt="" /> : 'ใช้ไฟล์ใน public/brand'}
              </span>
              <div className={styles.line}>
                {uploadButton('อัปโหลดพื้นหลัง', BACKGROUND_IMAGE, (url) => patch({ background: url }))}
                {config.background && (
                  <button type="button" className={styles.danger} onClick={() => patch({ background: '' })}>
                    เอาออก
                  </button>
                )}
              </div>
            </div>
            <div className={styles.artCol}>
              <span className={`${styles.art} ${styles.artTall}`}>
                {config.figure ? <img src={config.figure} alt="" /> : 'ใช้ไฟล์'}
              </span>
              <div className={styles.line}>
                {uploadButton('อัปโหลดนักเตะ', FIGURE_IMAGE, (url) => patch({ figure: url }))}
                {config.figure && (
                  <button type="button" className={styles.danger} onClick={() => patch({ figure: '' })}>
                    เอาออก
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className={`${styles.legend} ${imageBytes > IMAGE_BUDGET_WARN ? styles.warnText : ''}`}>
            รูปทั้งหมดในโหมดนี้ {Math.round(imageBytes / 1000)} KB · ตั้งค่าเกมทั้งหมดรวมกันต้องไม่เกิน ~900 KB ·
            นักเตะใช้ PNG พื้นใสจะสวยสุด
          </p>
          <button
            type="button"
            className={styles.danger}
            onClick={() => {
              if (window.confirm('รีเซ็ตเมเนเจอร์โหมดกลับเป็นค่าเริ่มต้นทั้งหมด?')) {
                const result = reset();
                setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
              }
            }}
          >
            รีเซ็ตทั้งหมด
          </button>
        </div>

        {/* ---- tiers ---- */}
        <div className={styles.block}>
          <h3 className={styles.blockTitle}>แรงค์ (บนสุด = สูงสุด)</h3>
          {[...config.tiers].reverse().map((tier) => {
            const index = config.tiers.indexOf(tier);
            return (
              <div key={tier.id} className={styles.tier}>
                <span className={styles.tierArt}>
                  {tier.image ? <img src={tier.image} alt="" /> : <small>ไม่มีรูป</small>}
                </span>
                <div className={styles.tierFields}>
                  <input
                    className={styles.input}
                    maxLength={NAME_MAX}
                    value={tier.name}
                    onChange={(event) => patchTier(tier.id, { name: event.target.value })}
                  />
                  <div className={styles.line}>
                    <select
                      className={styles.input}
                      value={tier.stars}
                      onChange={(event) => patchTier(tier.id, { stars: Number(event.target.value) })}
                      title="จำนวนดาวของแรงค์นี้"
                    >
                      {Array.from({ length: MAX_TIER_STARS }, (_, star) => (
                        <option key={star} value={star + 1}>
                          {star + 1} ดาว
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`${styles.toggle} ${tier.floor ? styles.toggleOn : ''}`}
                      onClick={() => patchTier(tier.id, { floor: !tier.floor })}
                      title="แพ้แล้วไม่ตกจากแรงค์นี้"
                    >
                      โล่กันตก
                    </button>
                    {uploadButton('รูปถ้วย', TIER_IMAGE, (url) => patchTier(tier.id, { image: url }))}
                    {tier.image && (
                      <button type="button" className={styles.ghost} onClick={() => patchTier(tier.id, { image: '' })}>
                        ลบรูป
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.tierActions}>
                  <button
                    type="button"
                    className={styles.icon}
                    onClick={() => patch({ tiers: move(latest.current.tiers, index, 1) })}
                    aria-label="เลื่อนขึ้น"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.icon}
                    onClick={() => patch({ tiers: move(latest.current.tiers, index, -1) })}
                    aria-label="เลื่อนลง"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.icon}
                    disabled={config.tiers.length <= 1}
                    onClick={() => {
                      if (window.confirm(`ลบแรงค์ "${tier.name}"?`)) {
                        patch({ tiers: latest.current.tiers.filter((entry) => entry.id !== tier.id) });
                      }
                    }}
                    aria-label="ลบ"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className={styles.ghost}
            disabled={config.tiers.length >= MAX_TIERS}
            onClick={() =>
              patch({
                tiers: [
                  ...latest.current.tiers,
                  { id: managerId('tier'), name: 'แรงค์ใหม่', stars: 3, floor: false, image: '' },
                ],
              })
            }
          >
            + แรงค์บนสุด
          </button>
        </div>

        {/* ---- milestones, banners, player tool ---- */}
        <div className={styles.stack}>
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>รางวัลชนะสะสมรายสัปดาห์</h3>
            {config.milestones.map((milestone) => (
              <div key={milestone.id} className={styles.milestone}>
                <label className={styles.inline}>
                  ชนะ
                  <input
                    className={styles.num}
                    inputMode="numeric"
                    defaultValue={milestone.wins}
                    // Committed on blur: the list re-sorts by wins, and re-sorting on
                    // every keystroke would move the box out from under the cursor.
                    onBlur={(event) =>
                      patchMilestone(milestone.id, { wins: Math.max(1, whole(event.target.value)) })
                    }
                  />
                  นัด
                </label>
                <div className={styles.rewards}>
                  {milestone.rewards.map((line, index) => (
                    <div key={index} className={styles.rewardRow}>
                      <select
                        className={styles.input}
                        value={line.kind}
                        onChange={(event) =>
                          patchMilestone(milestone.id, {
                            rewards: milestone.rewards.map((entry, i) =>
                              i === index ? { ...entry, kind: event.target.value as CurrencyKind } : entry,
                            ),
                          })
                        }
                      >
                        {currencyList.map((currency) => (
                          <option key={currency.kind} value={currency.kind}>
                            {currency.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className={styles.input}
                        inputMode="numeric"
                        value={line.amount}
                        onChange={(event) =>
                          patchMilestone(milestone.id, {
                            rewards: milestone.rewards.map((entry, i) =>
                              i === index ? { ...entry, amount: whole(event.target.value) } : entry,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className={styles.icon}
                        onClick={() =>
                          patchMilestone(milestone.id, {
                            rewards: milestone.rewards.filter((_, i) => i !== index),
                          })
                        }
                        aria-label="ลบรางวัล"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={milestone.rewards.length >= MAX_MILESTONE_REWARDS}
                    onClick={() =>
                      patchMilestone(milestone.id, {
                        rewards: [...milestone.rewards, { kind: 'gem', amount: 100 }],
                      })
                    }
                  >
                    + รางวัล
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() =>
                    patch({
                      milestones: latest.current.milestones.filter((entry) => entry.id !== milestone.id),
                    })
                  }
                >
                  ลบ
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.ghost}
              disabled={config.milestones.length >= MAX_MILESTONES}
              onClick={() => {
                const last = latest.current.milestones[latest.current.milestones.length - 1];
                patch({
                  milestones: [
                    ...latest.current.milestones,
                    {
                      id: managerId('ms'),
                      wins: (last?.wins ?? 0) + 1,
                      rewards: [{ kind: 'gem', amount: 100 }],
                    },
                  ],
                });
              }}
            >
              + ขั้นรางวัล
            </button>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>แบนเนอร์รางวัลประจำสัปดาห์ (สไลด์)</h3>
            {config.banners.map((banner) => (
              <div key={banner.id} className={styles.banner}>
                <span className={styles.bannerArt}>
                  {banner.image ? <img src={banner.image} alt="" /> : <small>ไม่มีรูป</small>}
                </span>
                <div className={styles.tierFields}>
                  <input
                    className={styles.input}
                    placeholder="ข้อความบนแบนเนอร์"
                    maxLength={60}
                    value={banner.title}
                    onChange={(event) => patchBanner(banner.id, { title: event.target.value })}
                  />
                  <div className={styles.line}>
                    <input
                      className={`${styles.input} ${styles.short}`}
                      placeholder="ป้ายมุม"
                      maxLength={12}
                      value={banner.tag}
                      onChange={(event) => patchBanner(banner.id, { tag: event.target.value })}
                    />
                    {uploadButton('รูป', BANNER_IMAGE, (url) => patchBanner(banner.id, { image: url }))}
                    {banner.image && (
                      <button type="button" className={styles.ghost} onClick={() => patchBanner(banner.id, { image: '' })}>
                        ลบรูป
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() =>
                        patch({ banners: latest.current.banners.filter((entry) => entry.id !== banner.id) })
                      }
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={styles.ghost}
              disabled={config.banners.length >= MAX_BANNERS}
              onClick={() =>
                patch({
                  banners: [
                    ...latest.current.banners,
                    { id: managerId('bn'), title: 'รางวัลประจำสัปดาห์', tag: '', image: '' },
                  ],
                })
              }
            >
              + สไลด์
            </button>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>ตั้งแรงค์ผู้เล่น</h3>
            <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">— เลือกไอดี —</option>
              {accounts.map((entry) => (
                <option key={entry.id} value={entry.username}>
                  {entry.username}
                  {entry.manager ? ` · ${config.tiers[entry.manager.tier]?.name ?? ''}` : ''}
                </option>
              ))}
            </select>
            <div className={styles.line}>
              <select
                className={styles.input}
                value={targetTier}
                onChange={(event) => setTargetTier(Number(event.target.value))}
              >
                {config.tiers.map((tier, index) => (
                  <option key={tier.id} value={index}>
                    {tier.name}
                  </option>
                ))}
              </select>
              <select
                className={styles.input}
                value={targetStars}
                onChange={(event) => setTargetStars(Number(event.target.value))}
              >
                {Array.from({ length: (config.tiers[targetTier]?.stars ?? 0) + 1 }, (_, star) => (
                  <option key={star} value={star}>
                    {star} ดาว
                  </option>
                ))}
              </select>
              <button type="button" className={styles.primary} disabled={!target || busy} onClick={() => void setRank()}>
                ตั้งแรงค์
              </button>
            </div>
            <button type="button" className={styles.ghost} disabled={!target || busy} onClick={() => void resetWeek()}>
              ล้างชนะสะสมสัปดาห์นี้
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
