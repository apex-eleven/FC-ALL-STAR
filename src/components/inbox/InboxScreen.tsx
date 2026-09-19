import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, ChevronLeft, Gift, Home, Mail, MailOpen, Trash2 } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { HOME_CURRENCIES } from '@/features/currencies/constants';
import { useDailyLogin } from '@/features/dailylogin/DailyLoginContext';
import { useNavigation } from '@/features/navigation/NavigationContext';
import { ROUTE_LABEL } from '@/features/navigation/routes';
import { useInbox, type InboxClaimResult } from '@/features/notifications/InboxContext';
import type { InboxClaimError } from '@/features/notifications/types';
import CurrencyItem from '@/components/currency/CurrencyItem';
import DailyLoginCalendar from '@/components/dailylogin/DailyLoginCalendar';
import MissionRewards from '@/components/missions/MissionRewards';
import useRewardView from '@/components/shop/useRewardView';
import IconButton from '@/components/ui/IconButton';
import styles from './InboxScreen.module.css';

type Tab = 'mail' | 'login';

const CLAIM_ERROR: Record<InboxClaimError, string> = {
  closed: 'กล่องจดหมายปิดอยู่',
  unknown: 'ไม่พบจดหมายนี้แล้ว',
  empty: 'จดหมายนี้ไม่มีของแนบ',
  claimed: 'รับของจากจดหมายนี้ไปแล้ว',
  'at-cap': 'ยอดเงินเต็มแล้ว ใช้ของก่อนแล้วค่อยรับ',
  'club-full': 'คลังนักเตะเต็ม เคลียร์ที่ว่างก่อนแล้วค่อยรับ',
  'card-missing': 'การ์ดในจดหมายนี้ถูกลบไปแล้ว ติดต่อแอดมิน',
};

