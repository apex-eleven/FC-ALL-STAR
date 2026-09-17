import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import { cardToPlayer } from '@/features/draft/pool';
import { usePlayers } from '@/features/players/PlayerContext';
import { MAX_LEVELS, SHOWCASE_IMAGE, TITLE_MAX, starpassId } from '@/features/starpass/constants';
import { currentPass, levelOf } from '@/features/starpass/starpass';
import { useStarPass } from '@/features/starpass/StarPassContext';
import type { StarPassConfig, StarPassLevel } from '@/features/starpass/types';
import { encodeUploadedImage, type UploadedImageError } from '@/lib/imageEncoding';
import AdminRewardList from './AdminRewardList';
import styles from './AdminStarPass.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;

const UPLOAD_ERROR: Record<UploadedImageError, string> = {
  'not-an-image': 'ไฟล์นี้ไม่ใช่รูปภาพ',
  'too-large-to-store': 'รูปใหญ่เกินไปแม้ย่อแล้ว ลองรูปที่เรียบกว่านี้',
  'decode-failed': 'เปิดรูปนี้ไม่ได้',
  'encode-failed': 'เบราว์เซอร์แปลงรูปไม่สำเร็จ',
};

/** The showcase dropdown lists at most this many matches; search narrows it. */
const CARD_OPTIONS_MAX = 200;

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

/** '' clears a price (not sold for that currency). */
function priceOf(raw: string): number | null {
  const value = whole(raw);
  return value > 0 ? value : null;
}

/**
 * Star Pass settings: XP rates, level size, premium price, the reward of every
 * level on both tracks, and a tool to open the premium track for a player.
 */
