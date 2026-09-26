import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, LogOut, Pause, Play } from 'lucide-react';
import { useAccount } from '@/features/auth/AuthContext';
import { ENGINE_DT, SPEEDS } from '@/features/manager/constants';
import type { LiveMatch } from '@/features/manager/ManagerContext';
import {
  MAX_SUBS,
  MatchEngine,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type EnginePlayer,
  type Tactic,
} from '@/features/manager/matchEngine';
import { avatarSrc } from './avatarSrc';
import MatchSubsDialog from './MatchSubsDialog';
import Match3DStage from './match3d/Match3DStage';
import Match3DHud from './match3d/Match3DHud';
import styles from './ManagerLiveMatch.module.css';

export interface ManagerLiveMatchProps {
  live: LiveMatch;
  onFinished(score: [number, number], scorers: MatchEngine['scorers']): void;
  onForfeit(): void;
  /**
   * The line under the VS card, and what the leave dialog warns. Manager mode leaves
   * both out and gets its ranked/unranked wording; the cup passes its own, because
   * the same live screen is what plays a cup tie.
   */
  modeLabel?: string;
  leaveWarning?: string;
}

/** Pitch box on the stage, 105:68. */
const PITCH_W = 1240;
const PITCH_H = Math.round((PITCH_W * PITCH_WIDTH) / PITCH_LENGTH);
const TOKEN = 50;
/** The VS card before kick-off. */
const INTRO_MS = 2200;
/** How often the scoreboard, stats, and feed re-render while play runs. */
const UI_MS = 200;
/** Half time moves on by itself after this, in case nobody presses the button. */
const HALFTIME_AUTO_MS = 15_000;

/**
 * Development switch for the 3D coordinate proof. `true` lays the 3D view over the
 * 2D pitch; the panel, the clock, and every control keep working either way. Set it
 * to `false` — or delete this line and the block that reads it — to go back to 2D.
 */
const ENABLE_MANAGER_3D = true;

const TACTICS: { id: Tactic; label: string }[] = [
  { id: 'attack', label: 'บุก' },
  { id: 'balanced', label: 'สมดุล' },
  { id: 'defend', label: 'ตั้งรับ' },
];

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.length > 11 ? `${last.slice(0, 10)}…` : last;
}

function place(player: EnginePlayer): string {
  const x = (player.x / PITCH_LENGTH) * PITCH_W - TOKEN / 2;
  const y = (player.y / PITCH_WIDTH) * PITCH_H - TOKEN / 2;
  return `translate3d(${x}px, ${y}px, 0)`;
}

/**
 * The match, live: both elevens on a top-down pitch, the ball moving between them,
 * the clock, score, stats and commentary, and the manager's controls — tactic,
 * substitutions, speed, pause, and leaving (a forfeit when ranked).
 *
 * The engine runs on a fixed step inside an animation frame loop and the tokens are
 * moved by writing transforms directly; React only re-renders the panels a few times
 * a second.
 */
