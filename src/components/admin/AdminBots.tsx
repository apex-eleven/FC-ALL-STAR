import { useEffect, useMemo, useState } from 'react';
import { currencies } from '@/data/mock/currencies';
import { useAuth } from '@/features/auth/AuthContext';
import { useAvatars } from '@/features/avatars/AvatarContext';
import { ACTION_LABEL, MAX_BOTS, MAX_BULK, PERSONAS, defaultBotSettings } from '@/features/bots/constants';
import { uniqueNames } from '@/features/bots/names';
import { isOnline, randBetween, randInt, rollWindow } from '@/features/bots/schedule';
import { BOT_PERSONAS, type BotLease, type BotPersona, type BotProfile, type BotSettings } from '@/features/bots/types';
import {
  createBot,
  deleteBot,
  patchBotProfile,
  saveBotSettings,
  watchBotSettings,
  watchBots,
  watchLease,
} from '@/features/cloud/cloudBots';
import { isCloudEnabled } from '@/features/cloud/firebase';
import { MAX_LEVEL } from '@/features/profile/constants';
import { FORMATION_IDS } from '@/features/squad/constants';
import type { FormationId } from '@/features/squad/types';
import type { CurrencyKind } from '@/features/currencies/types';
import { formatCurrency } from '@/features/currencies/constants';
import styles from './AdminBots.module.css';

type Status = { tone: 'ok' | 'bad'; text: string } | null;
type PersonaPick = BotPersona | 'mix';

const INCOME_KINDS: readonly CurrencyKind[] = ['ticket', 'gem', 'exchange', 'fcpoint'];

/** Shapes most players actually pick; the rest still turn up now and then. */
const POPULAR: readonly FormationId[] = ['4-3-3-attack', '4-2-3-1-wide', '4-4-2-flat', '4-1-2-1-2-narrow', '3-5-2'];

/** A mixed batch looks like a real player base: mostly casual, a few whales. */
const MIX: readonly { persona: BotPersona; weight: number }[] = [
  { persona: 'casual', weight: 45 },
  { persona: 'regular', weight: 35 },
  { persona: 'grinder', weight: 14 },
  { persona: 'whale', weight: 6 },
];

function rollPersona(pick: PersonaPick): BotPersona {
  if (pick !== 'mix') return pick;
  let roll = Math.random() * MIX.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of MIX) {
    roll -= entry.weight;
    if (roll < 0) return entry.persona;
  }
  return 'casual';
}

function rollFormation(): FormationId {
  const list = Math.random() < 0.65 ? POPULAR : FORMATION_IDS;
  return list[Math.floor(Math.random() * list.length)] ?? '4-3-3-attack';
}

function whole(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number.parseInt(digits, 10);
}

