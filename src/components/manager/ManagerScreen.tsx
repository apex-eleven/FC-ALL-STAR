import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ClipboardList,
  Clock3,
  Home,
  Info,
  Plus,
  Shirt,
  ShoppingCart,
  Triangle,
  Volleyball,
  Wifi,
} from 'lucide-react';
import { currencies } from '@/data/mock/currencies';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import { BACKGROUND_FILE, FIGURE_FILE } from '@/features/manager/constants';
import { nextMilestone, seasonEnd, timeLeft } from '@/features/manager/manager';
import {
  useManager,
  type LiveMatch,
  type ManagerPlayResult,
} from '@/features/manager/ManagerContext';
import type { MatchEngine } from '@/features/manager/matchEngine';
import { useNavigation } from '@/features/navigation/NavigationContext';
import IconButton from '@/components/ui/IconButton';
import { avatarSrc } from './avatarSrc';
import ManagerDialog, { type ManagerDialogMode } from './ManagerDialog';
import ManagerLiveMatch from './ManagerLiveMatch';
import ManagerMatchOverlay from './ManagerMatchOverlay';
import ManagerLadderScreen from './ManagerLadderScreen';
import ManagerTrophy from './ManagerTrophy';
import TierStars from './TierStars';
import styles from './ManagerScreen.module.css';

const PLAY_ERROR: Record<string, string> = {
  closed: 'โหมดนี้ปิดอยู่ชั่วคราว',
  'no-squad': 'จัดตัวจริงในทีมก่อนลงแข่ง',
};

/** Round-trip time the browser reports, when it reports one. */
function networkRtt(): number | null {
  const connection = (navigator as Navigator & { connection?: { rtt?: number } }).connection;
  return typeof connection?.rtt === 'number' && connection.rtt > 0 ? connection.rtt : null;
}

/**
 * เมเนเจอร์โหมด — the play screen.
 *
 * Left column: season countdown and title, the mode logo, the weekly-reward
 * carousel, the club card, three shortcuts, and the squad OVR. Centre: the admin's
 * figure art. Right: the tier, its stars and trophy, the weekly win track with the
 * next reward, and the two play buttons.
 */
