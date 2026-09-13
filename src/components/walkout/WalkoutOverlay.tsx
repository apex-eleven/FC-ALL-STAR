import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import flightClip from '@/assets/video/walkout-flight.mp4';
import stageClip from '@/assets/video/walkout-stage.mp4';
import type { PullOutcome } from '@/features/draft/pull';
import { useSound } from '@/features/sound/SoundContext';
import { useWalkout } from '@/features/walkout/WalkoutContext';
import type { WalkoutPhase } from '@/features/walkout/types';
import styles from './WalkoutOverlay.module.css';

export interface WalkoutOverlayProps {
  outcome: PullOutcome;
  onFinish(): void;
}

interface Beat {
  key: 'nation' | 'position' | 'club';
  label: string;
  value: string;
  thai?: boolean;
}

/**
 * The reveal.
 *
 * Two clips, mounted together for the whole sequence. The flight plays once while
 * nation, position, and club appear in turn; the stage clip starts `crossfade`
 * seconds before the flight ends and the flight fades out over its own closing white
 * flash, so the join lands inside a frame that is already pure white.
 *
 * Both clips carry an audio track and both play it. Browsers refuse unmuted playback
 * that was not started by a gesture, and this one starts from a `canplaythrough`
 * handler rather than from the pull button, so a refusal is expected rather than
 * exceptional: the clip is replayed muted and a button offers the sound back. The
 * animation never depends on the audio being allowed.
 *
 * The stage loops until the player leaves. Results are already committed to the
 * account before this mounts, so skipping or closing early cannot lose a card.
 */
