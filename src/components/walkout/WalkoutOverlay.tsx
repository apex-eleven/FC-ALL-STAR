import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import walkoutClip from '@/assets/video/walkout.mp4';
import type { PullOutcome } from '@/features/draft/pull';
import { duckMusic, unduckMusic } from '@/features/sound/music';
import { useSound } from '@/features/sound/SoundContext';
import { useWalkout } from '@/features/walkout/WalkoutContext';
import { CLIP_DURATION, LOOP_LEAD } from '@/features/walkout/constants';
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
 * One clip. Everything before `loopStart` plays once as the intro, while nation,
 * position and club appear in turn; from `loopStart` to the end repeats until the
 * player leaves, and the card sits on top of it.
 *
 * The loop is driven by hand rather than with the `loop` attribute, because `loop`
 * can only go back to zero — which would replay the intro every time round. A frame
 * watcher jumps back to `loopStart` just before the end instead of waiting for
 * `ended`: `ended` pauses the element first, and that pause is a black frame on most
 * phones. See `LOOP_LEAD`.
 *
 * The clip carries an audio track. Browsers refuse unmuted playback that was not
 * started by a gesture, and this one starts from a `canplaythrough` handler rather
 * than from the pull button, so a refusal is expected rather than exceptional: the
 * clip is replayed muted and a button offers the sound back. The animation never
 * depends on the audio being allowed.
 *
 * Results are already committed to the account before this mounts, so skipping or
 * closing early cannot lose a card.
 */
export default function WalkoutOverlay({ outcome, onFinish }: WalkoutOverlayProps) {
  const { config } = useWalkout();
  const { config: sound } = useSound();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frame = useRef<number | null>(null);

  const [phase, setPhase] = useState<WalkoutPhase>('loading');
  const [shown, setShown] = useState<Set<Beat['key']>>(new Set());
  const [audioBlocked, setAudioBlocked] = useState(false);

  const { player } = outcome;

  // Read the audio settings through a ref inside the playback callbacks, so a slider
  // moved mid-clip does not re-create them and restart a video already running.
  const wanted = useRef({ enabled: sound.videoEnabled, volume: sound.videoVolume });

  // Memoised: the frame watcher depends on it, and a fresh array every render would
  // tear down and restart the watcher each time a fact appears.
  const beats = useMemo<Beat[]>(
    () => [
      { key: 'nation', label: 'ชาติ', value: player.nation },
      { key: 'position', label: 'ตำแหน่ง', value: player.position },
      { key: 'club', label: 'สโมสร', value: player.club, thai: true },
    ],
    [player.nation, player.position, player.club],
  );

  /**
   * The loop point, held inside the clip.
   *
   * The config only knows a number; the clip may be shorter than that number if it
   * was swapped for a shorter file. Half a second from the end is the floor, so there
   * is always something to loop rather than a jump back onto the last frame.
   */
  const loopFrom = useCallback((video: HTMLVideoElement): number => {
    const duration = Number.isFinite(video.duration) ? video.duration : CLIP_DURATION;
    return Math.max(0, Math.min(config.loopStart, duration - 0.5));
  }, [config.loopStart]);

  /**
   * Starts the clip with sound if the browser allows it, muted if it does not.
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

  /**
   * Once per frame: reveal facts during the intro, switch to the loop when playback
   * crosses the loop point, and jump back before the end once looping.
   */
  const watch = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const time = video.currentTime;
    const from = loopFrom(video);
    const duration = Number.isFinite(video.duration) ? video.duration : CLIP_DURATION;

    setShown((current) => {
      const next = new Set(current);
      for (const beat of beats) {
        const at =
          beat.key === 'nation' ? config.nationAt : beat.key === 'position' ? config.positionAt : config.clubAt;
        if (time >= at) next.add(beat.key);
      }
      return next.size === current.size ? current : next;
    });

    if (time >= from) setPhase((current) => (current === 'intro' ? 'loop' : current));

    if (time >= duration - LOOP_LEAD) video.currentTime = from;

    frame.current = requestAnimationFrame(watch);
  }, [beats, config, loopFrom]);

  const onReady = useCallback(() => {
    if (phase !== 'loading') return;
    setPhase('intro');
    void playClip(videoRef.current).then((ok) => {
      // Nothing would play at all — show the card rather than a frozen frame.
      if (!ok) setPhase('loop');
    });
  }, [phase, playClip]);

  // The frame watcher runs for as long as the clip is on screen.
  useEffect(() => {
    if (phase === 'loading') return;
    frame.current = requestAnimationFrame(watch);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [phase, watch]);

  /**
   * Fallback for the watcher: a backgrounded tab stops animation frames, and the clip
   * can reach its end while nobody was drawing. Going back and playing again keeps
   * the loop alive either way.
   */
  const onEnded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = loopFrom(video);
    setPhase('loop');
    void video.play().catch(() => undefined);
  }, [loopFrom]);

  /** Recovery when the browser refused sound. A tap is a gesture, so this always works. */
  const enableAudio = useCallback(() => {
    setAudioBlocked(false);
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = wanted.current.volume;
    if (video.paused) void video.play().catch(() => undefined);
  }, []);

  // Live settings changes: a volume slider moved while the walkout is on screen
  // should be audible now, not on the next pull.
  useEffect(() => {
    wanted.current = { enabled: sound.videoEnabled, volume: sound.videoVolume };
    const video = videoRef.current;
    if (!video) return;
    video.muted = !sound.videoEnabled;
    if (sound.videoEnabled) video.volume = sound.videoVolume;
  }, [sound.videoEnabled, sound.videoVolume]);

  // Safety net: a stalled buffer must not trap the player in the intro. Given the
  // intro's own length plus a few seconds of grace, then the card shows regardless.
  useEffect(() => {
    if (phase !== 'intro') return;
    const timer = window.setTimeout(() => setPhase('loop'), (config.loopStart + 3) * 1000);
    return () => window.clearTimeout(timer);
  }, [phase, config.loopStart]);

  useEffect(() => {
    if (phase !== 'loop' || config.autoCloseSeconds <= 0) return;
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

  // The menu music drops under the walkout for as long as it is on screen. Tied to
  // mount rather than to a phase, so skipping, closing early, or a clip that never
  // loads all bring it back.
  useEffect(() => {
    duckMusic();
    return unduckMusic;
  }, []);

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="ผลการเปิดการ์ด">
      <video
        ref={videoRef}
        className={styles.video}
        src={walkoutClip}
        preload="auto"
        playsInline
        onCanPlayThrough={onReady}
        onEnded={onEnded}
      />

      {phase === 'loading' && <div className={styles.loading}>กำลังโหลด…</div>}

      {audioBlocked && phase !== 'loading' && (
        <button type="button" className={styles.unmute} onClick={enableAudio}>
          แตะเพื่อเปิดเสียง
        </button>
      )}

      {phase === 'intro' && (
        <div className={styles.reveals}>
          {beats.map((beat) => (
            <div
              key={beat.key}
              className={`${styles.reveal} ${shown.has(beat.key) ? styles.revealIn : ''}`}
            >
              <span className={styles.revealLabel}>{beat.label}</span>
              <span className={`${styles.revealValue} ${beat.thai ? styles.revealValueThai : ''}`}>
                {beat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {phase === 'loop' && (
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
