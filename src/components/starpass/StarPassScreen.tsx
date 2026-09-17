import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Clock3, Crown, Gift, Home, Lock, Star } from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import { timeLeft } from '@/features/manager/manager';
import { SHOP_PAY_KINDS } from '@/features/shop/types';
import {
  cellStatus,
  currentPass,
  levelOf,
  levelProgress,
  pendingCells,
  premiumPrice,
  type PremiumPayKind,
} from '@/features/starpass/starpass';
import { useStarPass, type StarPassResult } from '@/features/starpass/StarPassContext';
import type { StarPassTrack } from '@/features/starpass/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import CurrencyItem from '@/components/currency/CurrencyItem';
import MissionRewards from '@/components/missions/MissionRewards';
import useRewardView from '@/components/shop/useRewardView';
import IconButton from '@/components/ui/IconButton';
import styles from './StarPassScreen.module.css';

const ERROR: Record<string, string> = {
  closed: 'Star Pass ปิดอยู่',
  unknown: 'ไม่พบขั้นนี้แล้ว',
  locked: 'ยังไม่ถึงขั้นนี้',
  'no-premium': 'ต้องปลดล็อกสายพิเศษก่อน',
  claimed: 'รับรางวัลไปแล้ว',
  nothing: 'ไม่มีรางวัลให้รับตอนนี้',
  owned: 'เปิดสายพิเศษแล้ว',
  'not-sold': 'สายพิเศษไม่ได้ขายด้วยสกุลนี้',
  'insufficient-funds': 'ยอดเงินไม่พอ',
  'at-cap': 'ยอดเงินเต็มแล้ว รับของเพิ่มไม่ได้',
  'club-full': 'คลังนักเตะเต็ม รับการ์ดเพิ่มไม่ได้',
  'card-missing': 'การ์ดในรางวัลนี้ไม่มีแล้ว ติดต่อแอดมิน',
};

/** Width of one level column, in design pixels (see .column). */
const COLUMN_W = 168;