export default function WalkoutOverlay({ outcome, onFinish }: WalkoutOverlayProps) {
  const { config } = useWalkout();
  const { config: sound } = useSound();
  const flightRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLVideoElement>(null);

  const [phase, setPhase] = useState<WalkoutPhase>('loading');
  const [shown, setShown] = useState<Set<Beat['key']>>(new Set());
  const [veil, setVeil] = useState<'off' | 'on' | 'clearing'>('off');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const startedStage = useRef(false);
  const fadeFrame = useRef<number | null>(null);

  const { player } = outcome;

  // Read the audio settings through a ref inside the playback callbacks: those are
  // memoised on the phase, and a slider moved mid-clip must not re-create them and
  // restart a video that is already running. Seeded from the first render's values
  // and kept in step by the effect below.
  const wanted = useRef({ enabled: sound.videoEnabled, volume: sound.videoVolume });

  const beats: Beat[] = [
    { key: 'nation', label: 'ชาติ', value: player.nation },
    { key: 'position', label: 'ตำแหน่ง', value: player.position },
    { key: 'club', label: 'สโมสร', value: player.club, thai: true },
  ];

  /**
   * Starts a clip with sound if the browser allows it, muted if it does not.
   *
   * The retry matters: a rejected unmuted `play()` leaves the element paused, so
   * without a second muted attempt a blocked autoplay policy would freeze the whole
   * walkout on a black frame.
   */
  const playClip = useCallback(async (video: HTMLVideoElement | null): Promise<boolean> => {
    if (!video) return false;

    const { enabled, volume } = wanted.current;
    video.volume = volume;
    video.muted = !enabled;

    try {
      await video.play();
      if (enabled) setAudioBlocked(false);
      return true;
    } catch {
      if (!enabled) return false;

      video.muted = true;
      setAudioBlocked(true);
      try {
        await video.play();
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  /** Ramps a clip's volume down by hand — HTMLMediaElement has no gain envelope. */
  const fadeOut = useCallback((video: HTMLVideoElement | null, seconds: number) => {
    if (!video) return;
    if (seconds <= 0) {
      video.volume = 0;
      return;
    }

    const from = video.volume;
    const startedAt = performance.now();

    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / (seconds * 1000));
      video.volume = Math.max(0, from * (1 - progress));
      if (progress < 1) fadeFrame.current = requestAnimationFrame(step);
    };

    fadeFrame.current = requestAnimationFrame(step);
  }, []);

  const toStage = useCallback(() => {
    if (startedStage.current) return;
    startedStage.current = true;

    setPhase('stage');
    setVeil('on');
    void playClip(stageRef.current);

    // The flight's closing note is a flash, not a tail — cutting it dead under the
    // stage audio is harsher than riding it out across the same dissolve the picture
    // uses.
    fadeOut(flightRef.current, config.crossfade + config.flashOut);

    // Next frame, so the browser paints the opaque veil before the transition to
    // transparent starts. Setting both in one commit would skip the dissolve.
    requestAnimationFrame(() => requestAnimationFrame(() => setVeil('clearing')));
  }, [config.crossfade, config.flashOut, fadeOut, playClip]);

  // Start the flight as soon as it can run through without stalling. The stage clip
  // buffers during the flight's seven seconds, so it is ready well before the cut.
  const onFlightReady = useCallback(() => {
    if (phase !== 'loading') return;
    setPhase('flight');
    void playClip(flightRef.current).then((ok) => {
      if (!ok) setPhase('stage');
    });
  }, [phase, playClip]);

  const onFlightTime = useCallback(() => {
    const video = flightRef.current;
    if (!video) return;

    const time = video.currentTime;
    setShown((current) => {
      const next = new Set(current);
      for (const beat of beats) {
        const at =
          beat.key === 'nation'
            ? config.nationAt
            : beat.key === 'position'
              ? config.positionAt
              : config.clubAt;
        if (time >= at) next.add(beat.key);
      }
      return next.size === current.size ? current : next;
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 7.04;
    if (time >= duration - config.crossfade) toStage();
  }, [beats, config, toStage]);

  /** Recovery when the browser refused sound. A tap is a gesture, so this always works. */
  const enableAudio = useCallback(() => {
    setAudioBlocked(false);
    const volume = wanted.current.volume;

    const stage = stageRef.current;
    const flight = flightRef.current;

    if (flight) {
      flight.muted = false;
      // Once the stage is up the flight is mid-fade; restoring its level here would
      // undo the dissolve, so only a clip still at full volume is touched.
      if (!startedStage.current) flight.volume = volume;
    }

    if (stage) {
      stage.muted = false;
      stage.volume = volume;
      if (startedStage.current && stage.paused) void stage.play().catch(() => undefined);
    }
  }, []);

  // Live settings changes: a volume slider moved while the walkout is on screen
  // should be audible now, not on the next pull.
  useEffect(() => {
    wanted.current = { enabled: sound.videoEnabled, volume: sound.videoVolume };

    const stage = stageRef.current;
    if (stage) {
      stage.muted = !sound.videoEnabled;
      if (sound.videoEnabled) stage.volume = sound.videoVolume;
    }

    const flight = flightRef.current;
    if (flight && !startedStage.current) {
      flight.muted = !sound.videoEnabled;
      if (sound.videoEnabled) flight.volume = sound.videoVolume;
    }
  }, [sound.videoEnabled, sound.videoVolume]);

  // Safety net: if the flight never fires `ended` — a stalled buffer, a tab that was
  // backgrounded — the sequence still reaches the stage.
  useEffect(() => {
    if (phase !== 'flight') return;
    const timer = window.setTimeout(toStage, 9000);
    return () => window.clearTimeout(timer);
  }, [phase, toStage]);

  useEffect(() => {
    if (phase !== 'stage' || config.autoCloseSeconds <= 0) return;
    const timer = window.setTimeout(onFinish, config.autoCloseSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [phase, config.autoCloseSeconds, onFinish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFinish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFinish]);

  // Closing mid-clip must not leave a fade running against a detached element.
  useEffect(
    () => () => {
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
    },
    [],
  );

  const style = {
    '--walkout-crossfade': `${config.crossfade}s`,
    '--walkout-flash-out': `${config.flashOut}s`,
  } as CSSProperties;

  return (
    <div className={styles.screen} style={style} role="dialog" aria-modal="true" aria-label="ผลการเปิดการ์ด">
      <video
        ref={stageRef}
        className={`${styles.video} ${styles.stage}`}
        src={stageClip}
        preload="auto"
        loop
        playsInline
      />
      <video
        ref={flightRef}
        className={`${styles.video} ${styles.flight} ${phase === 'stage' ? styles.flightOut : ''}`}
        src={flightClip}
        preload="auto"
        playsInline
        onCanPlayThrough={onFlightReady}
        onTimeUpdate={onFlightTime}
        onEnded={toStage}
      />

      <div
        className={`${styles.veil} ${veil === 'on' ? styles.veilOn : ''} ${
          veil === 'clearing' ? styles.veilOut : ''
        }`}
      />

      {phase === 'loading' && <div className={styles.loading}>กำลังโหลด…</div>}

      {audioBlocked && phase !== 'loading' && (
        <button type="button" className={styles.unmute} onClick={enableAudio}>
          แตะเพื่อเปิดเสียง
        </button>
      )}

      {phase === 'flight' && (
        <div className={styles.reveals}>
          {beats.map((beat) => (
            <div
              key={beat.key}
              className={`${styles.reveal} ${shown.has(beat.key) ? styles.revealIn : ''}`}
            >
              <span className={styles.revealLabel}>{beat.label}</span>
              <span
                className={`${styles.revealValue} ${beat.thai ? styles.revealValueThai : ''}`}
              >
                {beat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {phase === 'stage' && (
        <>
          <img
            className={styles.card}
            src={player.portrait}
            alt={`${player.name} ${player.rating}`}
            draggable={false}
          />

          <button type="button" className={styles.exit} onClick={onFinish}>
            ออก
          </button>
        </>
      )}

      <button type="button" className={styles.skip} onClick={onFinish}>
        ข้าม
      </button>
    </div>
  );
}
