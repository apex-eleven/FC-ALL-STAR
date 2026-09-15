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
import { DEFAULT_ANNOUNCEMENT, newRevision } from './constants';
import {
  isLive,
  loadAnnouncement,
  markSeen,
  normalizeAnnouncement,
  readSeen,
  saveAnnouncement,
  type SaveResult,
} from './announcementStore';
import type { AnnouncementConfig } from './types';

interface AnnouncementValue {
  config: AnnouncementConfig;
  /** Edits without republishing — the notice stays closed for anyone who closed it. */
  update(changes: Partial<AnnouncementConfig>): SaveResult;
  /** Saves and bumps the revision, so everyone sees it again. */
  publish(changes?: Partial<AnnouncementConfig>): SaveResult;
  clear(): SaveResult;
  /** True when it should be on screen for this player, right now. */
  visible: boolean;
  dismiss(): void;
}

const AnnouncementContext = createContext<AnnouncementValue | null>(null);

export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AnnouncementConfig>(loadAnnouncement);
  const [seen, setSeen] = useState<string>(readSeen);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => {
      setConfig(loadAnnouncement());
      setNow(Date.now());
    };
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  /**
   * Re-evaluates the schedule on a slow tick.
   *
   * Without it, a notice scheduled to start in ten minutes would only appear on the
   * next reload, which is exactly the case a schedule exists to cover. Half a minute
   * is close enough for something a person reads.
   */
  useEffect(() => {
    if (!config.startAt && !config.endAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [config.startAt, config.endAt]);

  const commit = useCallback((next: AnnouncementConfig): SaveResult => {
    const clean = normalizeAnnouncement(next);
    const result = saveAnnouncement(clean);
    if (result.ok) setConfig(clean);
    return result;
  }, []);

  const update = useCallback(
    (changes: Partial<AnnouncementConfig>) => commit({ ...config, ...changes }),
    [config, commit],
  );

  const publish = useCallback(
    (changes: Partial<AnnouncementConfig> = {}) =>
      commit({ ...config, ...changes, revision: newRevision() }),
    [config, commit],
  );

  const clear = useCallback(
    () => commit({ ...DEFAULT_ANNOUNCEMENT }),
    [commit],
  );

  const dismiss = useCallback(() => {
    if (config.once) {
      markSeen(config.revision);
      setSeen(config.revision);
    } else {
      // Not a "once" notice, so nothing is written to storage — it is closed for
      // this session only and comes back on the next visit.
      setSeen(`session:${config.revision}`);
    }
  }, [config.once, config.revision]);

  // A publish resets the session dismissal too: the revision in `seen` no longer
  // matches, so the new notice opens without a reload.
  const visible = isLive(config, now) && seen !== config.revision && seen !== `session:${config.revision}`;

  const value = useMemo<AnnouncementValue>(
    () => ({ config, update, publish, clear, visible, dismiss }),
    [config, update, publish, clear, visible, dismiss],
  );

  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>;
}

export function useAnnouncement(): AnnouncementValue {
  const value = useContext(AnnouncementContext);
  if (!value) throw new Error('useAnnouncement must be used inside an AnnouncementProvider');
  return value;
}
