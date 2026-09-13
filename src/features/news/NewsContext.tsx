import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { newsCatalogue } from '@/data/mock/news';
import { HEADING_MAX_LENGTH, MAX_NEWS_SLIDES } from './constants';
import { loadConfig, saveConfig, type SaveResult } from './newsConfigStore';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import type {
  CustomNewsSlide,
  NewsCatalogue,
  NewsConfig,
  NewsOverrides,
  NewsSlide,
  NewsSlideDefinition,
} from './types';

interface NewsValue {
  /** Catalogue with admin overrides applied, in carousel order. */
  slides: NewsSlide[];
  setHeading(id: string, heading: string): SaveResult;
  setArtwork(id: string, dataUrl: string): SaveResult;
  /** Adds an empty slide. It carries no artwork until one is uploaded. */
  createSlide(heading: string): { result: SaveResult; id: string | null };
  /** Removes any slide. Catalogue ones are remembered as removed so they stay gone. */
  deleteSlide(id: string): SaveResult;
  removedSlides: string[];
  restoreSlide(id: string): SaveResult;
  atLimit: boolean;
  /** Drops both overrides for one slide. */
  resetSlide(id: string): SaveResult;
  resetAll(): SaveResult;
  hasOverrides: boolean;
}

const NewsContext = createContext<NewsValue | null>(null);

function resolve(
  definitions: readonly NewsSlideDefinition[],
  overrides: NewsOverrides,
  custom: readonly CustomNewsSlide[],
): NewsSlide[] {
  return definitions.map((definition) => {
    const override = overrides[definition.id];
    return {
      ...definition,
      heading: override?.heading ?? definition.heading,
      artwork: override?.artwork ?? definition.artwork,
      headingOverridden: override?.heading !== undefined,
      artworkOverridden: override?.artwork !== undefined,
      custom: custom.some((slide) => slide.id === definition.id),
    };
  });
}

function newSlideId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `nb-${crypto.randomUUID()}`;
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface NewsProviderProps {
  children: ReactNode;
  catalogue?: NewsCatalogue;
}

export function NewsProvider({ children, catalogue = newsCatalogue }: NewsProviderProps) {
  const [config, setConfig] = useState<NewsConfig>(loadConfig);

  /**
   * Re-reads storage when the shared settings are replaced underneath the app.
   *
   * The admin opening or closing a pack writes one document; every open tab applies
   * it to storage and fires this. Without it the only way to see the change is a
   * page reload, which is a poor thing to ask of someone mid-draft.
   */
  useEffect(() => {
    const refresh = () => setConfig(loadConfig());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const { overrides, custom, removed } = config;

  /**
   * Writes first, then updates state only if the write landed. An image can blow
   * the storage quota, and showing a banner that vanishes on reload would be worse
   * than refusing the change.
   */
  const commit = useCallback((next: NewsConfig): SaveResult => {
    const result = saveConfig(next);
    if (result.ok) setConfig(next);
    return result;
  }, []);

  const commitOverrides = useCallback(
    (next: NewsOverrides) => commit({ ...config, overrides: next }),
    [config, commit],
  );

  // Deleted catalogue slides drop out here, before anything resolves them.
  const definitions = useMemo<NewsSlideDefinition[]>(
    () => [...catalogue.filter((slide) => !removed.includes(slide.id)), ...custom],
    [catalogue, custom, removed],
  );

  const patch = useCallback(
    (id: string, changes: Partial<{ heading: string; artwork: string }>): SaveResult => {
      const definition = definitions.find((slide) => slide.id === id);
      if (!definition) return { ok: true };
      const next: NewsOverrides = { ...overrides, [id]: { ...overrides[id], ...changes } };

      // A heading typed back to the shipped text stops being an override, so the
      // admin list keeps telling the truth about what has been changed.
      if (next[id].heading === definition.heading) delete next[id].heading;
      if (Object.keys(next[id]).length === 0) delete next[id];

      return commitOverrides(next);
    },
    [definitions, overrides, commitOverrides],
  );

  const setHeading = useCallback(
    (id: string, heading: string) => patch(id, { heading: heading.slice(0, HEADING_MAX_LENGTH) }),
    [patch],
  );

  const setArtwork = useCallback(
    (id: string, dataUrl: string) => patch(id, { artwork: dataUrl }),
    [patch],
  );

  const createSlide = useCallback(
    (heading: string): { result: SaveResult; id: string | null } => {
      if (definitions.length >= MAX_NEWS_SLIDES) {
        return { result: { ok: false, reason: 'quota' }, id: null };
      }

      const id = newSlideId();
      const slide: CustomNewsSlide = {
        id,
        heading: heading.trim().slice(0, HEADING_MAX_LENGTH) || 'แบนเนอร์ใหม่',
        // No artwork yet. The upload is a separate step because encoding an image is
        // the part that can fail, and a slide that failed to be created at all is
        // harder to recover from than one that is simply still blank.
        artwork: '',
        createdAt: new Date().toISOString(),
      };

      const result = commit({ ...config, custom: [...custom, slide] });
      return { result, id: result.ok ? id : null };
    },
    [definitions.length, custom, config, commit],
  );

  const deleteSlide = useCallback(
    (id: string): SaveResult => {
      const nextOverrides = { ...overrides };
      // The override describes a slide that no longer exists; keeping it would
      // resurrect old edits if the id ever came back.
      delete nextOverrides[id];

      if (custom.some((slide) => slide.id === id)) {
        return commit({
          ...config,
          overrides: nextOverrides,
          custom: custom.filter((slide) => slide.id !== id),
        });
      }

      return commit({
        ...config,
        overrides: nextOverrides,
        removed: removed.includes(id) ? removed : [...removed, id],
      });
    },
    [overrides, custom, removed, config, commit],
  );

  const restoreSlide = useCallback(
    (id: string) => commit({ ...config, removed: removed.filter((entry) => entry !== id) }),
    [config, removed, commit],
  );

  const resetSlide = useCallback(
    (id: string): SaveResult => {
      if (!(id in overrides)) return { ok: true };
      const next = { ...overrides };
      delete next[id];
      return commitOverrides(next);
    },
    [overrides, commitOverrides],
  );

  const resetAll = useCallback(() => commitOverrides({}), [commitOverrides]);

  const slides = useMemo(
    () => resolve(definitions, overrides, custom),
    [definitions, overrides, custom],
  );

  const value = useMemo<NewsValue>(
    () => ({
      slides,
      setHeading,
      setArtwork,
      createSlide,
      deleteSlide,
      removedSlides: removed,
      restoreSlide,
      atLimit: definitions.length >= MAX_NEWS_SLIDES,
      resetSlide,
      resetAll,
      hasOverrides:
        Object.keys(overrides).length > 0 || custom.length > 0 || removed.length > 0,
    }),
    [
      slides,
      setHeading,
      setArtwork,
      createSlide,
      deleteSlide,
      restoreSlide,
      resetSlide,
      resetAll,
      overrides,
      custom,
      removed,
      definitions.length,
    ],
  );

  return <NewsContext.Provider value={value}>{children}</NewsContext.Provider>;
}

export function useNews(): NewsValue {
  const value = useContext(NewsContext);
  if (!value) throw new Error('useNews must be used inside a NewsProvider');
  return value;
}
