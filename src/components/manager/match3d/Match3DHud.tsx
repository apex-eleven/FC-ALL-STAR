import { useState } from 'react';
import { ArrowLeftRight, ChevronDown, LogOut, Pause, Play, SlidersHorizontal } from 'lucide-react';
import { SPEEDS } from '@/features/manager/constants';
import { MAX_SUBS, type MatchEngine, type Tactic } from '@/features/manager/matchEngine';
import styles from './Match3DHud.module.css';

/**
 * The overlay for the full-screen 3D match: score and clock top left, and top right
 * the CUSTOM menu that now holds the tactics, the speed controls and the pause, with
 * substitutions and leaving beside it.
 */

/** The speeds the live screen offers — 1, 2 or 4. */
type Speed = (typeof SPEEDS)[number];

export interface Match3DHudProps {
  engine: MatchEngine;
  homeAvatar: string;
  awayAvatar: string;
  speed: Speed;
  paused: boolean;
  onSpeed(value: Speed): void;
  onPause(): void;
  onTactic(tactic: Tactic): void;
  onSubs(): void;
  onLeave(): void;
}

const TACTICS: { id: Tactic; label: string }[] = [
  { id: 'attack', label: 'บุก' },
  { id: 'balanced', label: 'สมดุล' },
  { id: 'defend', label: 'ตั้งรับ' },
];

/** The broadcast clock, counting the 90 minutes the engine compresses. */
function clockOf(engine: MatchEngine): string {
  const total = Math.min(90 * 60, Math.floor((engine.t / engine.duration) * 90 * 60));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function shortTeam(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

export default function Match3DHud({
  engine,
  homeAvatar,
  awayAvatar,
  speed,
  paused,
  onSpeed,
  onPause,
  onTactic,
  onSubs,
  onLeave,
}: Match3DHudProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const benchEmpty = engine.bench.length === 0;
  const subsSpent = engine.subsUsed >= MAX_SUBS;

  return (
    <div className={styles.hud}>
      {/* ---- score and clock ---- */}
      <div className={styles.score}>
        <img className={styles.crest} src={homeAvatar} alt="" draggable={false} />
        <span className={styles.team}>{shortTeam(engine.homeName)}</span>
        <span className={styles.goals}>
          <b>{engine.score.home}</b>
          <i>|</i>
          <b>{engine.score.away}</b>
        </span>
        <span className={styles.team}>{shortTeam(engine.awayName)}</span>
        <img className={styles.crest} src={awayAvatar} alt="" draggable={false} />
      </div>
      <div className={styles.clock}>
        {engine.phase === 'halftime'
          ? 'พักครึ่ง'
          : engine.phase === 'fulltime'
            ? 'จบเกม'
            : clockOf(engine)}
      </div>

      {/* ---- CUSTOM, subs, leave ---- */}
      <div className={styles.controls}>
        <div className={styles.custom}>
          <button
            type="button"
            className={`${styles.customButton} ${menuOpen ? styles.customOpen : ''}`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            <SlidersHorizontal size={30} strokeWidth={2.4} />
            <span>CUSTOM</span>
            <ChevronDown className={menuOpen ? styles.caretUp : ''} size={28} strokeWidth={3} />
          </button>

          {menuOpen && (
            <div className={styles.menu}>
              <span className={styles.menuTitle}>แทคติก</span>
              <div className={styles.tactics}>
                {TACTICS.map((tactic) => (
                  <button
                    key={tactic.id}
                    type="button"
                    className={`${styles.tactic} ${
                      engine.tactics.home === tactic.id ? styles.tacticOn : ''
                    }`}
                    disabled={engine.finished}
                    onClick={() => onTactic(tactic.id)}
                  >
                    {tactic.label}
                  </button>
                ))}
              </div>

              <span className={styles.menuTitle}>ความเร็ว</span>
              <div className={styles.speeds}>
                {SPEEDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.chip} ${speed === value ? styles.chipOn : ''}`}
                    onClick={() => onSpeed(value)}
                  >
                    x{value}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.chip} ${paused ? styles.chipOn : ''}`}
                  onClick={onPause}
                  aria-label={paused ? 'เล่นต่อ' : 'หยุดชั่วคราว'}
                >
                  {paused ? <Play size={22} strokeWidth={2.6} /> : <Pause size={22} strokeWidth={2.6} />}
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.icon}
          disabled={engine.finished || subsSpent || benchEmpty}
          title={`เปลี่ยนตัว (${engine.subsUsed}/${MAX_SUBS})`}
          aria-label={`เปลี่ยนตัว ${engine.subsUsed} จาก ${MAX_SUBS}`}
          onClick={onSubs}
        >
          <ArrowLeftRight size={32} strokeWidth={2.6} />
        </button>

        <button
          type="button"
          className={`${styles.icon} ${styles.leave}`}
          disabled={engine.finished}
          aria-label="ออกจากแมตช์"
          onClick={onLeave}
        >
          <LogOut size={30} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
