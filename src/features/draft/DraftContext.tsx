import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { draftCatalogue } from '@/data/mock/draft';
import { usePlayers } from '@/features/players/PlayerContext';
import {
  DEFAULT_SHOWCASE,
  MAX_CUSTOM_EVENTS,
  NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from './constants';
import { loadConfig, saveConfig, type SaveResult } from './draftConfigStore';
import { cardToPlayer } from './pool';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';
import type {
  CustomDraftEvent,
  DraftCatalogue,
  DraftConfig,
  DraftEvent,
  DraftEventDefinition,
  DraftOverrides,
  DraftPack,
  DraftPlayer,
  PityRule,
  SetOdds,
  ShowcaseSlot,
} from './types';

interface DraftValue {
  /** Everything, including hidden and out-of-window events. The admin panel needs these. */
  events: DraftEvent[];
  /** What a player is allowed to see: visible, in window, and with cards in the pool. */
  liveEvents: DraftEvent[];
  byId(id: string): DraftEvent | undefined;

  setRailName(id: string, value: string): SaveResult;
  setTitle(id: string, value: string): SaveResult;
  setBanner(id: string, dataUrl: string): SaveResult;
  setThumbnail(id: string, dataUrl: string): SaveResult;
  setOdds(id: string, odds: SetOdds): SaveResult;
  setPityThreshold(id: string, ruleId: string, threshold: number): SaveResult;
  setPool(id: string, pool: DraftPlayer[]): SaveResult;

  /** Store side. */
  setPoolIds(id: string, ids: string[]): SaveResult;
  setPacks(id: string, packs: DraftPack[]): SaveResult;
  /** Card placement on the banner, written by the drag editor. */
  setShowcase(id: string, slots: ShowcaseSlot[]): SaveResult;
  /** Replaces the guarantee rules. An empty list means this event has none. */
  setPity(id: string, rules: PityRule[]): SaveResult;
  setHidden(id: string, hidden: boolean): SaveResult;
  setOrder(id: string, order: number): SaveResult;
  setWindow(id: string, startsAt: string | null, endsAt: string | null): SaveResult;

  createEvent(railName: string): { result: SaveResult; id: string | null };
  /** Removes any event. Catalogue ones are remembered as removed so they stay gone. */
  deleteEvent(id: string): SaveResult;
  /** Catalogue events an admin deleted, by id — the only way back is restoreEvent. */
  removedEvents: string[];
  restoreEvent(id: string): SaveResult;

  resetEvent(id: string): SaveResult;
  resetAll(): SaveResult;
  hasOverrides: boolean;
}

const DraftContext = createContext<DraftValue | null>(null);

function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `ev-${crypto.randomUUID()}`;
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** A custom event is a definition with its pool held as ids instead of objects. */
function asDefinition(event: CustomDraftEvent, pool: DraftPlayer[]): DraftEventDefinition {
  return {
    id: event.id,
    railName: event.railName,
    title: event.title,
    thumbnail: event.thumbnail,
    banner: event.banner,
    hot: event.hot,
    endsInDays: event.endsInDays,
    pool,
    odds: event.odds,
    pity: event.pity,
    packs: event.packs,
  };
}

export interface DraftProviderProps {
  children: ReactNode;
  catalogue?: DraftCatalogue;
}

export function DraftProvider({ children, catalogue = draftCatalogue }: DraftProviderProps) {
  const [config, setConfig] = useState<DraftConfig>(loadConfig);

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

  const { resolve: resolveCards } = usePlayers();

  const { overrides, custom, removed } = config;

  /**
   * Writes first, then updates state only if the write landed. Banner images are
   * large enough to hit the storage quota, and a change that vanishes on reload is
   * worse than a refused edit.
   */
  const commit = useCallback((next: DraftConfig): SaveResult => {
    const result = saveConfig(next);
    if (result.ok) setConfig(next);
    return result;
  }, []);

  const commitOverrides = useCallback(
    (next: DraftOverrides) => commit({ ...config, overrides: next }),
    [config, commit],
  );

  const definitions = useMemo<DraftEventDefinition[]>(() => {
    const customDefinitions = custom.map((event) =>
      // Ids the catalogue no longer has are dropped here rather than rendering a
      // blank card: every read repairs against what actually exists.
      asDefinition(event, resolveCards(event.poolIds).map(cardToPlayer)),
    );
    // Deleted catalogue events drop out here, before anything resolves them, so no
    // screen has to remember to filter them again.
    return [...catalogue.filter((event) => !removed.includes(event.id)), ...customDefinitions];
  }, [catalogue, custom, removed, resolveCards]);

  const events = useMemo<DraftEvent[]>(() => {
    const now = Date.now();

    const resolved = definitions.map((definition, index): DraftEvent => {
      const override = overrides[definition.id];

      // Pity thresholds are overridden per rule id, so adding a rule to the catalogue
      // later keeps working against an older stored override.
      const rules = override?.pityRules ?? definition.pity;
      const pity = rules.map((rule) => ({
        ...rule,
        threshold: override?.pity?.[rule.id] ?? rule.threshold,
      }));

      const pool = override?.poolIds
        ? resolveCards(override.poolIds).map(cardToPlayer)
        : (override?.pool ?? definition.pool);

      const startsAt = override?.startsAt ?? null;
      const endsAt = override?.endsAt ?? null;
      const hidden = override?.hidden ?? false;

      const started = !startsAt || Date.parse(startsAt) <= now;
      const ended = Boolean(endsAt) && Date.parse(endsAt as string) < now;

      return {
        ...definition,
        railName: override?.railName ?? definition.railName,
        title: override?.title ?? definition.title,
        banner: override?.banner ?? definition.banner,
        thumbnail: override?.thumbnail ?? definition.thumbnail,
        odds: override?.odds ?? definition.odds,
        packs: override?.packs ?? definition.packs,
        pity,
        pool,
        custom: custom.some((event) => event.id === definition.id),
        showcase:
          override?.showcase ??
          custom.find((event) => event.id === definition.id)?.showcase ??
          DEFAULT_SHOWCASE.map((slot) => ({ ...slot })),
        showcaseOverridden: override?.showcase !== undefined,
        hidden,
        // Events without an explicit order keep catalogue order, after anything that
        // was deliberately placed.
        order: override?.order ?? 100 + index,
        startsAt,
        endsAt,
        live: !hidden && started && !ended && pool.length > 0,
        railNameOverridden: override?.railName !== undefined,
        titleOverridden: override?.title !== undefined,
        bannerOverridden: override?.banner !== undefined,
        thumbnailOverridden: override?.thumbnail !== undefined,
        oddsOverridden: override?.odds !== undefined,
        pityOverridden: override?.pity !== undefined || override?.pityRules !== undefined,
        poolOverridden: override?.pool !== undefined || override?.poolIds !== undefined,
        poolIdsOverridden: override?.poolIds !== undefined,
        packsOverridden: override?.packs !== undefined,
      };
    });

    return resolved.sort((a, b) => a.order - b.order);
  }, [definitions, overrides, custom, resolveCards]);

  const patch = useCallback(
    (id: string, changes: Partial<DraftOverrides[string]>): SaveResult => {
      const definition = definitions.find((event) => event.id === id);
      if (!definition) return { ok: true };

      const next: DraftOverrides = { ...overrides, [id]: { ...overrides[id], ...changes } };

      // Text typed back to the shipped value stops being an override, so the admin
      // list keeps telling the truth about what has been changed.
      if (next[id].railName === definition.railName) delete next[id].railName;
      if (next[id].title === definition.title) delete next[id].title;
      if (next[id].hidden === false) delete next[id].hidden;
      if (Object.keys(next[id]).length === 0) delete next[id];

      return commitOverrides(next);
    },
    [definitions, overrides, commitOverrides],
  );

  const setRailName = useCallback(
    (id: string, value: string) => patch(id, { railName: value.slice(0, NAME_MAX_LENGTH) }),
    [patch],
  );
  const setTitle = useCallback(
    (id: string, value: string) => patch(id, { title: value.slice(0, TITLE_MAX_LENGTH) }),
    [patch],
  );
  const setBanner = useCallback((id: string, dataUrl: string) => patch(id, { banner: dataUrl }), [patch]);
  const setThumbnail = useCallback(
    (id: string, dataUrl: string) => patch(id, { thumbnail: dataUrl }),
    [patch],
  );
  const setOdds = useCallback((id: string, odds: SetOdds) => patch(id, { odds }), [patch]);
  // The two pool shapes are exclusive. Writing one clears the other, so an event is
  // never half catalogue-backed and half a frozen copy — whichever was edited last
  // is the one that counts, and the admin panel can say which.
  const setPool = useCallback(
    (id: string, pool: DraftPlayer[]) => patch(id, { pool, poolIds: undefined }),
    [patch],
  );
  const setPoolIds = useCallback(
    (id: string, ids: string[]) => patch(id, { poolIds: ids, pool: undefined }),
    [patch],
  );
  const setPacks = useCallback((id: string, packs: DraftPack[]) => patch(id, { packs }), [patch]);
  const setShowcase = useCallback(
    (id: string, slots: ShowcaseSlot[]) => patch(id, { showcase: slots }),
    [patch],
  );
  const setPity = useCallback(
    // Changing the rule set clears the per-rule thresholds: they are keyed by rule
    // id, and a threshold left behind for a deleted rule would come back the moment
    // an id was reused.
    (id: string, rules: PityRule[]) => patch(id, { pityRules: rules, pity: undefined }),
    [patch],
  );
  const setHidden = useCallback((id: string, hidden: boolean) => patch(id, { hidden }), [patch]);
  const setOrder = useCallback(
    (id: string, order: number) => patch(id, { order: Math.max(0, Math.min(999, Math.floor(order))) }),
    [patch],
  );
  const setWindow = useCallback(
    (id: string, startsAt: string | null, endsAt: string | null) => patch(id, { startsAt, endsAt }),
    [patch],
  );

  const setPityThreshold = useCallback(
    (id: string, ruleId: string, threshold: number): SaveResult => {
      const definition = definitions.find((event) => event.id === id);
      if (!definition) return { ok: true };

      const clamped = Math.max(1, Math.min(999, Math.floor(threshold)));
      const current = overrides[id]?.pity ?? {};
      const next = { ...current, [ruleId]: clamped };

      // A threshold typed back to the shipped value stops being an override.
      const shipped = definition.pity.find((rule) => rule.id === ruleId)?.threshold;
      if (shipped === clamped) delete next[ruleId];

      return patch(id, { pity: Object.keys(next).length > 0 ? next : undefined });
    },
    [definitions, overrides, patch],
  );

  const createEvent = useCallback(
    (railName: string): { result: SaveResult; id: string | null } => {
      if (custom.length >= MAX_CUSTOM_EVENTS) {
        return { result: { ok: false, reason: 'quota' }, id: null };
      }

      const id = newEventId();
      const name = railName.trim().slice(0, NAME_MAX_LENGTH) || 'แพ็คใหม่';

      // Starts empty, hidden, and unsellable on purpose. A pack that goes live the
      // instant it is named would be one with no cards and no price.
      const event: CustomDraftEvent = {
        id,
        railName: name,
        title: name,
        banner: '',
        thumbnail: '',
        hot: false,
        endsInDays: 7,
        poolIds: [],
        showcase: DEFAULT_SHOWCASE.map((slot) => ({ ...slot })),
        odds: { A: 1, B: 6, C: 28, D: 65 },
        pity: [],
        packs: [],
        createdAt: new Date().toISOString(),
      };

      const result = commit({
        ...config,
        overrides: { ...overrides, [id]: { hidden: true } },
        custom: [...custom, event],
      });

      return { result, id: result.ok ? id : null };
    },
    [custom, overrides, commit],
  );

  const deleteEvent = useCallback(
    (id: string): SaveResult => {
      const isCustom = custom.some((event) => event.id === id);
      const nextOverrides = { ...overrides };

      // Either way the override goes: it describes an event that no longer exists,
      // and keeping it would resurrect old edits if the id ever came back.
      delete nextOverrides[id];

      if (isCustom) {
        return commit({
          ...config,
          overrides: nextOverrides,
          custom: custom.filter((e) => e.id !== id),
        });
      }

      // A catalogue event lives in source and cannot be erased at runtime, so being
      // gone is recorded instead.
      return commit({
        ...config,
        overrides: nextOverrides,
        removed: removed.includes(id) ? removed : [...removed, id],
      });
    },
    [custom, overrides, removed, config, commit],
  );

  const restoreEvent = useCallback(
    (id: string) => commit({ ...config, removed: removed.filter((entry) => entry !== id) }),
    [config, removed, commit],
  );

  const resetEvent = useCallback(
    (id: string): SaveResult => {
      if (!(id in overrides)) return { ok: true };
      const next = { ...overrides };
      delete next[id];
      return commitOverrides(next);
    },
    [overrides, commitOverrides],
  );

  const resetAll = useCallback(() => commitOverrides({}), [commitOverrides]);

  const value = useMemo<DraftValue>(
    () => ({
      events,
      liveEvents: events.filter((event) => event.live),
      byId: (id: string) => events.find((event) => event.id === id),
      setRailName,
      setTitle,
      setBanner,
      setThumbnail,
      setOdds,
      setPityThreshold,
      setPool,
      setPoolIds,
      setPacks,
      setShowcase,
      setPity,
      setHidden,
      setOrder,
      setWindow,
      createEvent,
      deleteEvent,
      removedEvents: removed,
      restoreEvent,
      resetEvent,
      resetAll,
      hasOverrides:
        Object.keys(overrides).length > 0 || custom.length > 0 || removed.length > 0,
    }),
    [
      events,
      setRailName,
      setTitle,
      setBanner,
      setThumbnail,
      setOdds,
      setPityThreshold,
      setPool,
      setPoolIds,
      setPacks,
      setShowcase,
      setPity,
      setHidden,
      setOrder,
      setWindow,
      createEvent,
      deleteEvent,
      restoreEvent,
      resetEvent,
      resetAll,
      overrides,
      custom,
      removed,
    ],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useDraft must be used inside a DraftProvider');
  return value;
}
