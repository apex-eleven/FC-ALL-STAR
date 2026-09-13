import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SOUND } from './constants';
import { playSfx, setSfxVolume } from './sfx';
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
}

const SoundContext = createContext<SoundValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SoundConfig>(loadConfig);

  // The synthesiser is module state, so the stored volume has to be pushed into it
  // on load as well as on every change.
  useEffect(() => setSfxVolume(config.uiVolume), [config.uiVolume]);

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

  const value = useMemo<SoundValue>(
    () => ({
      config,
      update,
      reset,
      play,
      isDefault: JSON.stringify(config) === JSON.stringify(DEFAULT_SOUND),
    }),
    [config, update, reset, play],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundValue {
  const value = useContext(SoundContext);
  if (!value) throw new Error('useSound must be used inside a SoundProvider');
  return value;
}
