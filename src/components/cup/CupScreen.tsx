import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Clock, History, Home, Ticket, Trophy } from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/features/currencies/constants';
import { currencies } from '@/data/mock/currencies';
import { useCup } from '@/features/cup/CupContext';
import { CUP_LABEL, roundCount, roundName } from '@/features/cup/constants';
import { countdown, nextOpen, nextReward, roundsWon, tieForYou, windowEnd } from '@/features/cup/cup';
import useRewardView from '@/components/shop/useRewardView';
import type { CupEnterError, CupKind, CupRun } from '@/features/cup/types';
import { useNavigation } from '@/features/navigation/NavigationContext';
import CupBracket from './CupBracket';
import CupResultOverlay, { type CupResultView } from './CupResultOverlay';
import styles from './CupScreen.module.css';

/**
 * ฟุตบอลถ้วย — the screen behind the bottom bar's cup button, where the daily
 * league used to be.
 *
 * Two competitions, one at a time: a tab for each, the bracket in the middle, and
 * one button that does the next thing. There is no table to read and nothing
 * resolves while the player is away — a round happens because they pressed play.
 */

const ENTER_ERROR: Record<CupEnterError, string> = {
  closed: 'ถ้วยปิดอยู่',
  'no-squad': 'ต้องจัดทีมตัวจริงก่อนถึงจะลงแข่งได้',
  'not-open': 'ถ้วยนี้ยังไม่เปิด',
  'no-entries': 'สิทธิ์สมัครรอบนี้หมดแล้ว',
  'in-progress': 'ยังแข่งถ้วยนี้ไม่จบ',
  'cannot-afford': 'ค่าสมัครไม่พอ',
};

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
    kickoffOf,
    lastRound,
    clearLastRound,
  } = useCup();

  const rewardView = useRewardView();
  const [kind, setKind] = useState<CupKind>('daily');
  const [toast, setToast] = useState('');
  const [view, setView] = useState<CupResultView | null>(null);
  // Ticks the countdown. Everything else on this screen changes only on a press.
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

  const competition = config[kind];
  const run: CupRun | null = state?.runs[kind] ?? null;
  const currency = currencies[competition.entryCurrency];
  const balance = account.wallet[competition.entryCurrency];

  const won = run ? roundsWon(run) : 0;
  const ahead = run && run.status === 'running' ? nextReward(run, competition) : null;
  const tie = run && run.status === 'running' ? tieForYou(run) : null;

  const closesIn = useMemo(() => {
    if (!open[kind]) {
      const opens = nextOpen(now, config, competition);
      return opens ? `เปิดอีก ${countdown(opens, now)}` : '';
    }
    return `ปิดอีก ${countdown(windowEnd(now, config, competition), now)}`;
  }, [open, kind, now, config, competition]);

  const onEnter = useCallback(() => {
    const result = enter(kind);
    if (!result.ok) {
      setToast(ENTER_ERROR[result.error]);
      return;
    }
    setToast('จับสลากประกบคู่เรียบร้อย');
  }, [enter, kind]);

  /**
   * A round played itself — show what it produced, once, then let it go.
   *
   * This is the only place a result opens by itself. Everything else on the screen
   * still waits to be pressed.
   */
  useEffect(() => {
    if (!lastRound || lastRound.kind !== kind) return;
    const { outcome } = lastRound;
    clearLastRound();
    if (!outcome.tie) return;
    setView({
      tie: outcome.tie,
      run: outcome.run,
      through: outcome.through,
      paid: outcome.paid,
      result: outcome.result,
    });
  }, [lastRound, kind, clearLastRound]);

  const kickoff = kickoffOf(kind);

  /**
   * The player's most recent finished tie, or null before the first one.
   *
   * Searched from the back: the run holds every round, and the one worth looking at
   * again is the one that just played itself.
   */
  const lastPlayed = useMemo(() => {
    if (!run) return null;
    const seat = run.teams.findIndex((team) => team.you);
    if (seat < 0) return null;
    for (let index = run.rounds.length - 1; index >= 0; index -= 1) {
      const found = run.rounds[index]?.find(
        (entry) => entry.played && (entry.a === seat || entry.b === seat),
      );
      if (found) return found;
    }
    return null;
  }, [run]);

  const onReplay = useCallback(() => {
    if (!run || !lastPlayed) return;
    const seat = run.teams.findIndex((team) => team.you);
    setView({
      tie: lastPlayed,
      run,
      through: lastPlayed.winner === seat,
      paid: [],
      result: null,
    });
  }, [run, lastPlayed]);

  const background = competition.background || `/brand/cup_background.jpg`;
  const entriesLeftNow = left[kind];
  const canEnter = open[kind] && entriesLeftNow > 0 && (!run || run.status !== 'running');

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
            >
              <Trophy size={18} />
              <span>{config[id].name || CUP_LABEL[id]}</span>
              {!open[id] && <em className={styles.tabShut}>ปิด</em>}
            </button>
          ))}
        </div>

        <div className={styles.headerRight}>
          <span className={styles.clock}>{closesIn}</span>
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
            แพ้ตกรอบ · {competition.size} ทีม · ชนะ {roundCount(competition.size)} นัดได้แชมป์
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

          <div className={styles.prizes}>
            <h3>รางวัลตามรอบ</h3>
            <ul>
              {competition.rewards.map((band) => (
                <li key={band.wins} className={won >= band.wins ? styles.prizeDone : ''}>
                  <span className={styles.prizeWhen}>
                    {band.wins >= competition.rewards.length && run
                      ? 'แชมป์'
                      : `ชนะ ${band.wins} นัด`}
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
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {ahead && (
            <p className={styles.ahead}>
              ชนะอีกนัดได้{' '}
              {ahead.rewards
                .map((line) =>
                  line.kind === 'card' || line.kind === 'item'
                    ? 'ของรางวัล'
                    : `${currencies[line.kind].label} ${formatCurrency(line.amount)}`,
                )
                .join(' · ')}
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
        </div>
      </section>

      <footer className={styles.actions}>
        {run && run.status === 'running' && tie ? (
          <>
            <span className={styles.nextUp}>
              {roundName(run.size, run.round)} · พบกับ{' '}
              {run.teams[tie.a === run.teams.findIndex((team) => team.you) ? tie.b : tie.a]?.name ?? '—'}
            </span>
            {/*
              Rounds play themselves at their kickoff time, so there is nothing to
              press here — only how long until the next one. The tie that just
              finished is watched back from the button beside it.
            */}
            <span className={styles.kickoff}>
              <Clock size={20} />
              {kickoff ? `เตะอีก ${countdown(kickoff, now)}` : 'กำลังลงสนาม…'}
            </span>
            <button
              type="button"
              className={styles.primary}
              onClick={onReplay}
              disabled={!lastPlayed}
            >
              <History size={20} />
              ดูย้อนหลัง
            </button>
          </>
        ) : (
          <>
            <span className={styles.nextUp}>
              {run
                ? run.status === 'champion'
                  ? 'คุณคือแชมป์รายการนี้'
                  : `ตกรอบ · ชนะ ${won} นัด`
                : `ค่าสมัคร ${competition.entryCost} ${currency.label}`}
            </span>
            <button
              type="button"
              className={styles.primary}
              onClick={onEnter}
              disabled={!canEnter}
            >
              <Ticket size={20} />
              สมัครแข่ง
            </button>
          </>
        )}
      </footer>

      {toast && <div className={styles.toast}>{toast}</div>}

      {view && (
        <CupResultOverlay
          view={view}
          competition={competition}
          onClose={() => setView(null)}
        />
      )}
    </div>
  );
}
