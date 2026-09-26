import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  FastForward,
  Gift,
  Home,
  Medal,
  Play,
  ShoppingBag,
  Ticket,
  Trophy,
  X,
} from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import { avatarSource } from '@/features/avatars/extraAvatars';
import { formatCurrency } from '@/features/currencies/constants';
import { currencies } from '@/data/mock/currencies';
import { useCup, type CupPlayResult } from '@/features/cup/CupContext';
import { CUP_LABEL, isTitleBand, roundCount, roundName } from '@/features/cup/constants';
import {
  championOf,
  countdown,
  nextOpen,
  nextReward,
  opponentIn,
  roundsWon,
  tieForYou,
  windowEnd,
} from '@/features/cup/cup';
import type { LiveMatch } from '@/features/manager/ManagerContext';
import useRewardView from '@/components/shop/useRewardView';
import ManagerLiveMatch from '@/components/manager/ManagerLiveMatch';
import type { CupClaimError, CupEnterError, CupKind, CupPlayError, CupRun } from '@/features/cup/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import CupBracket from './CupBracket';
import CupChampionPanel from './CupChampionPanel';
import CupShop from './CupShop';
import CupResultOverlay, { type CupResultView } from './CupResultOverlay';
import styles from './CupScreen.module.css';

/**
 * ฟุตบอลถ้วย — the screen behind the bottom bar's cup button.
 *
 * Two competitions, one at a time: a tab for each, the bracket in the middle, and
 * one bar along the bottom that does the next thing — NEW CUP, PLAY MATCH, or CLAIM
 * REWARD. Every one of those reads the run's status; the screen never decides where
 * the player stands, it only shows it.
 */

const ENTER_ERROR: Record<CupEnterError, string> = {
  closed: 'ถ้วยปิดอยู่',
  'no-squad': 'ต้องจัดทีมตัวจริงก่อนถึงจะลงแข่งได้',
  'not-open': 'ถ้วยนี้ยังไม่เปิด',
  'no-entries': 'สิทธิ์สมัครรอบนี้หมดแล้ว',
  'in-progress': 'ยังแข่งถ้วยนี้ไม่จบ',
  unclaimed: 'กดรับรางวัลแชมป์ก่อน แล้วค่อยเริ่มถ้วยใหม่',
  'cannot-afford': 'ค่าสมัครไม่พอ',
};

const PLAY_ERROR: Record<CupPlayError, string> = {
  closed: 'ถ้วยปิดอยู่',
  'no-run': 'ยังไม่ได้สมัครถ้วยนี้',
  finished: 'ถ้วยนี้แข่งจบแล้ว',
  'in-play': 'นัดนี้กำลังแข่งอยู่',
  'not-live': 'นัดนี้บันทึกผลไปแล้ว',
  stale: 'นัดนี้บันทึกผลไปแล้ว',
};

const CLAIM_ERROR: Record<CupClaimError, string> = {
  'no-run': 'ไม่พบถ้วยนี้',
  'not-champion': 'ยังไม่ได้เป็นแชมป์',
  'already-claimed': 'รับรางวัลนี้ไปแล้ว',
  'club-full': 'สโมสรเต็ม — ขายหรือปล่อยการ์ดก่อนแล้วกดรับใหม่',
  'card-missing': 'การ์ดรางวัลถูกลบออกจากระบบ แจ้งแอดมิน',
  'at-cap': 'ยอดเงินชนเพดานแล้ว ใช้ก่อนแล้วกดรับใหม่',
};

function viewOf(outcome: CupPlayResult, forfeit = false): CupResultView | null {
  if (!outcome.tie) return null;
  return {
    tie: outcome.tie,
    run: outcome.run,
    through: outcome.through,
    paid: outcome.paid,
    tokens: outcome.tokens,
    result: outcome.result,
    forfeit,
  };
}

