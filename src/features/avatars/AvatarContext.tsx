import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { avatarCatalogue } from '@/data/mock/avatars';
import { loadOverrides, saveOverrides } from './avatarConfigStore';
import { clampRequiredLevel, resolveAvatars } from './unlocks';
import type { Avatar, AvatarCatalogue, AvatarLevelOverrides } from './types';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';

interface AvatarValue {
  /** Catalogue with admin overrides applied, in picker order. */
  avatars: Avatar[];
  /** Admin only. Level is clamped to [1, MAX_LEVEL]. */
  setRequiredLevel(id: string, level: number): void;
  /** Drops the override for one avatar, restoring its authored level. */
  clearOverride(id: string): void;
  /** Drops every override. */
  resetAll(): void;
  hasOverrides: boolean;
}

const AvatarContext = createContext<AvatarValue | null>(null);

export interface AvatarProviderProps {
  children: ReactNode;
  /** Injectable for tests and for a future server-backed catalogue. */
  catalogue?: AvatarCatalogue;
}

export function AvatarProvider({ children, catalogue = avatarCatalogue }: AvatarProviderProps) {
  const [overrides, setOverrides] = useState<AvatarLevelOverrides>(loadOverrides);

  /**
   * Re-reads storage when the shared settings are replaced underneath the app.
   *
   * The admin opening or closing a pack writes one document; every open tab applies
   * it to storage and fires this. Without it the only way to see the change is a
   * page reload, which is a poor thing to ask of someone mid-draft.
   */
  useEffect(() => {
    const refresh = () => setOverrides(loadOverrides());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);


  const commit = useCallback((next: AvatarLevelOverrides) => {
    setOverrides(next);
    saveOverrides(next);
  }, []);

  const setRequiredLevel = useCallback(
    (id: string, level: number) => {
      const definition = catalogue.find((avatar) => avatar.id === id);
      if (!definition) return;

      const clamped = clampRequiredLevel(level);
      const next = { ...overrides };

      // Setting it back to the authored value removes the override rather than
      // recording a no-op, so "overridden" stays truthful in the admin list.
      if (clamped === definition.defaultRequiredLevel) delete next[id];
      else next[id] = clamped;

      commit(next);
    },
    [catalogue, overrides, commit],
  );

  const clearOverride = useCallback(
    (id: string) => {
      if (!(id in overrides)) return;
      const next = { ...overrides };
      delete next[id];
      commit(next);
    },
    [overrides, commit],
  );

  const resetAll = useCallback(() => commit({}), [commit]);

  const avatars = useMemo(() => resolveAvatars(catalogue, overrides), [catalogue, overrides]);

  const value = useMemo<AvatarValue>(
    () => ({
      avatars,
      setRequiredLevel,
      clearOverride,
      resetAll,
      hasOverrides: Object.keys(overrides).length > 0,
    }),
    [avatars, setRequiredLevel, clearOverride, resetAll, overrides],
  );

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>;
}

export function useAvatars(): AvatarValue {
  const value = useContext(AvatarContext);
  if (!value) throw new Error('useAvatars must be used inside an AvatarProvider');
  return value;
}
