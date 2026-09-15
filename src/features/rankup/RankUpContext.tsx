import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import { DEFAULT_RANKUP, DEFAULT_LEVELS } from './constants';
import {
  invalidateConfigCache,
  loadConfig,
  normalizeConfig,
  saveConfig,
  type SaveResult,
} from './rankupConfigStore';
import type { RankUpConfig, RankUpLevel } from './types';

interface RankUpValue {
  config: RankUpConfig;
  update(changes: Partial<RankUpConfig>): SaveResult;
  /** Edits one ladder row by level, leaving the rest untouched. */
  updateLevel(level: number, changes: Partial<RankUpLevel>): SaveResult;
  reset(): SaveResult;
  isDefault: boolean;
}

const RankUpContext = createContext<RankUpValue | null>(null);

function freshDefaults(): RankUpConfig {
  return { ...DEFAULT_RANKUP, levels: DEFAULT_LEVELS.map((level) => ({ ...level })) };
}

export function RankUpProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RankUpConfig>(loadConfig);

  // The cloud listener replaces storage under the running app, so the screen has to
  // re-read rather than wait for a reload the player will never perform.
  useEffect(() => {
    const refresh = () => {
      invalidateConfigCache();
      setConfig(loadConfig());
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const commit = useCallback((next: RankUpConfig): SaveResult => {
    const clean = normalizeConfig(next);
    const result = saveConfig(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const update = useCallback(
    (changes: Partial<RankUpConfig>) => commit({ ...config, ...changes }),
    [config, commit],
  );

  const updateLevel = useCallback(
    (level: number, changes: Partial<RankUpLevel>) =>
      commit({
        ...config,
        levels: config.levels.map((entry) =>
          entry.level === level ? { ...entry, ...changes, level } : entry,
        ),
      }),
    [config, commit],
  );

  const reset = useCallback(() => commit(freshDefaults()), [commit]);

  const value = useMemo<RankUpValue>(
    () => ({
      config,
      update,
      updateLevel,
      reset,
      isDefault: JSON.stringify(config) === JSON.stringify(freshDefaults()),
    }),
    [config, update, updateLevel, reset],
  );

  return <RankUpContext.Provider value={value}>{children}</RankUpContext.Provider>;
}

export function useRankUp(): RankUpValue {
  const value = useContext(RankUpContext);
  if (!value) throw new Error('useRankUp must be used inside a RankUpProvider');
  return value;
}