export default function CupScreen() {
  const account = useAccount();
  const { navigate } = useNavigation();
  const {
    config,
    state,
    rating,
    left,
    open,
    refreshOpponents,
    enter,
    simulate,
    kickOff,
    finishLive,
    forfeitLive,
    claim,
    abandoned,
    clearAbandoned,
  } = useCup();

  const rewardView = useRewardView();
  const [kind, setKind] = useState<CupKind>('daily');
  const [toast, setToast] = useState('');
  const [view, setView] = useState<CupResultView | null>(null);
  const [live, setLive] = useState<{ kind: CupKind; match: LiveMatch } | null>(null);
  // The champion panel of a claimed run can be put away to look at the bracket.
  const [hiddenPanel, setHiddenPanel] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  // Ticks the window countdown. Everything else on this screen changes only on a press.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    refreshOpponents();
  }, [refreshOpponents]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** A tie abandoned on an earlier load was settled as a forfeit — say so, once. */
  useEffect(() => {
    if (!abandoned) return;
    setKind(abandoned.kind);
    setView(viewOf(abandoned.outcome, true));
    clearAbandoned();
  }, [abandoned, clearAbandoned]);

  const competition = config[kind];
  const run: CupRun | null = state?.runs[kind] ?? null;
  const currency = currencies[competition.entryCurrency];
  const balance = account.wallet[competition.entryCurrency];

  const won = run ? roundsWon(run) : 0;
  const tie = run ? tieForYou(run) : null;
  const opponent = run && tie ? opponentIn(run, tie) : undefined;
  const ahead = run && run.status === 'running' ? nextReward(run, competition) : null;
  const size = run?.size ?? competition.size;

  const closesIn = useMemo(() => {
    if (!open[kind]) {
      const opens = nextOpen(now, config, competition);
      return opens ? `เปิดอีก ${countdown(opens, now)}` : '';
    }
    return `ปิดอีก ${countdown(windowEnd(now, config, competition), now)}`;
  }, [open, kind, now, config, competition]);

  const entriesLeftNow = left[kind];
  const blockedBy: CupEnterError | null = !open[kind]
    ? 'not-open'
    : run?.status === 'running'
      ? 'in-progress'
      : run?.status === 'champion'
        ? 'unclaimed'
        : entriesLeftNow <= 0
          ? 'no-entries'
          : rating <= 0
            ? 'no-squad'
            : null;
  const canEnter = blockedBy === null;
  const busy = live !== null;

  const onEnter = useCallback(() => {
    const result = enter(kind);
    if (!result.ok) {
      setToast(ENTER_ERROR[result.error]);
      return;
    }
    setHiddenPanel(null);
    setToast('จับสลากประกบคู่เรียบร้อย');
  }, [enter, kind]);

  const onSimulate = useCallback(() => {
    if (busy) return;
    const outcome = simulate(kind);
    if (!outcome.ok) {
      setToast(PLAY_ERROR[outcome.error ?? 'no-run']);
      return;
    }
    setView(viewOf(outcome));
  }, [busy, simulate, kind]);

  const onPlay = useCallback(() => {
    if (busy) return;
    const started = kickOff(kind);
    if (!started.ok) {
      setToast(PLAY_ERROR[started.error]);
      return;
    }
    setLive({ kind, match: started.live });
  }, [busy, kickOff, kind]);

  // Stable, so the live match's frame loop is not restarted by a re-render here.
  const onLiveFinished = useCallback(
    (score: [number, number]) => {
      if (!live) return;
      const outcome = finishLive(live.kind, live.match, score);
      setLive(null);
      if (outcome.ok) setView(viewOf(outcome));
      else setToast(PLAY_ERROR[outcome.error ?? 'no-run']);
    },
    [live, finishLive],
  );

  const onLiveForfeit = useCallback(() => {
    if (!live) return;
    const outcome = forfeitLive(live.kind, live.match);
    setLive(null);
    if (outcome.ok) setView(viewOf(outcome, true));
  }, [live, forfeitLive]);

  const onClaim = useCallback(() => {
    const outcome = claim(kind);
    if (!outcome.ok) {
      setToast(CLAIM_ERROR[outcome.error ?? 'no-run']);
      return;
    }
    setToast('รับรางวัลแชมป์เรียบร้อย');
  }, [claim, kind]);

  const panelOpen =
    run !== null &&
    (run.status === 'champion' || (run.status === 'completed' && hiddenPanel !== run.id));

  /** The round the player went out in, for the ELIMINATED line. */
  const outIn = run && run.status === 'out' ? Math.min(won, run.rounds.length - 1) : -1;
  const winner = run ? championOf(run) : undefined;

  const background = competition.background || `/brand/cup_background.jpg`;

  return (
    <div className={styles.screen}>
      <div className={styles.backdrop} />
      <div className={styles.photo} style={{ backgroundImage: `url('${background}')` }} />
      <div className={styles.scrim} />

      <button type="button" className={styles.back} onClick={() => navigate('home')} aria-label="ย้อนกลับ">
        <ChevronLeft size={24} />
      </button>
      <button type="button" className={styles.home} onClick={() => navigate('home')} aria-label="หน้าหลัก">
        <Home size={22} />
      </button>

      <header className={styles.header}>
        <div className={styles.tabs} role="tablist">
          {(['daily', 'weekend'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={kind === id}
              className={`${styles.tab} ${kind === id ? styles.tabOn : ''}`}
              onClick={() => setKind(id)}
              disabled={busy}
            >
              <Trophy size={18} />
              <span>{config[id].name || CUP_LABEL[id]}</span>
              {!open[id] && <em className={styles.tabShut}>ปิด</em>}
            </button>
          ))}
        </div>

        <div className={styles.headerRight}>
          <span className={styles.clock}>{closesIn}</span>
          <button
            type="button"
            className={`${styles.wallet} ${styles.shopButton}`}
            onClick={() => setShopOpen(true)}
            disabled={busy || !config.shop.enabled}
            title="ร้าน Cup Token"
          >
            <Medal size={24} className={styles.tokenIcon} />
            {formatCurrency(state?.tokens ?? 0)}
            {config.shop.enabled && (
              <span className={styles.shopLabel}>
                <ShoppingBag size={16} /> ร้าน
              </span>
            )}
          </button>
          <span className={styles.wallet}>
            <img src={currency.icon} alt="" width={26} height={26} />
            {formatCurrency(balance)}
          </span>
        </div>
      </header>

      <section className={styles.body}>
        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>{competition.name || CUP_LABEL[kind]}</h2>
          <p className={styles.panelNote}>
            แพ้ตกรอบ · {size} ทีม · ชนะ {roundCount(size)} นัดได้แชมป์
          </p>

          <dl className={styles.stats}>
            <div>
              <dt>OVR ทีมคุณ</dt>
              <dd>{rating}</dd>
            </div>
            <div>
              <dt>สิทธิ์สมัคร</dt>
              <dd>
                {entriesLeftNow}/{competition.entries}
              </dd>
            </div>
            <div>
              <dt>ถ้วยที่ได้</dt>
              <dd>{state?.trophies[kind] ?? 0}</dd>
            </div>
          </dl>

          {run && (
            <div className={styles.progress} aria-label="ความคืบหน้า">
              {run.rounds.map((_, round) => {
                const done = round < won;
                const current = run.status === 'running' && round === run.round;
                const lost = run.status === 'out' && round === outIn;
                return (
                  <span
                    key={round}
                    className={[
                      styles.step,
                      done ? styles.stepDone : '',
                      current ? styles.stepNow : '',
                      lost ? styles.stepLost : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {roundName(run.size, round)}
                  </span>
                );
              })}
            </div>
          )}

          <div className={styles.prizes}>
            <h3>รางวัลตามรอบ</h3>
            <ul>
              {competition.rewards.map((band) => (
                <li key={band.wins} className={run?.claimed.includes(band.wins) ? styles.prizeDone : ''}>
                  <span className={styles.prizeWhen}>
                    {isTitleBand(band.wins, size) ? 'แชมป์' : `ชนะ ${band.wins} นัด`}
                  </span>
                  <span className={styles.prizeWhat}>
                    {band.rewards.map((line, index) => {
                      const detail = rewardView(line);
                      return (
                        <span className={styles.prizeItem} key={`${band.wins}-${index}`}>
                          <img className={styles.prizeArt} src={detail.icon} alt="" />
                          <span className={styles.prizeCount}>{detail.count}</span>
                        </span>
                      );
                    })}
                    {band.tokens > 0 && (
                      <span className={styles.prizeItem}>
                        <Medal size={22} className={styles.tokenIcon} />
                        <span className={styles.prizeCount}>{formatCurrency(band.tokens)}</span>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {ahead && (
            <p className={styles.ahead}>
              ชนะอีกนัดได้{' '}
              {[
                ...ahead.rewards.map((line) =>
                  line.kind === 'card' || line.kind === 'item'
                    ? 'ของรางวัล'
                    : `${currencies[line.kind].label} ${formatCurrency(line.amount)}`,
                ),
                ...(ahead.tokens > 0 ? [`Cup Token ${formatCurrency(ahead.tokens)}`] : []),
              ].join(' · ')}
            </p>
          )}
        </aside>

        <div className={styles.board}>
          {run ? (
            <CupBracket run={run} />
          ) : (
            <div className={styles.empty}>
              <Trophy size={64} strokeWidth={1.4} />
              <p>{open[kind] ? 'ยังไม่ได้สมัครถ้วยนี้' : 'ถ้วยนี้ยังไม่เปิด'}</p>
              <span>{closesIn}</span>
            </div>
          )}

          {run && panelOpen && (
            <CupChampionPanel
              run={run}
              competition={competition}
              canStartNew={canEnter}
              newCupHint={blockedBy && blockedBy !== 'unclaimed' ? ENTER_ERROR[blockedBy] : ''}
              onClaim={onClaim}
              onNewCup={onEnter}
              onClose={() => setHiddenPanel(run.id)}
            />
          )}
        </div>
      </section>

      <footer className={styles.actions}>
        {run && run.status === 'running' && tie && opponent ? (
          <>
            <div className={styles.match}>
              <span className={styles.matchRound}>{roundName(run.size, run.round)}</span>
              <span className={`${styles.matchSide} ${styles.matchYou}`}>
                <img src={avatarSource(account.avatarId)} alt="" width={40} height={40} />
                <b>YOUR TEAM</b>
                <em>OVR {rating}</em>
              </span>
              <span className={styles.matchVs}>VS</span>
              <span className={styles.matchSide}>
                <em>OVR {opponent.rating}</em>
                <b>{opponent.name}</b>
                <img src={avatarSource(opponent.avatarId)} alt="" width={40} height={40} />
              </span>
            </div>
            <button type="button" className={styles.ghost} onClick={onSimulate} disabled={busy}>
              <FastForward size={20} />
              จำลองผล
            </button>
            <button type="button" className={styles.primary} onClick={onPlay} disabled={busy}>
              <Play size={20} />
              PLAY MATCH
            </button>
          </>
        ) : run && run.status === 'champion' ? (
          <>
            <span className={`${styles.nextUp} ${styles.nextUpGold}`}>
              <Trophy size={24} /> CHAMPION · กดรับรางวัลแชมป์
            </span>
            <button type="button" className={styles.claim} onClick={onClaim}>
              <Gift size={20} />
              CLAIM REWARD
            </button>
          </>
        ) : (
          <>
            <span className={styles.nextUp}>
              {run?.status === 'out' ? (
                <span className={styles.out}>
                  <X size={22} /> ELIMINATED · ตกรอบใน{roundName(run.size, outIn)} · ชนะ {won} นัด
                  {winner && !winner.you ? ` · แชมป์คือ ${winner.name}` : ''}
                </span>
              ) : run?.status === 'completed' ? (
                <span className={styles.nextUpGold}>
                  <Trophy size={22} /> แชมป์ · รับรางวัลแล้ว
                </span>
              ) : (
                `ค่าสมัคร ${competition.entryCost} ${currency.label}`
              )}
            </span>
            {blockedBy && blockedBy !== 'in-progress' && (
              <span className={styles.blocked}>{ENTER_ERROR[blockedBy]}</span>
            )}
            <button type="button" className={styles.primary} onClick={onEnter} disabled={!canEnter}>
              <Ticket size={20} />
              {run ? 'NEW CUP' : 'สมัครแข่ง'}
            </button>
          </>
        )}
      </footer>

      {toast && <div className={styles.toast}>{toast}</div>}

      {view && (
        <CupResultOverlay view={view} competition={competition} onClose={() => setView(null)} />
      )}

      {shopOpen && <CupShop onClose={() => setShopOpen(false)} />}

      {live && (
        <ManagerLiveMatch
          key={live.match.id}
          live={live.match}
          onFinished={onLiveFinished}
          onForfeit={onLiveForfeit}
          modeLabel={`${config[live.kind].name || CUP_LABEL[live.kind]} · ${
            run ? roundName(run.size, run.round) : ''
          }`}
          leaveWarning="ออกตอนนี้นับว่าแพ้ 0-3 และตกรอบถ้วยทันที"
        />
      )}
    </div>
  );
}
