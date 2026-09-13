import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ASSETS } from '@/assets/assetMap';
import type { PullOutcome } from '@/features/draft/pull';
import {
  bestSet,
  PACK_ENTRY_MS,
  PACK_TIMING,
  type PackPhase,
} from '@/features/draft/packOpening';
import type { PlayerSet } from '@/features/draft/types';
import { useSound } from '@/features/sound/SoundContext';
import styles from './PackOpening.module.css';

export interface PackOpeningProps {
  outcomes: PullOutcome[];
  /** Hand over to the reveal — the walkout if one qualified, the grid otherwise. */
  onOpened(): void;
}

const SET_CLASS: Record<PlayerSet, string> = {
  A: styles.setA!,
  B: styles.setB!,
  C: styles.setC!,
  D: styles.setD!,
};

/** Fixed angles and distances, so the burst is the same every time rather than noise. */
const SHARDS = [
  { angle: -78, distance: 210, delay: 0 },
  { angle: -34, distance: 260, delay: 40 },
  { angle: -8, distance: 190, delay: 20 },
  { angle: 22, distance: 250, delay: 60 },
  { angle: 58, distance: 205, delay: 30 },
  { angle: 96, distance: 240, delay: 70 },
  { angle: 134, distance: 195, delay: 10 },
  { angle: 168, distance: 255, delay: 50 },
  { angle: -124, distance: 230, delay: 80 },
  { angle: -158, distance: 200, delay: 25 },
];

/**
 * The pack, between the purchase and the reveal.
 *
 * Nothing here decides anything. The pull already ran, the cards are already in the
 * club, and `outcomes` is only read to pick the colour of the glow. That ordering is
 * deliberate and matches the walkout: a player who closes the tab mid-animation
 * keeps everything they drew.
 *
 * The tap is required. An auto-opening pack is a loading screen with extra steps —
 * the whole point is that the player is the one who tears it.
 */
export default function PackOpening({ outcomes, onOpened }: PackOpeningProps) {
  const { play } = useSound();
  const [phase, setPhase] = useState<PackPhase>('waiting');
  const [entered, setEntered] = useState(false);
  const timers = useRef<number[]>([]);

  const tier = useMemo(() => bestSet(outcomes), [outcomes]);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), PACK_ENTRY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // One place to clear every pending step, so closing early never leaves a timer
  // firing setState against an unmounted overlay.
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  const open = useCallback(() => {
    if (phase !== 'waiting') return;

    setPhase('shake');
    play('shake');

    const toTear = window.setTimeout(() => {
      setPhase('tear');
      play('tear');
    }, PACK_TIMING.shake);

    const toBurst = window.setTimeout(() => {
      setPhase('burst');
    }, PACK_TIMING.shake + PACK_TIMING.tear);

    const finish = window.setTimeout(
      onOpened,
      PACK_TIMING.shake + PACK_TIMING.tear + PACK_TIMING.burst,
    );

    timers.current.push(toTear, toBurst, finish);
  }, [phase, onOpened, play]);

  // Enter and Space already reach the pack through the button; Escape skips the
  // whole thing, the same key that leaves the walkout.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpened();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpened]);

  const stage = [
    styles.stage,
    SET_CLASS[tier],
    entered ? styles.entered : '',
    styles[phase] ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // The keyframes have to end exactly when the timers advance the phase, so the
  // durations are handed to CSS rather than written down twice.
  const timing = {
    '--pack-shake-duration': `${PACK_TIMING.shake}ms`,
    '--pack-tear-duration': `${PACK_TIMING.tear}ms`,
    '--pack-burst-duration': `${PACK_TIMING.burst}ms`,
  } as CSSProperties;

  return (
    <div className={stage} style={timing} role="dialog" aria-modal="true" aria-label="เปิดซองการ์ด">
      <div className={styles.backdrop} />
      <div className={styles.rays} aria-hidden="true" />

      <button
        type="button"
        className={styles.pack}
        onClick={open}
        data-sound="off"
        aria-label={phase === 'waiting' ? 'แตะเพื่อเปิดซอง' : 'กำลังเปิดซอง'}
      >
        <span className={styles.halo} aria-hidden="true" />

        {/* Two copies of the same artwork, clipped top and bottom. The strip flies off
            and the body splits apart, so the tear happens along the crimp rather than
            across the middle of the art. */}
        <span className={styles.strip} aria-hidden="true">
          <img className={styles.art} src={ASSETS.draft.packFoil} alt="" />
        </span>
        <span className={styles.body} aria-hidden="true">
          <img className={styles.art} src={ASSETS.draft.packFoil} alt="" />
        </span>

        <span className={styles.seam} aria-hidden="true" />
        <span className={styles.column} aria-hidden="true" />
      </button>

      {phase === 'waiting' && entered && <p className={styles.hint}>แตะที่ซองเพื่อเปิด</p>}

      <div className={styles.shards} aria-hidden="true">
        {SHARDS.map((shard) => (
          <span
            key={`${shard.angle}-${shard.distance}`}
            className={styles.shard}
            style={{
              // Kept inline because each shard's vector is its own value, not a token:
              // twelve one-off rotations in the stylesheet would be worse than this.
              transform: `rotate(${shard.angle}deg)`,
              ['--shard-distance' as string]: `${shard.distance}px`,
              animationDelay: `${shard.delay}ms`,
            }}
          />
        ))}
      </div>

      <div className={styles.flash} aria-hidden="true" />

      <button type="button" className={styles.skip} data-sound="back" onClick={onOpened}>
        ข้าม
      </button>
    </div>
  );
}