function hourText(hour: number): string {
  const wrapped = hour % 24;
  const h = Math.floor(wrapped);
  const m = Math.round((wrapped - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function relative(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '—';
  const minutes = Math.round((at - now) / 60_000);
  if (minutes <= 0) return 'ถึงคิวแล้ว';
  if (minutes < 60) return `อีก ${minutes} นาที`;
  if (minutes < 60 * 24) return `อีก ${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
  return `อีก ${Math.floor(minutes / 1440)} วัน`;
}

function ago(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!iso || !Number.isFinite(at)) return 'ยังไม่เคยเล่น';
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return 'เมื่อกี้';
  if (minutes < 60) return `${minutes} นาทีก่อน`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} ชม.ก่อน`;
  return `${Math.floor(minutes / 1440)} วันก่อน`;
}

/**
 * ADMIN → ไอดีบอท.
 *
 * Makes bot accounts and watches them play. A bot is a normal account in every place
 * a player can see (see features/bots/README.md); this tab and `bots/*` are the only
 * places that know otherwise. The bots are played by BotRunner in an admin's browser,
 * so the master switch here only does something while an admin has the game open.
 */
export default function AdminBots() {
  const { account } = useAuth();
  const { avatars } = useAvatars();
  const [bots, setBots] = useState<BotProfile[] | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [draft, setDraft] = useState<BotSettings | null>(null);
  const [lease, setLease] = useState<BotLease | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Create form.
  const [count, setCount] = useState('5');
  const [name, setName] = useState('');
  const [persona, setPersona] = useState<PersonaPick>('mix');
  const [levelMin, setLevelMin] = useState('1');
  const [levelMax, setLevelMax] = useState('3');
  const [ageDays, setAgeDays] = useState('14');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!isCloudEnabled()) return;
    const stopBots = watchBots(setBots);
    const stopSettings = watchBotSettings((next) => {
      setSettings(next);
      setDraft((current) => current ?? next);
    });
    const stopLease = watchLease(setLease);
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      stopBots();
      stopSettings();
      stopLease();
      window.clearInterval(timer);
    };
  }, []);

  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (bots ?? []).filter((bot) => !query || bot.username.toLowerCase().includes(query));
  }, [bots, filter]);

  const totals = useMemo(() => {
    const list = bots ?? [];
    return {
      all: list.length,
      on: list.filter((bot) => bot.enabled).length,
      online: list.filter((bot) => bot.enabled && (bot.sessionLeft > 0 || isOnline(bot, new Date(now)))).length,
    };
  }, [bots, now]);

  if (!isCloudEnabled()) {
    return (
      <div className={styles.wrap}>
        <p className={styles.note}>ไอดีบอทใช้ได้เฉพาะตอนเปิดคลาวด์ (Firebase) — บอทต้องมีเซฟบนเซิร์ฟเวอร์ถึงจะไปโผล่ในอันดับ แรงค์ และถ้วยของคนอื่นได้</p>
      </div>
    );
  }

  if (bots === null || settings === null) {
    return (
      <div className={styles.wrap}>
        <p className={styles.note}>
          กำลังโหลด… ถ้าค้างอยู่ที่ข้อความนี้ แปลว่ายังไม่ได้อัปเดต Firestore rules — คัดลอก firestore.rules
          ชุดใหม่ไปวางใน Firebase Console → Firestore → Rules แล้วกด Publish
        </p>
      </div>
    );
  }

  const leaseLive = lease !== null && lease.until > now;
  const flash = (tone: 'ok' | 'bad', text: string) => setStatus({ tone, text });

  async function toggleMaster() {
    if (!settings) return;
    setBusy(true);
    const ok = await saveBotSettings({ ...settings, enabled: !settings.enabled });
    setBusy(false);
    flash(ok ? 'ok' : 'bad', ok ? (settings.enabled ? 'ปิดระบบบอทแล้ว' : 'เปิดระบบบอทแล้ว') : 'บันทึกไม่สำเร็จ');
  }

  async function saveSettings() {
    if (!draft || !settings) return;
    setBusy(true);
    // The master switch is its own button; saving the form never flips it.
    const ok = await saveBotSettings({ ...draft, enabled: settings.enabled });
    setBusy(false);
    flash(ok ? 'ok' : 'bad', ok ? 'บันทึกตั้งค่าบอทแล้ว' : 'บันทึกไม่สำเร็จ');
  }

  async function create() {
    const wanted = Math.max(1, Math.min(MAX_BULK, whole(count)));
    if ((bots?.length ?? 0) + wanted > MAX_BOTS) {
      flash('bad', `มีบอทได้ไม่เกิน ${MAX_BOTS} ไอดี`);
      return;
    }
    const low = Math.max(1, Math.min(MAX_LEVEL, whole(levelMin) || 1));
    const high = Math.max(low, Math.min(MAX_LEVEL, whole(levelMax) || low));
    const days = Math.max(0, Math.min(365, whole(ageDays)));

    const taken = new Set((bots ?? []).map((bot) => bot.username.toLowerCase()));
    const typed = wanted === 1 && name.trim() ? [name.trim()] : [];
    const pool = typed.length > 0 ? typed : uniqueNames(wanted * 2, taken);

    setBusy(true);
    let made = 0;
    let skipped = 0;
    const startAt = Date.now();
    for (const candidate of pool) {
      if (made >= wanted) break;
      setProgress(`กำลังสร้าง ${made + 1}/${wanted} …`);
      const level = randInt(low, high, Math.random);
      const unlocked = avatars.filter((avatar) => avatar.requiredLevel <= level);
      const avatar = unlocked[Math.floor(Math.random() * unlocked.length)] ?? avatars[0];
      const chosen = rollPersona(persona);
      const window_ = rollWindow(chosen, Math.random);
      const result = await createBot({
        username: candidate,
        persona: chosen,
        level,
        avatarId: avatar?.id ?? 'rookie',
        createdAt: new Date(startAt - randBetween(0, days, Math.random) * 86_400_000),
        activeFrom: window_.from,
        activeTo: window_.to,
        formation: rollFormation(),
        // Staggered, so a batch of twenty does not all log on in the same minute.
        firstActionAt: new Date(startAt + randBetween(0.3, 2 + wanted * 1.5, Math.random) * 60_000),
        createdBy: account?.username ?? '',
      });
      if (result.ok) made += 1;
      else if (result.error === 'taken') skipped += 1;
      else {
        flash('bad', 'สร้างไม่สำเร็จ — เช็กว่าอัปเดต Firestore rules ชุดใหม่แล้ว');
        break;
      }
    }
    setBusy(false);
    setProgress('');
    if (made > 0) {
      setName('');
      flash('ok', `สร้างบอทแล้ว ${made} ไอดี${skipped ? ` (ชื่อซ้ำข้ามไป ${skipped})` : ''}`);
    } else if (skipped > 0) {
      flash('bad', 'ชื่อนี้มีคนใช้แล้ว');
    }
  }

  async function setEnabled(bot: BotProfile, enabled: boolean) {
    await patchBotProfile(bot.uid, { enabled });
  }

  async function playNow(bot: BotProfile) {
    // A session already under way; the runner skips its hours check for it.
    await patchBotProfile(bot.uid, {
      enabled: true,
      nextActionAt: new Date().toISOString(),
      sessionLeft: Math.max(bot.sessionLeft, 3),
    });
    flash('ok', `${bot.username} จะเริ่มเล่นในรอบถัดไปของตัวรันบอท`);
  }

  async function remove(bot: BotProfile) {
    if (!window.confirm(`ลบไอดีบอท "${bot.username}"? เซฟ การ์ด และอันดับของไอดีนี้จะหายทั้งหมด`)) return;
    setBusy(true);
    const ok = await deleteBot(bot);
    setBusy(false);
    flash(ok ? 'ok' : 'bad', ok ? `ลบ ${bot.username} แล้ว` : 'ลบไม่สำเร็จ');
  }

  async function setAll(enabled: boolean) {
    setBusy(true);
    for (const bot of bots ?? []) {
      if (bot.enabled !== enabled) await patchBotProfile(bot.uid, { enabled });
    }
    setBusy(false);
  }

  const setIncome = (who: BotPersona, kind: CurrencyKind, raw: string) =>
    setDraft((current) => {
      if (!current) return current;
      const amount = whole(raw);
      const income = { ...current.income[who] };
      if (amount > 0) income[kind] = amount;
      else delete income[kind];
      return { ...current, income: { ...current.income, [who]: income } };
    });

  const setLines = (key: 'chatLines' | 'pullLines' | 'rankupLines' | 'winLines' | 'promoteLines', raw: string) =>
    setDraft((current) => (current ? { ...current, [key]: raw.split('\n') } : current));

  const form = draft ?? settings;

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        ไอดีบอทคือไอดีธรรมดาที่แอดมินสร้าง แล้วเล่นเองเหมือนคนจริง — เข้าเกมรายวัน เปิดการ์ด จัดทีม ตีบวก ลงแรงค์
        ลงถ้วย รับรางวัลภารกิจ และแชท ผ่านกติกาเดียวกับปุ่มของผู้เล่นทุกอย่าง (จ่ายเงินจริง ดวงเท่ากัน) ผู้เล่นคนอื่นมองไม่เห็นว่าเป็นบอท —
        ข้อมูลที่บอกว่าเป็นบอทอยู่ใน bots/* ที่อ่านได้เฉพาะแอดมิน
      </p>

      {status && <p className={`${styles.status} ${status.tone === 'bad' ? styles.statusBad : ''}`}>{status.text}</p>}

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>ตัวรันบอท</h3>
        <div className={styles.row}>
          <button
            type="button"
            className={`${styles.toggle} ${settings.enabled ? styles.toggleOn : ''}`}
            disabled={busy}
            onClick={() => void toggleMaster()}
          >
            {settings.enabled ? 'ระบบบอท: เปิด' : 'ระบบบอท: ปิด'}
          </button>
          <span className={styles.meta}>
            {!settings.enabled
              ? 'บอททุกตัวหยุดนิ่ง'
              : leaseLive
                ? `กำลังรันอยู่ที่เบราว์เซอร์ของ ${lease?.label || 'แอดมิน'}`
                : 'รอเบราว์เซอร์แอดมินรับงาน (ภายใน ~15 วินาที)'}
          </span>
        </div>
        <div className={styles.stats}>
          <span>บอททั้งหมด <b>{totals.all}</b></span>
          <span>เปิดอยู่ <b>{totals.on}</b></span>
          <span>อยู่ในช่วงออนไลน์ <b>{totals.online}</b></span>
        </div>
        <p className={styles.legend}>
          ไม่มีเซิร์ฟเวอร์รันบอท บอทจึงเล่นเฉพาะตอนที่มีแอดมินเปิดเกมค้างไว้ (หน้าไหนก็ได้) — ทีละเบราว์เซอร์เดียว ถ้าปิดแท็บ
          เบราว์เซอร์แอดมินอื่นจะรับต่อใน 5 นาที · แท็บที่ถูกย่อ/ซ่อนเบราว์เซอร์จะชะลอเหลือราวนาทีละ 1 ก้าว
          แนะนำเปิดทิ้งไว้บนคอมสักเครื่อง · ตอนกลับมาเปิด บอทที่ค้างจะทยอยกลับเข้าเกมภายใน 20 นาที ไม่เข้าพร้อมกัน
        </p>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>สร้างไอดีบอท</h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.label}>จำนวน (สูงสุด {MAX_BULK})</span>
            <input className={styles.input} value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>ชื่อไอดี (เว้นว่าง = สุ่มชื่อ · ใช้ได้ตอนสร้าง 1 ไอดี)</span>
            <input
              className={styles.input}
              value={name}
              maxLength={16}
              placeholder="สุ่มให้เหมือนชื่อคนจริง"
              disabled={whole(count) > 1}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>สไตล์การเล่น</span>
            <select className={styles.input} value={persona} onChange={(e) => setPersona(e.target.value as PersonaPick)}>
              <option value="mix">คละแบบคนจริง (ขาจรเยอะ สายเปย์น้อย)</option>
              {BOT_PERSONAS.map((key) => (
                <option key={key} value={key}>
                  {PERSONAS[key].label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>เลเวลเริ่ม (สุ่มระหว่าง)</span>
            <span className={styles.row}>
              <input className={styles.short} value={levelMin} inputMode="numeric" onChange={(e) => setLevelMin(e.target.value)} />
              –
              <input className={styles.short} value={levelMax} inputMode="numeric" onChange={(e) => setLevelMax(e.target.value)} />
            </span>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>วันที่สร้างไอดี ย้อนหลังสุ่ม 0–N วัน</span>
            <input className={styles.input} value={ageDays} inputMode="numeric" onChange={(e) => setAgeDays(e.target.value)} />
          </label>
        </div>
        <p className={styles.legend}>
          {persona === 'mix' ? 'คละ: ' : ''}
          {(persona === 'mix' ? BOT_PERSONAS : [persona]).map((key) => `${PERSONAS[key].label} — ${PERSONAS[key].description}`).join(' · ')}
          <br />
          เริ่มต้นด้วยเงินเท่าผู้เล่นสมัครใหม่ทุกอย่าง แล้วได้รายได้ต่อวันตามสไตล์ (ตั้งได้ด้านล่าง)
        </p>
        <div className={styles.row}>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void create()}>
            สร้างบอท
          </button>
          {progress && <span className={styles.meta}>{progress}</span>}
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.row}>
          <h3 className={styles.blockTitle}>บอททั้งหมด</h3>
          <input
            className={`${styles.input} ${styles.search}`}
            value={filter}
            placeholder="ค้นหาชื่อ"
            onChange={(e) => setFilter(e.target.value)}
          />
          <button type="button" className={styles.ghost} disabled={busy} onClick={() => void setAll(true)}>
            เปิดทั้งหมด
          </button>
          <button type="button" className={styles.ghost} disabled={busy} onClick={() => void setAll(false)}>
            หยุดทั้งหมด
          </button>
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>ยังไม่มีไอดีบอท</p>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.botRow} ${styles.head}`}>
              <span>ไอดี</span>
              <span>สไตล์</span>
              <span>OVR · แรงค์</span>
              <span>วันนี้</span>
              <span>ล่าสุด</span>
              <span>ถัดไป</span>
              <span />
            </div>
            {shown.map((bot) => {
              const last = bot.log[0];
              const online = bot.sessionLeft > 0 || isOnline(bot, new Date(now));
              return (
                <div key={bot.uid} className={styles.botBlock}>
                  <div className={`${styles.botRow} ${bot.enabled ? '' : styles.paused}`}>
                    <button type="button" className={styles.name} onClick={() => setOpen(open === bot.uid ? null : bot.uid)}>
                      <span className={`${styles.dot} ${bot.enabled && online ? styles.dotOn : ''}`} />
                      {bot.username}
                    </button>
                    <select
                      className={styles.mini}
                      value={bot.persona}
                      onChange={(e) => void patchBotProfile(bot.uid, { persona: e.target.value as BotPersona })}
                    >
                      {BOT_PERSONAS.map((key) => (
                        <option key={key} value={key}>
                          {PERSONAS[key].label}
                        </option>
                      ))}
                    </select>
                    <span>
                      {bot.ovr || '—'}
                      {bot.rank ? ` · ${bot.rank}` : ''}
                    </span>
                    <span className={styles.meta}>
                      แพ็ค {bot.today.packs} · แมตช์ {bot.today.matches} · ตีบวก {bot.today.rankups}
                    </span>
                    <span className={styles.meta} title={last?.text}>
                      {ago(bot.lastActiveAt, now)}
                      {last ? ` · ${last.text}` : ''}
                    </span>
                    <span className={styles.meta}>
                      {!bot.enabled
                        ? 'หยุดอยู่'
                        : bot.sessionLeft > 0
                          ? `กำลังเล่น · ${relative(bot.nextActionAt, now)}`
                          : relative(bot.nextActionAt, now)}
                    </span>
                    <span className={styles.actions}>
                      <button type="button" className={styles.ghost} onClick={() => void playNow(bot)}>
                        เล่นเลย
                      </button>
                      <button type="button" className={styles.ghost} onClick={() => void setEnabled(bot, !bot.enabled)}>
                        {bot.enabled ? 'หยุด' : 'เริ่ม'}
                      </button>
                      <button type="button" className={styles.danger} disabled={busy} onClick={() => void remove(bot)}>
                        ลบ
                      </button>
                    </span>
                  </div>
                  {open === bot.uid && (
                    <div className={styles.detail}>
                      <p className={styles.meta}>
                        ออนไลน์ช่วง {hourText(bot.activeFrom)}–{hourText(bot.activeTo)} · แผนชอบ {bot.formation} · สร้าง{' '}
                        {new Date(bot.createdAt).toLocaleDateString('th-TH')}
                      </p>
                      <p className={styles.meta}>
                        รวม: เปิดแพ็ค {bot.stats.packs} ({bot.stats.cards} ใบ) · แมตช์ {bot.stats.matches} ชนะ {bot.stats.wins} ·
                        ตีบวก {bot.stats.rankups} ติด {bot.stats.rankupWins} · ถ้วย {bot.stats.cups} แชมป์ {bot.stats.trophies} ·
                        แชท {bot.stats.chats}
                      </p>
                      <ul className={styles.log}>
                        {bot.log.map((entry, index) => (
                          <li key={`${entry.at}-${index}`}>
                            <span>
                              {new Date(entry.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            {entry.text}
                          </li>
                        ))}
                      </ul>
                      <p className={styles.legend}>
                        เสกเงิน/ตั้งเลเวลให้บอทได้ที่เมนู "เงินในเกม" เหมือนไอดีทั่วไป · การกระทำ:{' '}
                        {Object.values(ACTION_LABEL).join(' / ')}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {form && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>ตั้งค่าพฤติกรรม</h3>

          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.toggle} ${form.chat ? styles.toggleOn : ''}`}
              onClick={() => setDraft({ ...form, chat: !form.chat })}
            >
              {form.chat ? 'บอทแชทได้' : 'บอทไม่แชท'}
            </button>
            <label className={styles.inline}>
              เว้นระยะแชทบอท (ทุกตัวรวมกัน)
              <input
                className={styles.short}
                value={String(form.chatGapMinutes)}
                inputMode="numeric"
                onChange={(e) => setDraft({ ...form, chatGapMinutes: whole(e.target.value) })}
              />
              นาที
            </label>
            <button
              type="button"
              className={`${styles.toggle} ${form.oneOfOne ? styles.toggleOn : ''}`}
              onClick={() => setDraft({ ...form, oneOfOne: !form.oneOfOne })}
            >
              {form.oneOfOne ? 'บอทแย่งป้าย 1 OF 1 ได้' : 'ป้าย 1 OF 1 เก็บไว้ให้คนจริง'}
            </button>
          </div>

          <h4 className={styles.subTitle}>รายได้ต่อวันของบอท (แทนการเติมเงินและโหมดที่บอทไม่ได้เล่น)</h4>
          <div className={styles.incomeTable}>
            <span />
            {INCOME_KINDS.map((kind) => (
              <span key={kind} className={styles.label}>
                {currencies[kind].label}
              </span>
            ))}
            {BOT_PERSONAS.map((who) => (
              <div key={who} className={styles.incomeRow}>
                <span className={styles.label}>{PERSONAS[who].label}</span>
                {INCOME_KINDS.map((kind) => (
                  <input
                    key={kind}
                    className={styles.input}
                    inputMode="numeric"
                    value={form.income[who][kind] ? String(form.income[who][kind]) : ''}
                    placeholder="0"
                    onChange={(e) => setIncome(who, kind, e.target.value)}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className={styles.legend}>
            ตัวอย่างสายเปย์ตอนนี้: {INCOME_KINDS.map((kind) => `${currencies[kind].label} ${formatCurrency(form.income.whale[kind] ?? 0)}`).join(' · ')}
          </p>

          <h4 className={styles.subTitle}>ข้อความแชท (บรรทัดละ 1 ข้อความ)</h4>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>คุยทั่วไป · ใช้ {'{ovr}'} {'{tier}'} {'{name}'} ได้</span>
              <textarea className={styles.textarea} value={form.chatLines.join('\n')} onChange={(e) => setLines('chatLines', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>เปิดได้การ์ดชุด A · {'{card}'}</span>
              <textarea className={styles.textarea} value={form.pullLines.join('\n')} onChange={(e) => setLines('pullLines', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>ตีบวกติด +5 ขึ้นไป · {'{card}'} {'{plus}'}</span>
              <textarea className={styles.textarea} value={form.rankupLines.join('\n')} onChange={(e) => setLines('rankupLines', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>ได้แชมป์ถ้วย · {'{cup}'}</span>
              <textarea className={styles.textarea} value={form.winLines.join('\n')} onChange={(e) => setLines('winLines', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>เลื่อนแรงค์ · {'{tier}'}</span>
              <textarea className={styles.textarea} value={form.promoteLines.join('\n')} onChange={(e) => setLines('promoteLines', e.target.value)} />
            </label>
          </div>

          <div className={styles.row}>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void saveSettings()}>
              บันทึกตั้งค่า
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setDraft({ ...defaultBotSettings(), enabled: settings.enabled })}
            >
              คืนค่าเริ่มต้น (ยังไม่บันทึก)
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
