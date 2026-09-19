import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { currencies, currencyList } from '@/data/mock/currencies';
import { useAuth } from '@/features/auth/AuthContext';
import type { Account } from '@/features/auth/types';
import { CURRENCY_ORDER, MAX_GRANT, formatCurrency } from '@/features/currencies/constants';
import { useAdminWallet } from '@/features/currencies/useWallet';
import type { CurrencyKind } from '@/features/currencies/types';
import { MAX_LEVEL } from '@/features/profile/constants';
import { awardXP, requiredXPForLevel } from '@/features/profile/leveling';
import GlassPanel from '@/components/ui/GlassPanel';
import AdminAvatars from './AdminAvatars';
import AdminBanners from './AdminBanners';
import AdminDrafts from './AdminDrafts';
import AdminDraftRates from './AdminDraftRates';
import { saveConfigToRepo } from '@/features/backup/backup';
import { pushConfigToCloud } from '@/features/cloud/cloudConfig';
import { isCloudEnabled } from '@/features/cloud/firebase';
import AdminBackup from './AdminBackup';
import AdminClub from './AdminClub';
import AdminLeague from './AdminLeague';
import AdminAnnouncement from './AdminAnnouncement';
import AdminPlayers from './AdminPlayers';
import AdminRankUp from './AdminRankUp';
import AdminStore from './AdminStore';
import AdminTransfer from './AdminTransfer';
import AdminShop from './AdminShop';
import AdminManager from './AdminManager';
import AdminMissions from './AdminMissions';
import AdminStarPass from './AdminStarPass';
import AdminItems from './AdminItems';
import AdminGacha from './AdminGacha';
import AdminRedeem from './AdminRedeem';
import AdminInbox from './AdminInbox';
import AdminDailyLogin from './AdminDailyLogin';
import AdminBadges from './AdminBadges';
import AdminWalkout from './AdminWalkout';
import styles from './AdminPanel.module.css';

export interface AdminPanelProps {
  onClose(): void;
}

const QUICK_AMOUNTS = [100, 1_000, 10_000, 100_000, 1_000_000];

type Status = { tone: 'ok' | 'bad'; text: string } | null;
type Tab =
  | 'wallet'
  | 'avatars'
  | 'banners'
  | 'players'
  | 'club'
  | 'badges'
  | 'store'
  | 'drafts'
  | 'rates'
  | 'league'
  | 'rankup'
  | 'transfer'
  | 'shop'
  | 'manager'
  | 'missions'
  | 'starpass'
  | 'items'
  | 'gacha'
  | 'redeem'
  | 'inbox'
  | 'dailylogin'
  | 'announcement'
  | 'walkout'
  | 'backup';

const TABS: { id: Tab; label: string }[] = [
  { id: 'wallet', label: 'เงินในเกม' },
  { id: 'avatars', label: 'รูปโปรไฟล์' },
  { id: 'banners', label: 'แบนเนอร์ข่าว' },
  { id: 'players', label: 'การ์ดนักเตะ' },
  { id: 'club', label: 'การ์ดของผู้เล่น' },
  { id: 'badges', label: 'ตราทีม' },
  { id: 'store', label: 'ร้านค้าแพ็ค' },
  { id: 'drafts', label: 'ดราฟต์' },
  { id: 'rates', label: 'อัตราสุ่ม' },
  { id: 'league', label: 'ลีก' },
  { id: 'rankup', label: 'ตีบวกการ์ด' },
  { id: 'transfer', label: 'เซ็นสัญญา' },
  { id: 'shop', label: 'ร้านค้าไอเท็ม' },
  { id: 'manager', label: 'เมเนเจอร์โหมด' },
  { id: 'missions', label: 'ภารกิจ' },
  { id: 'starpass', label: 'Star Pass' },
  { id: 'items', label: 'ไอเท็ม' },
  { id: 'gacha', label: 'กาชาปอง' },
  { id: 'redeem', label: 'แลกโค้ด' },
  { id: 'inbox', label: 'กล่องจดหมาย' },
  { id: 'dailylogin', label: 'เข้าเกมรายวัน' },
  { id: 'announcement', label: 'ประกาศ' },
  { id: 'walkout', label: 'Walkout' },
  { id: 'backup', label: 'สำรองข้อมูล' },
];