export default function AdminStarPass() {
  const { config, replace, reset, season, grant } = useStarPass();
  const { listAccounts } = useAuth();
  const { players, byId } = usePlayers();
  const [cardQuery, setCardQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(config);
  latest.current = config;
  const [status, setStatus] = useState<Status>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [target, setTarget] = useState('');

  const loadAccounts = () =>
    listAccounts().then((list) => setAccounts([...list].sort((a, b) => a.username.localeCompare(b.username))));

  useEffect(() => {
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listAccounts]);

  function commit(next: StarPassConfig, text = 'บันทึกแล้ว') {
    const result = replace(next);
    if (result.ok) latest.current = next;
    setStatus(
      result.ok
        ? { tone: 'ok', text }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก' },
    );
  }

  function patch(changes: Partial<StarPassConfig>, text?: string) {
    commit({ ...latest.current, ...changes }, text);
  }

  function patchLevel(id: string, changes: Partial<StarPassLevel>) {
    patch({ levels: latest.current.levels.map((level) => (level.id === id ? { ...level, ...changes } : level)) });
  }

  function addLevel() {
    const last = latest.current.levels[latest.current.levels.length - 1];
    const level: StarPassLevel = {
      id: starpassId('lv'),
      free: last ? [...last.free] : [{ kind: 'exchange', amount: 500 }],
      premium: last ? [...last.premium] : [{ kind: 'gem', amount: 100 }],
      featured: false,
    };
    patch({ levels: [...latest.current.levels, level] }, 'เพิ่มขั้นแล้ว');
  }

  const cardsByRating = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name)),
    [players],
  );
  const query = cardQuery.trim().toLowerCase();
  const cardMatches = cardsByRating
    .filter(
      (card) =>
        card.id === config.showcaseCardId ||
        query === '' ||
        [card.name, card.id, card.club, card.position, String(card.rating)].some((field) =>
          field.toLowerCase().includes(query),
        ),
    )
    .slice(0, CARD_OPTIONS_MAX);
  const showcaseCard = config.showcaseCardId ? byId(config.showcaseCardId) : undefined;

  async function uploadShowcase(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    const encoded = await encodeUploadedImage(file, SHOWCASE_IMAGE);
    setBusy(false);
    if (!encoded.ok || !encoded.dataUrl) {
      setStatus({ tone: 'bad', text: UPLOAD_ERROR[encoded.error ?? 'encode-failed'] });
      return;
    }
    patch({ showcaseImage: encoded.dataUrl }, `แนบรูปแล้ว (${Math.round(encoded.bytes / 1000)} KB)`);
  }

  const chosen = accounts.find((entry) => entry.username === target);
  const chosenPass = chosen ? currentPass(chosen.starpass, season) : null;

  async function setPremiumFor(premium: boolean) {
    if (!chosen) return;
    const saved = await grant(chosen.username, premium);
    setStatus(
      saved
        ? { tone: 'ok', text: premium ? `เปิดสายพิเศษให้ ${chosen.username} แล้ว` : `ปิดสายพิเศษของ ${chosen.username} แล้ว` }
        : { tone: 'bad', text: 'บันทึกไม่สำเร็จ' },
    );
    await loadAccounts();
  }

  const numberField = (label: string, value: number, apply: (value: number) => void) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        inputMode="numeric"
        defaultValue={value}
        key={`${label}-${value}`}
        // Committed on blur, so a half-typed number never clamps.
        onBlur={(event) => apply(whole(event.target.value))}
      />
    </label>
  );

  const priceField = (label: string, value: number | null, apply: (value: number | null) => void) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        className={styles.input}
        inputMode="numeric"
        placeholder="ไม่ขาย"
        defaultValue={value ?? ''}
        key={`${label}-${value}`}
        onBlur={(event) => apply(priceOf(event.target.value))}
      />
    </label>
  );

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        Star Pass (ปุ่ม STAR PASS แถบซ้ายหน้าหลัก) · รอบเดียวกับซีซั่นเมเนเจอร์โหมด เริ่มซีซั่นใหม่ XP รางวัลที่รับ
        และสายพิเศษจะเริ่มใหม่ · XP ได้จากการกดรับภารกิจและการแข่งเมเนเจอร์จบนัด (ออกกลางคันไม่ได้) · ซีซั่นปัจจุบัน #
        {season + 1}
      </p>
      {status && (
        <span className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>
          {status.text}
        </span>
      )}

      <div className={styles.columns}>
        <div className={styles.stack}>
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>ตั้งค่าทั่วไป</h3>
            <div className={styles.line}>
              <button
                type="button"
                className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
                onClick={() => patch({ enabled: !config.enabled })}
              >
                {config.enabled ? 'เปิด Star Pass อยู่' : 'ปิด Star Pass อยู่'}
              </button>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>ชื่อหน้าจอ</span>
              <input
                className={styles.input}
                maxLength={TITLE_MAX}
                value={config.title}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <div className={styles.pair}>
              {numberField('XP ต่อ 1 ขั้น', config.xpPerLevel, (value) => patch({ xpPerLevel: Math.max(1, value) }))}
              {numberField('XP จากภารกิจ (% ของแต้มภารกิจ)', config.missionRate, (value) =>
                patch({ missionRate: value }),
              )}
            </div>
            <div className={styles.triple}>
              {numberField('XP ชนะ', config.matchWin, (value) => patch({ matchWin: value }))}
              {numberField('XP เสมอ', config.matchDraw, (value) => patch({ matchDraw: value }))}
              {numberField('XP แพ้', config.matchLoss, (value) => patch({ matchLoss: value }))}
            </div>
            <div className={styles.pair}>
              {priceField('ราคาสายพิเศษ (เจม)', config.priceGem, (value) => patch({ priceGem: value }))}
              {priceField('ราคาสายพิเศษ (FC Point)', config.priceFcpoint, (value) => patch({ priceFcpoint: value }))}
            </div>
            <p className={styles.legend}>เว้นราคาว่าง = ไม่ขายด้วยสกุลนั้น · ว่างทั้งคู่ = เปิดได้โดยแอดมินเท่านั้น</p>
            {numberField('ซื้อขั้นถัดไป: FC Point ต่อ XP ที่ขาด (0 = ไม่ขาย)', config.skipPrice, (value) =>
              patch({ skipPrice: value }),
            )}
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                if (window.confirm('รีเซ็ต Star Pass กลับเป็นค่าเริ่มต้นทั้งหมด?')) {
                  const result = reset();
                  setStatus(result.ok ? { tone: 'ok', text: 'รีเซ็ตแล้ว' } : { tone: 'bad', text: 'รีเซ็ตไม่สำเร็จ' });
                }
              }}
            >
              รีเซ็ตทั้งหมด
            </button>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>การ์ดโชว์ข้างปุ่ม &quot;ซื้อ&quot;</h3>
            <div className={styles.showcaseRow}>
              <span className={styles.showcaseThumb}>
                {config.showcaseImage ? (
                  <img src={config.showcaseImage} alt="" />
                ) : showcaseCard ? (
                  <img src={cardToPlayer(showcaseCard).portrait} alt="" />
                ) : (
                  'อัตโนมัติ'
                )}
              </span>
              <div className={styles.showcasePick}>
                <input
                  className={styles.input}
                  placeholder="ค้นหาการ์ด ชื่อ / OVR / ตำแหน่ง"
                  value={cardQuery}
                  onChange={(event) => setCardQuery(event.target.value)}
                />
                <select
                  className={styles.input}
                  value={config.showcaseCardId}
                  onChange={(event) => patch({ showcaseCardId: event.target.value })}
                >
                  <option value="">อัตโนมัติ (การ์ดใบแรกในสายพิเศษ)</option>
                  {config.showcaseCardId && !showcaseCard && (
                    <option value={config.showcaseCardId}>(การ์ดนี้ถูกลบแล้ว)</option>
                  )}
                  {cardMatches.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name} · OVR {card.rating} · {card.position}
                    </option>
                  ))}
                </select>
                <div className={styles.line}>
                  <label className={styles.ghost}>
                    {busy ? 'กำลังแปลงรูป…' : 'อัปโหลดรูปแทน'}
                    <input type="file" accept="image/*" hidden disabled={busy} onChange={(event) => void uploadShowcase(event)} />
                  </label>
                  {config.showcaseImage && (
                    <button type="button" className={styles.danger} onClick={() => patch({ showcaseImage: '' })}>
                      ลบรูป
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className={styles.legend}>รูปที่อัปโหลดใช้ก่อนการ์ดที่เลือก · PNG พื้นใส 512×512 สวยที่สุด</p>
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>เปิดสายพิเศษให้ผู้เล่น (ซีซั่นนี้)</h3>
            <select className={styles.input} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">— เลือกผู้เล่น —</option>
              {accounts.map((entry) => (
                <option key={entry.id} value={entry.username}>
                  {entry.username}
                </option>
              ))}
            </select>
            {chosenPass && (
              <p className={styles.legend}>
                ขั้น {levelOf(chosenPass.xp, config)} · XP {chosenPass.xp} · สายพิเศษ{' '}
                {chosenPass.premium ? 'เปิดแล้ว' : 'ยังไม่เปิด'}
              </p>
            )}
            <div className={styles.line}>
              <button
                type="button"
                className={styles.primary}
                disabled={!chosenPass || chosenPass.premium}
                onClick={() => void setPremiumFor(true)}
              >
                เปิดสายพิเศษ
              </button>
              <button
                type="button"
                className={styles.danger}
                disabled={!chosenPass || !chosenPass.premium}
                onClick={() => void setPremiumFor(false)}
              >
                ปิดสายพิเศษ
              </button>
            </div>
          </div>
        </div>

        <div className={styles.block}>
          <h3 className={styles.blockTitle}>
            รางวัลแต่ละขั้น ({config.levels.length} ขั้น · ครบทุกขั้นที่ {config.levels.length * config.xpPerLevel} XP)
          </h3>
          <div className={styles.levelHead}>
            <span>ขั้น</span>
            <span>สายพิเศษ (แถวบน)</span>
            <span>สายฟรี (แถวล่าง)</span>
            <span />
          </div>
          {config.levels.map((level, index) => (
            <div key={level.id} className={styles.level}>
              <div className={styles.levelSide}>
                <span className={styles.levelNo}>{index + 1}</span>
                <button
                  type="button"
                  className={`${styles.toggle} ${level.featured ? styles.toggleOn : ''}`}
                  title="รางวัลใหญ่: ปักไว้ขวาสุดของแถบจนกว่าจะเลื่อนถึง"
                  onClick={() => patchLevel(level.id, { featured: !level.featured })}
                >
                  ใหญ่
                </button>
              </div>
              <AdminRewardList rewards={level.premium} onChange={(premium) => patchLevel(level.id, { premium })} />
              <AdminRewardList rewards={level.free} onChange={(free) => patchLevel(level.id, { free })} />
              <button
                type="button"
                className={styles.danger}
                onClick={() =>
                  patch({ levels: latest.current.levels.filter((entry) => entry.id !== level.id) }, 'ลบขั้นแล้ว')
                }
              >
                ลบ
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.ghost}
            disabled={config.levels.length >= MAX_LEVELS}
            onClick={addLevel}
          >
            + เพิ่มขั้น (คัดลอกรางวัลขั้นสุดท้าย)
          </button>
        </div>
      </div>
    </div>
  );
}