export default function ManagerLiveMatch({
  live,
  onFinished,
  onForfeit,
  modeLabel,
  leaveWarning,
}: ManagerLiveMatchProps) {
  const account = useAccount();
  const [engine] = useState(() => new MatchEngine(live.setup));
  const [, setTick] = useState(0);
  const [intro, setIntro] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const tokens = useRef(new Map<string, HTMLDivElement>());
  const ballRef = useRef<HTMLDivElement | null>(null);
  const done = useRef(false);

  const rerender = useCallback(() => setTick((value) => value + 1), []);

  // Anything that stops the clock: the intro, a pause, a dialog, half time.
  const halted = intro || paused || subsOpen || leaving;
  const haltedRef = useRef(halted);
  haltedRef.current = halted;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const draw = useCallback(() => {
    for (const player of engine.players) {
      const node = tokens.current.get(player.id);
      if (node) {
        node.style.transform = place(player);
        node.dataset.ball = engine.ballOwnerId === player.id ? 'on' : '';
      }
    }
    const ball = ballRef.current;
    if (ball) {
      const x = (engine.ball.x / PITCH_LENGTH) * PITCH_W;
      const y = (engine.ball.y / PITCH_WIDTH) * PITCH_H;
      ball.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  }, [engine]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    let lastUi = 0;
    let seenEvents = engine.events.length;
    let seenPhase = engine.phase;

    const loop = (now: number) => {
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (!haltedRef.current && engine.phase === 'play') {
        carry += elapsed * speedRef.current;
        let steps = 0;
        while (carry >= ENGINE_DT && steps < 60 && engine.phase === 'play') {
          engine.step(ENGINE_DT);
          carry -= ENGINE_DT;
          steps += 1;
        }
      }
      draw();

      if (
        now - lastUi > UI_MS ||
        engine.events.length !== seenEvents ||
        engine.phase !== seenPhase
      ) {
        lastUi = now;
        seenEvents = engine.events.length;
        seenPhase = engine.phase;
        rerender();
      }

      if (engine.finished) {
        if (!done.current) {
          done.current = true;
          window.setTimeout(
            () => onFinished([engine.score.home, engine.score.away], engine.scorers),
            1600,
          );
        }
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine, draw, rerender, onFinished]);

  // Half time: carries on by itself if the manager does nothing.
  const atHalftime = engine.phase === 'halftime';
  useEffect(() => {
    if (!atHalftime || subsOpen) return;
    const timer = window.setTimeout(() => {
      engine.resume();
      rerender();
    }, HALFTIME_AUTO_MS);
    return () => window.clearTimeout(timer);
  }, [atHalftime, subsOpen, engine, rerender]);

  const home = engine.onPitch('home');
  const away = engine.onPitch('away');
  // Newest first. The engine appends in place, so this is read fresh each render.
  const feed = engine.events.slice(-9).reverse();

  const share = Math.round(engine.possessionShare * 100);
  const statRows: { label: string; home: number | string; away: number | string }[] = [
    { label: 'ครองบอล', home: `${share}%`, away: `${100 - share}%` },
    { label: 'ยิง', home: engine.stats.home.shots, away: engine.stats.away.shots },
    { label: 'ยิงเข้ากรอบ', home: engine.stats.home.onTarget, away: engine.stats.away.onTarget },
    { label: 'ส่งบอล', home: engine.stats.home.passes, away: engine.stats.away.passes },
    { label: 'แย่งบอล', home: engine.stats.home.tackles, away: engine.stats.away.tackles },
  ];

  const tokenRef = (id: string) => (node: HTMLDivElement | null) => {
    if (node) tokens.current.set(id, node);
    else tokens.current.delete(id);
  };

  return (
    <div
      className={`${styles.screen} ${ENABLE_MANAGER_3D ? styles.screen3d : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="แมตช์สด"
    >
      <div className={styles.backdrop} />

      {/* ---- scoreboard ---- */}
      <div className={styles.scoreboard}>
        <span className={`${styles.team} ${styles.teamHome}`}>
          <span className={styles.teamName}>{engine.homeName}</span>
          <img src={avatarSrc(account.avatarId)} alt="" />
        </span>
        <span className={styles.scoreBox}>
          <b>
            {engine.score.home} - {engine.score.away}
          </b>
          <small>
            {engine.phase === 'halftime'
              ? 'พักครึ่ง'
              : engine.phase === 'fulltime'
                ? 'จบเกม'
                : `${engine.minute}'`}
          </small>
        </span>
        <span className={`${styles.team} ${styles.teamAway}`}>
          <img src={avatarSrc(live.opponent.avatarId)} alt="" />
          <span className={styles.teamName}>{engine.awayName}</span>
        </span>
      </div>

      {/* ---- pitch ---- */}
      <div className={styles.pitch} style={{ width: PITCH_W, height: PITCH_H }}>
        <svg className={styles.lines} viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true">
          <rect x="0.4" y="0.4" width="104.2" height="67.2" />
          <line x1="52.5" y1="0" x2="52.5" y2="68" />
          <circle cx="52.5" cy="34" r="9.15" />
          <circle cx="52.5" cy="34" r="0.4" className={styles.spot} />
          <rect x="0.4" y="13.84" width="16.5" height="40.32" />
          <rect x="0.4" y="24.84" width="5.5" height="18.32" />
          <rect x="88.1" y="13.84" width="16.5" height="40.32" />
          <rect x="99.1" y="24.84" width="5.5" height="18.32" />
        </svg>
        <span className={`${styles.goal} ${styles.goalLeft}`} />
        <span className={`${styles.goal} ${styles.goalRight}`} />

        {[...home, ...away].map((player) => (
          <div
            key={player.id}
            ref={tokenRef(player.id)}
            className={`${styles.token} ${player.side === 'home' ? styles.home : styles.away}`}
            style={{ width: TOKEN, height: TOKEN, transform: place(player) }}
          >
            <span className={styles.face}>
              {player.portrait ? (
                <img src={player.portrait} alt="" draggable={false} />
              ) : (
                <b>{player.name.slice(0, 1)}</b>
              )}
            </span>
            <span className={styles.label}>{shortName(player.name)}</span>
          </div>
        ))}
        <div ref={ballRef} className={styles.ball} />

        {/* Development only: the same engine, drawn again in 3D. Sits above the 2D
            tokens but below the goal flash, the intro, and the half-time card. */}
        {ENABLE_MANAGER_3D && <Match3DStage engine={engine} />}

        {engine.goalFlash && (
          <div className={`${styles.goalFlash} ${engine.goalFlash === 'home' ? styles.flashHome : styles.flashAway}`}>
            GOAL!
          </div>
        )}

        {intro && (
          <div className={styles.intro}>
            <div className={styles.introSide}>
              <img src={avatarSrc(account.avatarId)} alt="" />
              <b>{engine.homeName}</b>
              <small>OVR {live.rating}</small>
            </div>
            <span className={styles.vs}>VS</span>
            <div className={styles.introSide}>
              <img src={avatarSrc(live.opponent.avatarId)} alt="" />
              <b>{engine.awayName}</b>
              <small>
                OVR {live.opponent.rating}
                {live.opponent.bot ? ' · บอท' : ''}
              </small>
            </div>
            <span className={styles.introMode}>
              {modeLabel ?? (live.ranked ? 'แมตช์จัดอันดับ' : 'แมตช์ไม่จัดอันดับ')}
            </span>
          </div>
        )}

        {atHalftime && !subsOpen && (
          <div className={styles.halftime}>
            <b>พักครึ่ง</b>
            <span>
              {engine.score.home} - {engine.score.away}
            </span>
            <small>ปรับแทคติกหรือเปลี่ยนตัวได้ตอนนี้</small>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                engine.resume();
                rerender();
              }}
            >
              เริ่มครึ่งหลัง
            </button>
          </div>
        )}
      </div>

      {/* ---- side panel ---- */}
      <aside className={styles.panel}>
        <div className={styles.controls}>
          <div className={styles.speeds}>
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className={`${styles.chip} ${speed === value ? styles.chipOn : ''}`}
                onClick={() => setSpeed(value)}
              >
                x{value}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.chip} ${paused ? styles.chipOn : ''}`}
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? 'เล่นต่อ' : 'หยุดชั่วคราว'}
            >
              {paused ? <Play size={20} strokeWidth={2.6} /> : <Pause size={20} strokeWidth={2.6} />}
            </button>
          </div>
          <button
            type="button"
            className={styles.leave}
            disabled={engine.finished}
            onClick={() => setLeaving(true)}
          >
            <LogOut size={20} strokeWidth={2.6} />
            ออก
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.statHead}>
            <span>{engine.homeName}</span>
            <span>{engine.awayName}</span>
          </div>
          <div className={styles.possession}>
            <span style={{ width: `${share}%` }} />
          </div>
          {statRows.map((row) => (
            <div key={row.label} className={styles.stat}>
              <b>{row.home}</b>
              <span>{row.label}</span>
              <b>{row.away}</b>
            </div>
          ))}
        </div>

        <div className={styles.card}>
          <span className={styles.cardTitle}>แทคติก</span>
          <div className={styles.tactics}>
            {TACTICS.map((tactic) => (
              <button
                key={tactic.id}
                type="button"
                className={`${styles.tactic} ${engine.tactics.home === tactic.id ? styles.tacticOn : ''}`}
                disabled={engine.finished}
                onClick={() => {
                  engine.setTactic('home', tactic.id);
                  rerender();
                }}
              >
                {tactic.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.subs}
            disabled={engine.finished || engine.subsUsed >= MAX_SUBS || engine.bench.length === 0}
            onClick={() => setSubsOpen(true)}
          >
            <ArrowLeftRight size={22} strokeWidth={2.6} />
            เปลี่ยนตัว ({engine.subsUsed}/{MAX_SUBS})
          </button>
          {engine.bench.length === 0 && engine.subsUsed === 0 && (
            <small className={styles.hint}>ไม่มีตัวสำรอง — จัดตัวสำรองได้ในหน้าทีม</small>
          )}
        </div>

        <div className={`${styles.card} ${styles.feedCard}`}>
          <span className={styles.cardTitle}>ถ่ายทอดสด</span>
          <ul className={styles.feed}>
            {feed.map((event) => (
              <li key={event.id} className={styles[`ev_${event.kind}`] ?? ''}>
                <b>{event.minute}'</b>
                <span>{event.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {ENABLE_MANAGER_3D && (
        <Match3DHud
          engine={engine}
          homeAvatar={avatarSrc(account.avatarId)}
          awayAvatar={avatarSrc(live.opponent.avatarId)}
          speed={speed}
          paused={paused}
          onSpeed={setSpeed}
          onPause={() => setPaused((value) => !value)}
          onTactic={(tactic) => {
            engine.setTactic('home', tactic);
            rerender();
          }}
          onSubs={() => setSubsOpen(true)}
          onLeave={() => setLeaving(true)}
        />
      )}

      {subsOpen && (
        <MatchSubsDialog
          onPitch={home}
          bench={engine.bench}
          subsLeft={MAX_SUBS - engine.subsUsed}
          energyOf={(player) => engine.energyOf(player)}
          onSwap={(outId, inId) => {
            engine.substitute(outId, inId);
            rerender();
          }}
          onClose={() => setSubsOpen(false)}
        />
      )}

      {leaving && (
        <div className={styles.confirm} role="alertdialog" aria-label="ออกจากแมตช์">
          <div className={styles.confirmPanel}>
            <b>ออกจากแมตช์?</b>
            <p>
              {leaveWarning ??
                (live.ranked
                  ? 'แมตช์จัดอันดับจะถูกนับว่าแพ้ 0-3 และเสียดาว'
                  : 'แมตช์นี้ไม่นับแรงค์ ออกได้เลยโดยไม่เสียอะไร')}
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.secondary} onClick={() => setLeaving(false)}>
                เล่นต่อ
              </button>
              <button type="button" className={styles.danger} onClick={onForfeit}>
                ออกจากแมตช์
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
