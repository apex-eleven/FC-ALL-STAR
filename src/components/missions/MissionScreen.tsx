import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronsUp,
  Clock3,
  Goal,
  HandCoins,
  Home,
  ShieldHalf,
  ShoppingCart,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { HOME_CURRENCIES } from '@/features/currencies/constants';
import { timeLeft } from '@/features/manager/manager';
import { PERIOD_LABEL, metricInfo } from '@/features/missions/constants';
import { useMissions } from '@/features/missions/MissionContext';
import {
  chestsOf,
  countOf,
  currentProgress,
  missionTitle,
  missionsOf,
  periodEnd,
  statusOf,
} from '@/features/missions/missions';
import {
  MISSION_PERIODS,
  type MissionChest,
  type MissionMetric,
  type MissionPeriod,
  type MissionReward,
  type MissionStatus,
} from '@/features/missions/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import CurrencyItem from '@/components/currency/CurrencyItem';
import useRewardView from '@/components/shop/useRewardView';
import IconButton from '@/components/ui/IconButton';
import MissionChestTrack from './MissionChestTrack';
import MissionRewards from './MissionRewards';
import styles from './MissionScreen.module.css';

const ICONS: Record<MissionMetric, LucideIcon> = {
  login: CalendarCheck,
  'manager-play': Swords,
  'manager-win': Trophy,
  'manager-goal': Goal,
  'draft-pull': Sparkles,
  'rankup-try': ChevronsUp,
  'rankup-success': ChevronsUp,
  'league-play': ShieldHalf,
  'league-win': ShieldHalf,
  'transfer-buy': UserPlus,
  'transfer-sell': HandCoins,
  'shop-buy': ShoppingCart,
};

const CLAIM_ERROR: Record<string, string> = {
  closed: 'ภารกิจปิดอยู่',
  unknown: 'ไม่พบภารกิจนี้แล้ว',
  'not-ready': 'ยังทำภารกิจไม่ครบ',
  claimed: 'รับรางวัลไปแล้ว',
  'at-cap': 'ยอดเงินเต็มแล้ว รับของเพิ่มไม่ได้',
  'club-full': 'คลังนักเตะเต็ม รับการ์ดเพิ่มไม่ได้',
  'card-missing': 'การ์ดในรางวัลนี้ไม่มีแล้ว ติดต่อแอดมิน',
};

/** Ready to claim first, then in progress, finished last — admin order within each. */
const ORDER: Record<MissionStatus, number> = { ready: 0, progress: 1, claimed: 2 };

/** ภารกิจ — daily and weekly missions, with a chest track per period. */
export default function MissionScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, claim, openChest } = useMissions();
  const view = useRewardView();
  const [period, setPeriod] = useState<MissionPeriod>('daily');
  const [now, setNow] = useState(() => new Date());
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const progress = useMemo(() => currentProgress(account.missions, now, config), [account.missions, now, config]);

  const rows = useMemo(
    () =>
      missionsOf(config, period)
        .map((mission, index) => ({ mission, index, status: statusOf(progress, mission) }))
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.index - b.index),
    [config, period, progress],
  );

  function report(result: { ok: boolean; error: string | null; rewards: MissionReward[] }) {
    setToast({
      id: Date.now(),
      bad: !result.ok,
      text: result.ok
        ? `ได้รับ ${result.rewards.map((reward) => view(reward).text).join(', ') || 'แต้มภารกิจ'}`
        : (CLAIM_ERROR[result.error ?? ''] ?? 'รับรางวัลไม่สำเร็จ'),
    });
  }

  const chests = chestsOf(config, period);

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />

      <header className={styles.bar}>
        <div className={styles.left}>
          <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
            <ChevronLeft size={38} strokeWidth={3} />
          </button>
          <h1 className={styles.title}>ภารกิจ</h1>
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

      {!config.enabled ? (
        <p className={styles.closed}>ภารกิจปิดอยู่ในตอนนี้</p>
      ) : (
        <>
          <nav className={styles.tabs} aria-label="ประเภทภารกิจ">
            {MISSION_PERIODS.map((entry) => (
              <button
                type="button"
                key={entry}
                className={`${styles.tab} ${entry === period ? styles.tabOn : ''}`}
                aria-pressed={entry === period}
                onClick={() => setPeriod(entry)}
              >
                <span className={styles.tabLabel}>{PERIOD_LABEL[entry]}</span>
                <span className={styles.tabReset}>
                  <Clock3 size={16} strokeWidth={2.4} />
                  รีเซ็ตใน {timeLeft(periodEnd(entry, now, config), now)}
                </span>
              </button>
            ))}
          </nav>

          <main className={styles.body}>
            {chests.length > 0 && (
              <MissionChestTrack
                period={period}
                chests={chests}
                progress={progress}
                onOpen={(chest: MissionChest) => report(openChest(period, chest.id))}
              />
            )}

            <div className={styles.list}>
              {rows.length === 0 && <p className={styles.empty}>ยังไม่มีภารกิจ{PERIOD_LABEL[period]}</p>}

              {rows.map(({ mission, status }) => {
                const Icon = ICONS[mission.metric];
                const count = countOf(progress, mission);
                const route = metricInfo(mission.metric).route;
                return (
                  <article key={mission.id} className={`${styles.row} ${styles[status]}`}>
                    <span className={styles.icon}>
                      <Icon size={40} strokeWidth={2.2} />
                    </span>

                    <div className={styles.info}>
                      <h2 className={styles.name}>{missionTitle(mission)}</h2>
                      <div className={styles.meter}>
                        <div className={styles.meterBar}>
                          <div
                            className={styles.meterFill}
                            style={{ width: `${(count / mission.target) * 100}%` }}
                          />
                        </div>
                        <span className={styles.meterText}>
                          {count.toLocaleString('en-US')}/{mission.target.toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>

                    {mission.points > 0 && (
                      <span className={styles.points}>
                        +{mission.points}
                        <small>แต้ม</small>
                      </span>
                    )}

                    <MissionRewards rewards={mission.rewards} className={styles.rewards} />

                    {status === 'ready' && (
                      <button type="button" className={styles.claim} onClick={() => report(claim(mission.id))}>
                        รับรางวัล
                      </button>
                    )}
                    {status === 'progress' &&
                      (route ? (
                        <button type="button" className={styles.go} onClick={() => navigate(route)}>
                          ไปเลย
                        </button>
                      ) : (
                        <span className={styles.wait}>กำลังทำ</span>
                      ))}
                    {status === 'claimed' && (
                      <span className={styles.done}>
                        <Check size={24} strokeWidth={3} />
                        สำเร็จ
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          </main>
        </>
      )}

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