/** Star Pass — a free and a premium reward track over the manager season. */
export default function StarPassScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, season, endsAt, refresh, claim, claimEverything, buy } = useStarPass();
  const view = useRewardView();
  const [now, setNow] = useState(() => new Date());
  const [buying, setBuying] = useState<PremiumPayKind | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null);
  const lane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pass = useMemo(() => currentPass(account.starpass, season), [account.starpass, season]);
  const reached = levelOf(pass.xp, config);
  const step = levelProgress(pass.xp, config);
  const pending = pendingCells(pass, config);
  const waiting = pending.length;
  const offers = SHOP_PAY_KINDS.map((kind) => ({ kind, price: premiumPrice(config, kind) })).filter(
    (offer): offer is { kind: PremiumPayKind; price: number } => offer.price !== null,
  );

  // Open on the first reward waiting to be claimed — or, with none, on the level
  // being worked on — with one column of context to its left.
  const firstWaiting = pending[0] ? config.levels.indexOf(pending[0].level) : reached;
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !lane.current) return;
    opened.current = true;
    lane.current.style.scrollBehavior = 'auto';
    lane.current.scrollLeft = Math.max(0, (firstWaiting - 1) * COLUMN_W);
    lane.current.style.scrollBehavior = '';
  }, [firstWaiting]);

  function report(result: StarPassResult, done: string) {
    setToast({
      id: Date.now(),
      bad: !result.ok,
      text: result.ok
        ? result.rewards.length > 0
          ? `ได้รับ ${result.rewards.map((reward) => view(reward).text).join(', ')}`
          : done
        : (ERROR[result.error ?? ''] ?? 'ทำรายการไม่สำเร็จ'),
    });
  }

  function cell(index: number, track: StarPassTrack) {
    const level = config.levels[index]!;
    const rewards = level[track];
    const status = cellStatus(pass, config, index, track);
    const empty = rewards.length === 0;
    const premiumLock = track === 'premium' && !pass.premium && status !== 'claimed';
    return (
      <button
        type="button"
        className={`${styles.cell} ${styles[track]} ${styles[status]} ${empty ? styles.empty : ''}`}
        disabled={status !== 'ready' || empty}
        onClick={() => report(claim(level.id, track), 'รับแล้ว')}
        aria-label={`ขั้น ${index + 1} ${track === 'free' ? 'ฟรี' : 'พิเศษ'}`}
      >
        {!empty && <MissionRewards rewards={rewards} className={styles.rewards} />}
        {status === 'ready' && !empty && <span className={styles.take}>รับ</span>}
        {status === 'claimed' && !empty && (
          <span className={styles.check}>
            <Check size={40} strokeWidth={3.4} />
          </span>
        )}
        {premiumLock && !empty && (
          <span className={styles.lock}>
            <Lock size={22} strokeWidth={2.6} />
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />

      <header className={styles.bar}>
        <div className={styles.left}>
          <button type="button" className={styles.back} onClick={back} aria-label="ย้อนกลับ">
            <ChevronLeft size={38} strokeWidth={3} />
          </button>
          <h1 className={styles.title}>{config.title || 'STAR PASS'}</h1>
          {config.enabled && (
            <span className={styles.season}>
              <Clock3 size={20} strokeWidth={2.4} />
              ซีซั่นจบใน {timeLeft(endsAt, now)}
            </span>
          )}
        </div>
        <div className={styles.right}>
          {[...SHOP_PAY_KINDS].reverse().map((kind) => (
            <CurrencyItem key={kind} currency={currencies[kind]} balance={account.wallet[kind]} />
          ))}
          <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
            <Home size={40} strokeWidth={2} />
          </IconButton>
        </div>
      </header>

      {!config.enabled || config.levels.length === 0 ? (
        <p className={styles.closed}>Star Pass ปิดอยู่ในตอนนี้</p>
      ) : (
        <>
          <aside className={styles.side}>
            <div className={styles.levelBadge}>
              <Star className={styles.levelStar} size={150} strokeWidth={1.2} />
              <span className={styles.levelText}>
                <small>ขั้น</small>
                {reached}
              </span>
            </div>
            <span className={styles.levelOf}>จาก {config.levels.length} ขั้น</span>

            <div className={styles.xp}>
              <div className={styles.xpBar}>
                <div className={styles.xpFill} style={{ width: `${(step.into / step.need) * 100}%` }} />
              </div>
              <span className={styles.xpText}>
                {step.maxed ? 'ครบทุกขั้นแล้ว' : `XP ${formatCurrency(step.into)}/${formatCurrency(step.need)}`}
              </span>
            </div>

            {pass.premium ? (
              <div className={`${styles.premiumCard} ${styles.premiumOn}`}>
                <Crown size={34} strokeWidth={2.2} />
                <span>สายพิเศษเปิดแล้ว</span>
              </div>
            ) : (
              <div className={styles.premiumCard}>
                <span className={styles.premiumTitle}>
                  <Crown size={28} strokeWidth={2.2} />
                  ปลดล็อกสายพิเศษ
                </span>
                <span className={styles.premiumNote}>รับรางวัลสายพิเศษทุกขั้น รวมขั้นที่ผ่านมาแล้ว</span>
                {offers.length === 0 && <span className={styles.premiumNote}>ติดต่อแอดมินเพื่อเปิดสายพิเศษ</span>}
                <div className={styles.buyRow}>
                  {offers.map((offer) => (
                    <button
                      type="button"
                      key={offer.kind}
                      className={styles.buy}
                      onClick={() => setBuying(offer.kind)}
                    >
                      <img src={currencies[offer.kind].icon} alt="" />
                      {formatCurrency(offer.price)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className={styles.claimAll}
              disabled={waiting === 0}
              onClick={() => report(claimEverything(), 'รับแล้ว')}
            >
              <Gift size={26} strokeWidth={2.4} />
              รับทั้งหมด{waiting > 0 ? ` (${waiting})` : ''}
            </button>

            <ul className={styles.sources}>
              <li>
                รับรางวัลภารกิจ: XP{' '}
                {config.missionRate === 100 ? '= แต้มภารกิจ' : `= แต้มภารกิจ × ${config.missionRate}%`}
              </li>
              <li>
                แข่งเมเนเจอร์จบนัด: ชนะ +{config.matchWin} · เสมอ +{config.matchDraw} · แพ้ +{config.matchLoss}
              </li>
            </ul>
          </aside>

          <main className={styles.track}>
            <div className={styles.labels}>
              <span className={styles.label}>ฟรี</span>
              <span className={styles.labelLevel}>ขั้น</span>
              <span className={`${styles.label} ${styles.labelPremium}`}>
                <Crown size={26} strokeWidth={2.4} />
                พิเศษ
              </span>
            </div>
            <div className={styles.lane} ref={lane}>
              {config.levels.map((level, index) => (
                <div key={level.id} className={styles.column}>
                  {cell(index, 'free')}
                  <div className={`${styles.step} ${index < reached ? styles.stepOn : ''}`}>
                    <span className={styles.stepLine} />
                    <span className={styles.stepDot}>{index + 1}</span>
                  </div>
                  {cell(index, 'premium')}
                </div>
              ))}
            </div>
          </main>
        </>
      )}

      {buying && (
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="ซื้อสายพิเศษ">
          <div className={styles.dialogBackdrop} onClick={() => setBuying(null)} />
          <div className={styles.dialogPanel}>
            <Crown size={56} strokeWidth={2} className={styles.dialogCrown} />
            <h2 className={styles.dialogTitle}>ปลดล็อกสายพิเศษ</h2>
            <p className={styles.dialogText}>
              จ่าย <img src={currencies[buying].icon} alt="" /> {formatCurrency(premiumPrice(config, buying) ?? 0)}{' '}
              เพื่อเปิดสายพิเศษของซีซั่นนี้
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.cancel} onClick={() => setBuying(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className={styles.confirm}
                onClick={() => {
                  report(buy(buying), 'เปิดสายพิเศษแล้ว');
                  setBuying(null);
                }}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className={`${styles.toast} ${toast.bad ? styles.toastBad : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