export default function ManagerScreen() {
  const account = useAccount();
  const { back, navigate } = useNavigation();
  const { config, state, rating, leaderboardRank, ladder, refreshOpponents, prepare, finish, forfeit } =
    useManager();
  const [now, setNow] = useState(() => new Date());
  const [slide, setSlide] = useState(0);
  const [dialog, setDialog] = useState<ManagerDialogMode | null>(null);
  const [leaderboard, setLeaderboard] = useState(false);
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [result, setResult] = useState<{
    result: ManagerPlayResult;
    ranked: boolean;
    scorers: MatchEngine['scorers'];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const [figureFailed, setFigureFailed] = useState(false);

  useEffect(() => {
    refreshOpponents();
  }, [refreshOpponents]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const banners = config.banners;
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = window.setInterval(() => setSlide((index) => (index + 1) % banners.length), 5000);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const tier = state ? config.tiers[state.tier] : undefined;
  const milestone = state ? nextMilestone(state, config) : null;
  const weekWins = state?.weekWins ?? 0;
  const rtt = useMemo(() => networkRtt(), []);

  // The bar fills toward the next milestone; once all are paid it stays full.
  const target = milestone?.wins ?? config.milestones[config.milestones.length - 1]?.wins ?? 0;
  const progress = target > 0 ? Math.min(1, weekWins / target) : 0;
  const nextIndex = milestone ? config.milestones.indexOf(milestone) : -1;
  const reward = milestone?.rewards[0];

  const background = config.background || BACKGROUND_FILE;
  const figure = config.figure || FIGURE_FILE;
  const banner = banners[Math.min(slide, banners.length - 1)];

  function start(ranked: boolean) {
    if (live) return;
    const prepared = prepare(ranked);
    if (!prepared.ok) {
      setToast(PLAY_ERROR[prepared.error] ?? 'เริ่มแมตช์ไม่สำเร็จ');
      return;
    }
    setResult(null);
    setLive(prepared.live);
  }

  // Stable, so the live match's frame loop is not restarted by a re-render here.
  const handleFinished = useCallback(
    (score: [number, number], scorers: MatchEngine['scorers']) => {
      if (!live) return;
      const settled = finish(live, score);
      setLive(null);
      if (settled.ok) setResult({ result: settled, ranked: live.ranked, scorers });
      else setToast('บันทึกผลไม่สำเร็จ');
    },
    [live, finish],
  );

  const handleForfeit = useCallback(() => {
    if (!live) return;
    const settled = forfeit(live);
    setLive(null);
    if (settled.ok && settled.match) setResult({ result: settled, ranked: live.ranked, scorers: [] });
  }, [live, forfeit]);

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />
      {!backgroundFailed && (
        <img
          className={styles.background}
          src={background}
          alt=""
          draggable={false}
          onError={() => setBackgroundFailed(true)}
        />
      )}
      {backgroundFailed && (
        <span className={styles.watermark} aria-hidden="true">
          {config.modeName}
        </span>
      )}
      <div className={styles.shade} />

      {!figureFailed && (
        <img
          className={styles.figure}
          src={figure}
          alt=""
          draggable={false}
          onError={() => setFigureFailed(true)}
        />
      )}

      {/* ---- header ---- */}
      <button type="button" className={styles.back} data-sound="back" onClick={back} aria-label="ย้อนกลับ">
        <ChevronLeft size={44} strokeWidth={3} />
      </button>
      <div className={styles.heading}>
        <span className={styles.season}>
          ซีซั่นสิ้นสุดใน: <b>{timeLeft(seasonEnd(now, config), now)}</b>
        </span>
        <span className={styles.titleRow}>
          <h1 className={styles.title}>{config.title}</h1>
          {/* Follows the title rather than sitting at a fixed x, so a longer mode
              name never runs under it. */}
          <button
            type="button"
            className={styles.info}
            onClick={() => setDialog('rules')}
            aria-label="กติกา"
          >
            <Info size={50} strokeWidth={2.6} />
          </button>
        </span>
      </div>

      <div className={styles.topRight}>
        <span className={styles.balance}>
          <img src={currencies[config.headerCurrency].icon} alt="" />
          <span>{formatCurrency(account.wallet[config.headerCurrency])}</span>
          <Plus className={styles.plus} size={22} strokeWidth={3.4} />
        </span>
        <IconButton label="กิจกรรม" size={46}>
          <Volleyball size={42} strokeWidth={2} />
        </IconButton>
        <IconButton label="ร้านค้า" size={46} onClick={() => navigate('shop')}>
          <ShoppingCart size={42} strokeWidth={2} />
        </IconButton>
        <IconButton label="หน้าหลัก" size={46} onClick={() => navigate('home')}>
          <Home size={42} strokeWidth={2} />
        </IconButton>
        <span className={styles.ping}>
          <Wifi size={34} strokeWidth={2.6} />
          {rtt !== null && <small>{rtt}ms</small>}
        </span>
      </div>

      {/* ---- left column ---- */}
      <div className={styles.logo}>
        <svg className={styles.mark} viewBox="0 0 100 100" aria-hidden="true">
          <path d="M2 8 L34 8 L50 58 L66 8 L98 8 L56 96 L44 96 Z" />
          <path className={styles.markCut} d="M40 8 L60 8 L50 36 Z" />
        </svg>
        <span className={styles.modeName}>{config.modeName}</span>
      </div>

      {banner && (
        <button type="button" className={styles.banner} onClick={() => setDialog('rewards')}>
          {banner.image ? (
            <img className={styles.bannerArt} src={banner.image} alt="" draggable={false} />
          ) : (
            <span className={styles.bannerFallback}>
              <img src={currencies[reward?.kind ?? 'gem'].icon} alt="" />
            </span>
          )}
          {banner.title && <span className={styles.bannerTitle}>{banner.title}</span>}
          {banner.tag && <span className={styles.bannerTag}>{banner.tag}</span>}
          {banners.length > 1 && (
            <span className={styles.dots}>
              {banners.map((entry, index) => (
                <span key={entry.id} className={index === slide ? styles.dotOn : styles.dot} />
              ))}
            </span>
          )}
        </button>
      )}

      {/* Player ID and leaderboard place. */}
      <button type="button" className={styles.clubCard} onClick={() => setLeaderboard(true)} aria-label="Leaderboard แรงค์">
        <span className={styles.clubIcon}>
          <img src={avatarSrc(account.avatarId)} alt="" draggable={false} />
        </span>
        <span className={styles.clubName}>{account.username}</span>
        <span className={styles.clubCount} title="อันดับ Leaderboard">
          <b>{leaderboardRank ?? '-'}</b>
          <BarChart3 size={30} strokeWidth={3} />
        </span>
      </button>

      <div className={styles.rounds}>
        <button type="button" className={styles.round} onClick={() => navigate('club')} aria-label="ทีมของฉัน">
          <Shirt size={48} strokeWidth={2.2} fill="currentColor" />
        </button>
        <button type="button" className={styles.round} onClick={() => navigate('club')} aria-label="สโมสร">
          <svg viewBox="0 0 48 48" width="50" height="50" aria-hidden="true">
            <rect x="4" y="9" width="40" height="30" rx="2" fill="none" stroke="currentColor" strokeWidth="3.4" />
            <line x1="24" y1="9" x2="24" y2="39" stroke="currentColor" strokeWidth="3" />
            <circle cx="24" cy="24" r="5.5" fill="none" stroke="currentColor" strokeWidth="3" />
            <rect x="4" y="17" width="7" height="14" fill="none" stroke="currentColor" strokeWidth="3" />
            <rect x="37" y="17" width="7" height="14" fill="none" stroke="currentColor" strokeWidth="3" />
          </svg>
        </button>
        <button type="button" className={styles.round} onClick={() => setDialog('history')} aria-label="ประวัติการแข่ง">
          <span className={styles.historyIcon}>
            <ClipboardList size={46} strokeWidth={2.2} />
            <Clock3 className={styles.historyClock} size={24} strokeWidth={2.8} />
          </span>
        </button>
      </div>

      <button type="button" className={styles.squad} onClick={() => navigate('club')}>
        <span>ทีมของฉัน</span>
        <b>{rating}</b>
        <Triangle className={styles.squadCaret} size={22} strokeWidth={0} fill="currentColor" />
      </button>

      {/* ---- right column ---- */}
      {tier && state && (
        <>
          <h2 className={styles.tierName}>{tier.name}</h2>
          <div className={styles.stars}>
            <TierStars total={tier.stars} filled={state.stars} size={62} />
          </div>
          <button type="button" className={styles.trophy} onClick={() => setDialog('rules')} aria-label="แรงค์ทั้งหมด">
            <ManagerTrophy image={tier.image} name={tier.name} />
          </button>
        </>
      )}

      {config.milestones.length > 0 && (
        <>
          <span className={styles.count}>
            {weekWins}/{target}
          </span>
          <span className={styles.bar}>
            <span className={styles.barFill} style={{ width: `${progress * 100}%` }} />
          </span>

          {reward && nextIndex >= 0 && (
            <button
              type="button"
              className={styles.chest}
              style={{
                left: `calc(var(--track-left) + (var(--track-width) / ${config.milestones.length}) * ${
                  nextIndex + 0.5
                })`,
              }}
              onClick={() => setDialog('rewards')}
              aria-label="รางวัลถัดไป"
            >
              <span className={styles.chestIcons}>
                <img src={currencies[reward.kind].icon} alt="" />
                <img src={currencies[reward.kind].icon} alt="" />
                <img src={currencies[reward.kind].icon} alt="" />
              </span>
              <span className={styles.chestAmount}>x{formatCurrency(reward.amount)}</span>
            </button>
          )}

          <span className={styles.track}>
            {config.milestones.map((entry, index) => (
              <span
                key={entry.id}
                className={`${styles.segment} ${
                  state?.claimed.includes(entry.id)
                    ? styles.segmentDone
                    : index === nextIndex
                      ? styles.segmentNext
                      : ''
                }`}
              />
            ))}
          </span>
        </>
      )}

      <button
        type="button"
        className={styles.unranked}
        disabled={!config.enabled || live !== null}
        onClick={() => start(false)}
      >
        เล่นแมตช์ไม่จัดอันดับ
      </button>
      <button
        type="button"
        className={styles.play}
        disabled={!config.enabled || live !== null}
        onClick={() => start(true)}
      >
        <Volleyball size={44} strokeWidth={2.4} />
        เล่น
      </button>

      {!config.enabled && <div className={styles.closed}>โหมดนี้ปิดอยู่ชั่วคราว</div>}
      {toast && <div className={styles.toast}>{toast}</div>}

      {live && (
        <ManagerLiveMatch
          key={live.id}
          live={live}
          onFinished={handleFinished}
          onForfeit={handleForfeit}
        />
      )}

      {result && (
        <ManagerMatchOverlay
          result={result.result}
          ranked={result.ranked}
          tiers={config.tiers}
          scorers={result.scorers}
          onAgain={() => start(result.ranked)}
          onClose={() => setResult(null)}
        />
      )}

      {dialog && <ManagerDialog mode={dialog} onClose={() => setDialog(null)} />}

      {leaderboard && (
        <ManagerLadderScreen
          selfUid={account.id}
          ladder={ladder}
          onRefresh={refreshOpponents}
          onClose={() => setLeaderboard(false)}
        />
      )}
    </div>
  );
}
