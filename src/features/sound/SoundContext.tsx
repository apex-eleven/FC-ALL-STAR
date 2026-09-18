import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { DEFAULT_SOUND } from './constants';
import {
  initMusic,
  isMusicBlocked,
  setMusicEnabled,
  setMusicTrack,
  setMusicVolume,
  subscribeMusicBlocked,
} from './music';
import { playReel, playSfx, setSfxVolume, stopReel } from './sfx';
import { loadConfig, normalizeConfig, saveConfig, type SaveResult } from './soundConfigStore';
import type { SoundConfig, SoundId } from './types';
import { useUiClickSounds } from './useUiClickSounds';

interface SoundValue {
  config: SoundConfig;
  update(changes: Partial<SoundConfig>): SaveResult;
  reset(): SaveResult;
  isDefault: boolean;
  /** Fire a sound by hand, for anything that is not a button press. */
  play(id: SoundId): void;
  /**
   * The gachapon reel's ticking, for a run of `durationMs` past `cards` cards.
   *
   * Its own entry rather than a `SoundId` because it is a sequence the length of the
   * animation, not a sound: it has to be told how long the run is and how far it
   * travels, and it has to be stoppable.
   */
  reel(durationMs: number, cards: number): void;
  /** Cuts the reel short — a run that ended early, or a screen that closed. */
  hushReel(): void;
  /**
   * The browser has refused to start the music and is waiting for a gesture.
   *
   * True only between load and the player's first tap, so the settings menu can
   * explain a switch that reads on next to silence. Nothing has to clear it.
   */
  musicBlocked: boolean;
}

const SoundContext = createContext<SoundValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SoundConfig>(loadConfig);

  // The synthesiser is module state, so the stored volume has to be pushed into it
  // on load as well as on every change.
  useEffect(() => setSfxVolume(config.uiVolume), [config.uiVolume]);

  // The music player is module state too, but unlike the synthesiser it is stateful:
  // its setters compare against the previous value and no-op on a match, which on the
  // first call is always. Hence a separate seeding pass, once, before them — empty
  // deps on purpose, since re-seeding on a config change would restart the track.
  useEffect(() => {
    initMusic({
      enabled: config.musicEnabled,
      volume: config.musicVolume,
      trackId: config.musicTrackId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setMusicEnabled(config.musicEnabled), [config.musicEnabled]);
  useEffect(() => setMusicVolume(config.musicVolume), [config.musicVolume]);
  useEffect(() => setMusicTrack(config.musicTrackId), [config.musicTrackId]);

  const musicBlocked = useSyncExternalStore(subscribeMusicBlocked, isMusicBlocked, isMusicBlocked);

  useUiClickSounds(config.uiEnabled);

  const commit = useCallback((next: SoundConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const update = useCallback(
    (changes: Partial<SoundConfig>) => commit({ ...config, ...changes }),
    [config, commit],
  );

  const reset = useCallback(() => commit({ ...DEFAULT_SOUND }), [commit]);

  const play = useCallback(
    (id: SoundId) => {
      if (!config.uiEnabled) return;
      playSfx(id);
    },
    [config.uiEnabled],
  );

  const reel = useCallback(
    (durationMs: number, cards: number) => {
      if (!config.uiEnabled) return;
      playReel(durationMs, cards);
    },
    [config.uiEnabled],
  );

  // Not gated on the setting: a reel already ticking when the player turns the sound
  // off still has to be silenced.
  const hushReel = useCallback(() => stopReel(), []);

  // The whole tick track is scheduled up front, so turning the sound off during a
  // spin would otherwise be ignored until the reel ran out on its own.
  useEffect(() => {
    if (!config.uiEnabled) stopReel();
  }, [config.uiEnabled]);

  const value = useMemo<SoundValue>(
    () => ({
      config,
      update,
      reset,
      play,
      reel,
      hushReel,
      musicBlocked,
      isDefault: JSON.stringify(config) === JSON.stringify(DEFAULT_SOUND),
    }),
    [config, update, reset, play, reel, hushReel, musicBlocked],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundValue {
  const value = useContext(SoundContext);
  if (!value) throw new Error('useSound must be used inside a SoundProvider');
  return value;
}