function when(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Date(time).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

/** กล่องจดหมาย — mail from the admin, plus the daily login calendar on a second tab. */
export default function InboxScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, entries, attention, open, claim, claimAll, remove, removeRead } = useInbox();
  const { config: login, canClaim } = useDailyLogin();
  const view = useRewardView();

  const [tab, setTab] = useState<Tab>('mail');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // The selected mail, or the newest when nothing is picked / the pick has gone.
  const selected = useMemo(
    () => entries.find((entry) => entry.mail.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );

  // Opening a mail marks it read the moment it is shown.
  useEffect(() => {
    if (tab === 'mail' && selected && !selected.read) open(selected.mail.id);
  }, [tab, selected, open]);

  const pendingCount = entries.filter((entry) => entry.pending).length;
  const readableCount = entries.filter((entry) => entry.read && !entry.pending).length;

  function report(result: InboxClaimResult) {
    if (result.ok) {
      const text = result.rewards.map((reward) => view(reward).text).join(', ');
      setToast({ id: Date.now(), bad: false, text: `ได้รับ ${text}` });
      if (result.error) {
        // Some went through, then one was refused: say both.
        window.setTimeout(
          () => setToast({ id: Date.now(), bad: true, text: CLAIM_ERROR[result.error!] }),
          2700,
        );
      }
    } else {
      setToast({ id: Date.now(), bad: true, text: CLAIM_ERROR[result.error ?? 'unknown'] });
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />

      <header className={styles.bar}>
        <div className={styles.left}>
          <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
            <ChevronLeft size={38} strokeWidth={3} />
          </button>
          <h1 className={styles.title}>{tab === 'mail' ? config.title : login.title}</h1>
        </div>
        <div className={styles.right}>
          {HOME_CURRENCIES.map((kind) => (
            <CurrencyItem key={kind} currency={currencies[kind]} balance={account.wallet[kind]} />
          ))}
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="หมวด">
        <button
          type="button"
          className={`${styles.tab} ${tab === 'mail' ? styles.tabOn : ''}`}
          aria-pressed={tab === 'mail'}
          onClick={() => setTab('mail')}
        >
          <Mail size={30} strokeWidth={2.2} />
          <span className={styles.tabLabel}>จดหมาย</span>
          {attention > 0 && <span className={styles.tabCount}>{attention > 99 ? '99+' : attention}</span>}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'login' ? styles.tabOn : ''}`}
          aria-pressed={tab === 'login'}
          onClick={() => setTab('login')}
        >
          <CalendarCheck size={30} strokeWidth={2.2} />
          <span className={styles.tabLabel}>เข้าเกมรายวัน</span>
          {canClaim && <span className={styles.tabDot} />}
        </button>
      </nav>

      {tab === 'login' && (
        <main className={styles.body}>
          <DailyLoginCalendar />
        </main>
      )}

      {tab === 'mail' && !config.enabled && <p className={styles.closed}>กล่องจดหมายปิดอยู่ในตอนนี้</p>}

      {tab === 'mail' && config.enabled && (
        <main className={styles.body}>
          <div className={styles.actions}>
            <span className={styles.count}>
              {entries.length} ฉบับ{pendingCount > 0 ? ` · รอรับของ ${pendingCount}` : ''}
            </span>
            <button
              type="button"
              className={styles.primary}
              disabled={pendingCount === 0}
              onClick={() => report(claimAll())}
            >
              <Gift size={22} strokeWidth={2.4} />
              รับของทั้งหมด
            </button>
            <button
              type="button"
              className={styles.ghost}
              disabled={readableCount === 0}
              onClick={() => {
                if (window.confirm(`ลบจดหมายที่อ่านแล้ว ${readableCount} ฉบับ?`)) removeRead();
              }}
            >
              <Trash2 size={22} strokeWidth={2.4} />
              ลบที่อ่านแล้ว
            </button>
          </div>

          <div className={styles.split}>
            <div className={styles.list} role="list">
              {entries.length === 0 && <p className={styles.empty}>ยังไม่มีจดหมาย</p>}
              {entries.map((entry) => {
                const on = selected?.mail.id === entry.mail.id;
                const Icon = entry.pending ? Gift : entry.read ? MailOpen : Mail;
                return (
                  <button
                    type="button"
                    key={entry.mail.id}
                    role="listitem"
                    className={`${styles.row} ${on ? styles.rowOn : ''} ${entry.read ? styles.rowRead : ''}`}
                    onClick={() => setSelectedId(entry.mail.id)}
                  >
                    <span className={`${styles.rowIcon} ${entry.pending ? styles.rowGift : ''}`}>
                      <Icon size={28} strokeWidth={2.2} />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{entry.mail.title || '(ไม่มีหัวข้อ)'}</span>
                      <span className={styles.rowMeta}>
                        {entry.mail.sender || 'ทีมงาน'} · {when(entry.mail.sentAt)}
                      </span>
                    </span>
                    {!entry.read && <span className={styles.rowDot} aria-label="ยังไม่ได้อ่าน" />}
                    {entry.claimedAt && (
                      <span className={styles.rowDone}>
                        <Check size={16} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <article className={styles.detail}>
              {!selected && <p className={styles.empty}>เลือกจดหมายทางซ้ายเพื่ออ่าน</p>}
              {selected && (
                <>
                  <h2 className={styles.detailTitle}>{selected.mail.title || '(ไม่มีหัวข้อ)'}</h2>
                  <p className={styles.detailMeta}>
                    จาก {selected.mail.sender || 'ทีมงาน'} · {when(selected.mail.sentAt)}
                    {selected.mail.expiresAt && ` · หมดอายุ ${when(selected.mail.expiresAt)}`}
                  </p>

                  {/* Split on newlines rather than rendering markup: the body is
                      admin-typed text, and parsed as HTML it would reach every
                      player as an injection point. */}
                  <div className={styles.detailBody}>
                    {selected.mail.body
                      .trimEnd()
                      .split('\n')
                      .map((line, index) =>
                        line.trim() === '' ? <br key={index} /> : <p key={index}>{line}</p>,
                      )}
                  </div>

                  {selected.mail.rewards.length > 0 && (
                    <section className={styles.attach} aria-label="ของแนบ">
                      <span className={styles.attachLabel}>
                        ของแนบ{selected.claimedAt ? ` · รับแล้ว ${when(selected.claimedAt)}` : ''}
                      </span>
                      <MissionRewards rewards={selected.mail.rewards} />
                    </section>
                  )}

                  <div className={styles.detailActions}>
                    {selected.pending && (
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => report(claim(selected.mail.id))}
                      >
                        <Gift size={22} strokeWidth={2.4} />
                        รับของ
                      </button>
                    )}
                    {selected.mail.route && (
                      <button
                        type="button"
                        className={styles.go}
                        onClick={() => navigate(selected.mail.route!)}
                      >
                        ไปที่{ROUTE_LABEL[selected.mail.route]}
                      </button>
                    )}
                    {!selected.pending && (
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => {
                          remove(selected.mail.id);
                          setSelectedId(null);
                        }}
                      >
                        <Trash2 size={22} strokeWidth={2.4} />
                        ลบ
                      </button>
                    )}
                  </div>
                </>
              )}
            </article>
          </div>
        </main>
      )}

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
