import { useState } from 'react';
import { ArrowRightLeft, LogOut, Menu, MoveHorizontal, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { SPEEDS } from '@/features/manager/constants';
import { MAX_SUBS, type MatchEngine, type Tactic } from '@/features/manager/matchEngine';
import { isMatchSoundMuted, setMatchSoundMuted } from './MatchAudio';
import styles from './Match3DHud.module.css';

/**
 * The overlay for the full-screen 3D match, laid out after the live-match reference
 * shot (measured on the 2048 x 942 stage, see Match3DHud.module.css):
 *
 *   top left   — the scoreboard: both managers' profile pictures, three-letter team
 *                codes and the score on one light plate, and the clock in its green chip;
 *   top right  — the formation bar (it opens the tactics), substitutions, and the menu
 *                that holds speed, pause, sound and leaving.
 *
 * The minimap and the ball-carrier bar are drawn by Match3DStage, which has the
 * positions every frame.
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

/** Splits text into what a reader sees as characters, so a Thai vowel stays on its letter. */
function characters(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: object) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
  return Array.from(text);
}

/**
 * A team's three-letter code, the way a broadcast shows it: the initials of a name of
 * three words or more, otherwise the first word's initial followed by the next word's
 * (or the first word's own) letters, upper-cased.
 */
function teamCode(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => characters(word.replace(/[^\p{L}\p{M}\p{N}]/gu, '')))
    .filter((word) => word.length > 0);
  if (words.length === 0) return '—';
  let code: string[];
  if (words.length >= 3) code = words.slice(0, 3).map((word) => word[0]!);
  else if (words.length === 2) code = [words[0]![0]!, ...words[1]!.slice(0, 2)];
  else code = words[0]!.slice(0, 3);
  return code.join('').toLocaleUpperCase();
}

const DEFENDERS = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW']);
const FORWARDS = new Set(['ST', 'CF', 'LW', 'RW', 'LF', 'RF']);

/** The home side's shape, from the positions of the ten outfield players on the pitch. */
function formationOf(engine: MatchEngine): string {
  let back = 0;
  let middle = 0;
  let front = 0;
  for (const player of engine.players) {
    if (player.side !== 'home' || player.keeper) continue;
    const position = player.position.toUpperCase();
    if (DEFENDERS.has(position)) back += 1;
    else if (FORWARDS.has(position)) front += 1;
    else middle += 1;
  }
  return back + middle + front === 10 ? `${back}-${middle}-${front}` : '4-3-3';
}

type Open = 'tactics' | 'menu' | null;

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
  const [open, setOpen] = useState<Open>(null);
  const [muted, setMuted] = useState(isMatchSoundMuted);

  const benchEmpty = engine.bench.length === 0;
  const subsSpent = engine.subsUsed >= MAX_SUBS;
  const tactic = TACTICS.find((entry) => entry.id === engine.tactics.home) ?? TACTICS[1]!;
  const toggle = (which: Open) => setOpen((current) => (current === which ? null : which));

  return (
    <div className={styles.hud}>
      {/* ---- scoreboard ---- */}
      <div className={styles.scoreboard}>
        <span className={`${styles.badge} ${styles.badgeHome}`}>
          <img src={homeAvatar} alt="" draggable={false} />
        </span>
        <span className={styles.plate}>
          <b className={styles.code}>{teamCode(engine.homeName)}</b>
          <span className={styles.score}>
            <b>{engine.score.home}</b>
            <i className={styles.mark} aria-hidden="true" />
            <b>{engine.score.away}</b>
          </span>
          <b className={styles.code}>{teamCode(engine.awayName)}</b>
        </span>
        <span className={`${styles.badge} ${styles.badgeAway}`}>
          <img src={awayAvatar} alt="" draggable={false} />
        </span>
        <span className={styles.edge} />
      </div>
      <div className={styles.clock}>
        {engine.phase === 'halftime' ? 'พักครึ่ง' : engine.phase === 'fulltime' ? 'จบเกม' : clockOf(engine)}
      </div>

      {/* ---- formation, substitutions, menu ---- */}
      <button
        type="button"
        className={styles.formation}
        onClick={() => toggle('tactics')}
        aria-expanded={open === 'tactics'}
        aria-label="แทคติก"
      >
        <MoveHorizontal className={styles.arrows} size={44} strokeWidth={3.4} />
        <span className={styles.formationText}>
          {formationOf(engine)} {tactic.label}
        </span>
        <span className={styles.divider} />
        <span className={`${styles.caret} ${open === 'tactics' ? styles.caretUp : ''}`} />
      </button>

      <button
        type="button"
        className={`${styles.square} ${styles.subs}`}
        disabled={engine.finished || subsSpent || benchEmpty}
        title={`เปลี่ยนตัว (${engine.subsUsed}/${MAX_SUBS})`}
        aria-label={`เปลี่ยนตัว ${engine.subsUsed} จาก ${MAX_SUBS}`}
        onClick={onSubs}
      >
        <ArrowRightLeft size={40} strokeWidth={3.2} />
      </button>

      <button
        type="button"
        className={`${styles.square} ${styles.menuButton}`}
        onClick={() => toggle('menu')}
        aria-expanded={open === 'menu'}
        aria-label="เมนู"
      >
        <Menu size={36} strokeWidth={3.2} />
      </button>

      {open === 'tactics' && (
        <div className={`${styles.panel} ${styles.tacticsPanel}`}>
          <span className={styles.panelTitle}>แทคติก</span>
          <div className={styles.row}>
            {TACTICS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`${styles.chip} ${engine.tactics.home === entry.id ? styles.chipOn : ''}`}
                disabled={engine.finished}
                onClick={() => {
                  onTactic(entry.id);
                  setOpen(null);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {open === 'menu' && (
        <div className={`${styles.panel} ${styles.menuPanel}`}>
          <span className={styles.panelTitle}>ความเร็ว</span>
          <div className={styles.row}>
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
          <div className={styles.row}>
            <button
              type="button"
              className={styles.wide}
              onClick={() => {
                setMatchSoundMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={24} strokeWidth={2.6} /> : <Volume2 size={24} strokeWidth={2.6} />}
              <span>{muted ? 'เปิดเสียง' : 'ปิดเสียง'}</span>
            </button>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.wide} ${styles.leave}`}
              disabled={engine.finished}
              onClick={() => {
                setOpen(null);
                onLeave();
              }}
            >
              <LogOut size={24} strokeWidth={2.6} />
              <span>ออกจากแมตช์</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