const XP_QUICK = [120, 500, 2_000, 10_000];

export default function AdminPanel({ onClose }: AdminPanelProps) {
  /**
   * Every admin edit ends with the panel being closed, so this is the one place that
   * catches all of them — the config is mirrored into the repo on the way out rather
   * than asking the operator to remember a save button.
   *
   * Fire and forget: the edit is already in localStorage, and under a production
   * build there is no endpoint to write to.
   */
  const close = () => {
    void saveConfigToRepo();
    // On a live deployment this is the one that matters: it is what makes an admin
    // edit visible to every other player without a redeploy.
    if (isCloudEnabled()) void pushConfigToCloud();
    onClose();
  };
  const { listAccounts, updateOther } = useAuth();
  const { grant, set } = useAdminWallet();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<CurrencyKind>('exchange');
  const [amount, setAmount] = useState('1000');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('wallet');
  const [xpAmount, setXpAmount] = useState('500');
  const [levelInput, setLevelInput] = useState('');

  const refresh = useCallback(async () => {
    const list = await listAccounts();
    list.sort((a, b) => a.username.localeCompare(b.username));
    setAccounts(list);
    setSelected((current) =>
      current && list.some((a) => a.username === current) ? current : (list[0]?.username ?? null),
    );
  }, [listAccounts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const target = useMemo(
    () => accounts.find((a) => a.username === selected) ?? null,
    [accounts, selected],
  );

  const parsed = Number.parseInt(amount, 10);
  const validAmount = Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_GRANT;
  const canAct = Boolean(target) && validAmount && !busy;

  async function run(action: 'grant' | 'set') {
    if (!target || !validAmount) return;
    setBusy(true);

    const done =
      action === 'grant'
        ? await grant(target.username, kind, parsed)
        : await set(target.username, kind, parsed);

    if (done) {
      const label = currencies[kind].label;
      setStatus({
        tone: 'ok',
        text:
          action === 'grant'
            ? `เสก ${formatCurrency(parsed)} ${label} ให้ ${target.username} แล้ว`
            : `ตั้ง ${label} ของ ${target.username} เป็น ${formatCurrency(parsed)} แล้ว`,
      });
      await refresh();
    } else {
      setStatus({ tone: 'bad', text: 'ทำรายการไม่สำเร็จ — ไม่พบไอดีนี้แล้ว' });
    }

    setBusy(false);
  }

  /**
   * XP and level edits go through updateOther so an admin can adjust any account,
   * not just their own. awardXP does the level rollover, which is why this grants XP
   * rather than writing the level directly.
   */
  async function grantXP() {
    const value = Number.parseInt(xpAmount, 10);
    if (!target || !Number.isInteger(value) || value <= 0) return;

    setBusy(true);
    const done = await updateOther(target.username, (account) => {
      const next = awardXP({ level: account.level, currentXP: account.currentXP }, value);
      return { ...account, level: next.level, currentXP: next.currentXP };
    });

    setStatus(
      done
        ? { tone: 'ok', text: `เพิ่ม ${formatCurrency(value)} EXP ให้ ${target.username} แล้ว` }
        : { tone: 'bad', text: 'ทำรายการไม่สำเร็จ — ไม่พบไอดีนี้แล้ว' },
    );
    await refresh();
    setBusy(false);
  }

  async function applyLevel() {
    const value = Number.parseInt(levelInput, 10);
    if (!target || !Number.isInteger(value)) return;

    const level = Math.max(1, Math.min(MAX_LEVEL, value));
    setBusy(true);

    // Setting a level resets progress toward the next one. Carrying the old XP over
    // could leave a bar past its own maximum after a demotion.
    const done = await updateOther(target.username, (account) => ({
      ...account,
      level,
      currentXP: 0,
    }));

    setStatus(
      done
        ? { tone: 'ok', text: `ตั้งเลเวลของ ${target.username} เป็น ${level} แล้ว` }
        : { tone: 'bad', text: 'ทำรายการไม่สำเร็จ — ไม่พบไอดีนี้แล้ว' },
    );
    setLevelInput('');
    await refresh();
    setBusy(false);
  }

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="แผงควบคุมแอดมิน">
      <GlassPanel edged className={styles.panel}>
        <div className={styles.head}>
          <h1 className={styles.title}>แผงควบคุมแอดมิน</h1>
          <span className={styles.chip}>ADMIN</span>
          <button type="button" className={styles.close} onClick={close} aria-label="ปิด">
            <X size={22} strokeWidth={2.6} />
          </button>
        </div>

        <p className={styles.warning}>
          แผงนี้แก้ข้อมูลในเบราว์เซอร์เครื่องนี้เท่านั้น และไม่ใช่ระบบความปลอดภัยจริง —
          ใครก็แก้ค่าเงินเองผ่าน DevTools ได้ ต้องย้ายไปเซิร์ฟเวอร์ก่อนถึงจะบังคับได้จริง
        </p>

        <label className={styles.tabs}>
          <span className={styles.tabsLabel}>เมนู</span>
          <select
            className={styles.tabSelect}
            value={tab}
            aria-label="เมนูแผงควบคุม"
            onChange={(event) => setTab(event.target.value as Tab)}
          >
            {TABS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {tab === 'avatars' && <AdminAvatars />}
        {tab === 'banners' && <AdminBanners />}
        {tab === 'players' && <AdminPlayers />}
        {tab === 'club' && <AdminClub />}
        {tab === 'badges' && <AdminBadges />}
        {tab === 'store' && <AdminStore />}
        {tab === 'drafts' && <AdminDrafts />}
        {tab === 'rates' && <AdminDraftRates />}
        {tab === 'league' && <AdminLeague />}
        {tab === 'rankup' && <AdminRankUp />}
        {tab === 'transfer' && <AdminTransfer />}
        {tab === 'shop' && <AdminShop />}
        {tab === 'manager' && <AdminManager />}
        {tab === 'missions' && <AdminMissions />}
        {tab === 'starpass' && <AdminStarPass />}
        {tab === 'items' && <AdminItems />}
        {tab === 'gacha' && <AdminGacha />}
        {tab === 'redeem' && <AdminRedeem />}
        {tab === 'inbox' && <AdminInbox />}
        {tab === 'dailylogin' && <AdminDailyLogin />}
        {tab === 'announcement' && <AdminAnnouncement />}
        {tab === 'walkout' && <AdminWalkout />}
        {tab === 'backup' && <AdminBackup />}

        <div className={styles.body} hidden={tab !== 'wallet'}>
          <div className={styles.column}>
            <h2 className={styles.sectionTitle}>ไอดีในเครื่องนี้ ({accounts.length})</h2>
            <div className={styles.list}>
              {accounts.length === 0 && <p className={styles.empty}>ยังไม่มีไอดี</p>}
              {accounts.map((account) => (
                <button
                  type="button"
                  key={account.id}
                  className={`${styles.row} ${account.username === selected ? styles.rowActive : ''}`}
                  onClick={() => setSelected(account.username)}
                >
                  <span>
                    <span className={styles.rowName}>
                      {account.username}
                      {account.role === 'admin' && <span className={styles.chip}>ADMIN</span>}
                    </span>
                    <span className={styles.rowMeta}>
                      เลเวล {account.level} · สร้างเมื่อ{' '}
                      {new Date(account.createdAt).toLocaleDateString('th-TH')}
                    </span>
                  </span>
                  <span className={styles.rowBalances}>
                    {CURRENCY_ORDER.map((currencyKind) => (
                      <span className={styles.balance} key={currencyKind}>
                        <img src={currencies[currencyKind].icon} alt="" />
                        {formatCurrency(account.wallet[currencyKind])}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.column}>
            <h2 className={styles.sectionTitle}>
              เสกเงิน{target ? ` ให้ ${target.username}` : ''}
            </h2>

            <div className={styles.field}>
              <span className={styles.label}>สกุลเงิน</span>
              <div className={styles.picker}>
                {currencyList.map((currency) => (
                  <button
                    type="button"
                    key={currency.kind}
                    className={`${styles.pick} ${currency.kind === kind ? styles.pickActive : ''}`}
                    onClick={() => setKind(currency.kind)}
                    aria-label={currency.label}
                    aria-pressed={currency.kind === kind}
                  >
                    <img src={currency.icon} alt="" />
                  </button>
                ))}
              </div>
            </div>

            <label className={styles.field} htmlFor="admin-amount">
              <span className={styles.label}>จำนวน</span>
              <input
                id="admin-amount"
                className={styles.input}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value.replace(/[^\d]/g, ''));
                  setStatus(null);
                }}
                inputMode="numeric"
                autoComplete="off"
              />
            </label>

            <div className={styles.quick}>
              {QUICK_AMOUNTS.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={styles.quickButton}
                  onClick={() => setAmount(String(value))}
                >
                  {formatCurrency(value)}
                </button>
              ))}
              <button
                type="button"
                className={styles.quickButton}
                onClick={() => setAmount('0')}
              >
                0
              </button>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={!canAct || parsed === 0}
                onClick={() => void run('grant')}
              >
                เสกเพิ่ม
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={!canAct}
                onClick={() => void run('set')}
              >
                ตั้งค่าเป็น
              </button>
            </div>

            <p className={`${styles.status} ${status?.tone === 'ok' ? styles.ok : styles.bad}`}>
              {status?.text ??
                (validAmount ? '' : `จำนวนต้องเป็นเลขจำนวนเต็ม 0–${formatCurrency(MAX_GRANT)}`)}
            </p>

            <h2 className={styles.sectionTitle}>เลเวลและ EXP</h2>

            <div className={styles.expBlock}>
              <p className={styles.expNow}>
                {target
                  ? `ตอนนี้เลเวล ${target.level} · ${formatCurrency(target.currentXP)}/${formatCurrency(
                      requiredXPForLevel(target.level),
                    )} XP`
                  : 'ยังไม่ได้เลือกไอดี'}
              </p>

              <div className={styles.expRow}>
                <input
                  className={styles.expInput}
                  value={xpAmount}
                  inputMode="numeric"
                  aria-label="จำนวน EXP ที่จะเพิ่ม"
                  onChange={(event) => setXpAmount(event.target.value.replace(/[^\d]/g, ''))}
                />
                <button
                  type="button"
                  className={styles.expButton}
                  disabled={!target || busy || !Number.parseInt(xpAmount, 10)}
                  onClick={() => void grantXP()}
                >
                  เพิ่ม EXP
                </button>
              </div>

              <div className={styles.quick}>
                {XP_QUICK.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={styles.quickButton}
                    onClick={() => setXpAmount(String(value))}
                  >
                    +{formatCurrency(value)}
                  </button>
                ))}
              </div>

              <div className={styles.expRow}>
                <input
                  className={styles.expInput}
                  value={levelInput}
                  inputMode="numeric"
                  placeholder={`1–${MAX_LEVEL}`}
                  aria-label="ตั้งเลเวล"
                  onChange={(event) => setLevelInput(event.target.value.replace(/[^\d]/g, ''))}
                />
                <button
                  type="button"
                  className={styles.expButton}
                  disabled={!target || busy || !Number.parseInt(levelInput, 10)}
                  onClick={() => void applyLevel()}
                >
                  ตั้งเลเวล
                </button>
              </div>
              <p className={styles.expHint}>ตั้งเลเวลจะรีเซ็ต EXP ของเลเวลนั้นเป็น 0</p>
            </div>

            <h2 className={styles.sectionTitle}>ประวัติล่าสุด</h2>
            <div className={styles.ledger}>
              {(!target || target.ledger.length === 0) && (
                <p className={styles.empty}>ยังไม่มีรายการ</p>
              )}
              {target?.ledger.map((entry) => (
                <div className={styles.entry} key={entry.id}>
                  <span className={`${styles.delta} ${entry.delta >= 0 ? styles.up : styles.down}`}>
                    {entry.delta >= 0 ? '+' : ''}
                    {formatCurrency(entry.delta)}
                  </span>
                  <span>{currencies[entry.kind].label}</span>
                  <span>· {entry.reason}</span>
                  <span className={styles.entryTime}>
                    {new Date(entry.at).toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
