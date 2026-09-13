import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadArtManifest, type ArtManifest } from './artManifest';
import {
  loadCatalogueFile,
  saveCatalogueFile,
  type FileSaveState,
} from './catalogueFile';
import { loadCatalogue, normalizeCard, saveCatalogue, type SaveResult } from './playerStore';
import type { PlayerCard, PlayerCardDraft } from './types';
import { CONFIG_CHANGED_EVENT } from '@/features/backup/backup';

interface PlayerValue {
  players: PlayerCard[];
  byId(id: string): PlayerCard | undefined;
  /** Resolves a list of ids to cards, dropping any that no longer exist. */
  resolve(ids: readonly string[]): PlayerCard[];
  create(draft: Omit<PlayerCardDraft, 'id'>): SaveResult;
  update(id: string, changes: Partial<PlayerCardDraft>): SaveResult;
  remove(id: string): SaveResult;
  /** Removes several at once — one write, so a half-finished purge cannot be stored. */
  removeMany(ids: readonly string[]): SaveResult;
  /** Adds many at once — one write, so a half-finished import cannot be stored. */
  importMany(drafts: readonly Omit<PlayerCardDraft, 'id'>[]): SaveResult;
  /** Replaces the whole catalogue — used by the import button. */
  replaceAll(cards: readonly PlayerCard[]): SaveResult;
  art: ArtManifest;
  reloadArt(): void;
  /**
   * Where the last write to public/players/catalogue.json got to. `unavailable`
   * means this is a built app rather than the dev server, so there is nothing to
   * write to and the panel offers a download instead.
   */
  fileState: FileSaveState;
}

const PlayerContext = createContext<PlayerValue | null>(null);

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `pc-${crypto.randomUUID()}`;
  return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<PlayerCard[]>(loadCatalogue);

  /**
   * Re-reads storage when the shared settings are replaced underneath the app.
   *
   * The admin opening or closing a pack writes one document; every open tab applies
   * it to storage and fires this. Without it the only way to see the change is a
   * page reload, which is a poor thing to ask of someone mid-draft.
   */
  useEffect(() => {
    const refresh = () => setPlayers(loadCatalogue());
    window.addEventListener(CONFIG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_CHANGED_EVENT, refresh);
  }, []);

  const [art, setArt] = useState<ArtManifest>({ status: 'loading', files: [] });
  const [fileState, setFileState] = useState<FileSaveState>(
    import.meta.env.DEV ? 'saved' : 'unavailable',
  );

  /**
   * Seeds an empty browser from the catalogue committed in the repo.
   *
   * The file is the seed, localStorage is the working copy. Only an empty store is
   * filled from it, so a browser that already has cards keeps them — and since every
   * edit writes the file back under the dev server, the two stay in step anyway.
   */
  useEffect(() => {
    if (players.length > 0) return;

    let cancelled = false;
    void loadCatalogueFile().then((cards) => {
      if (cancelled || cards.length === 0) return;
      // Straight to state, not through commit: this is a restore, not an edit, and
      // it should not immediately write the file back over itself.
      saveCatalogue(cards);
      setPlayers(cards);
    });

    return () => {
      cancelled = true;
    };
    // Runs once on mount. Re-running when `players` changes would re-seed the moment
    // an admin deleted the last card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadArt = useCallback(() => {
    setArt({ status: 'loading', files: [] });
    void loadArtManifest().then(setArt);
  }, []);

  useEffect(() => reloadArt(), [reloadArt]);

  /** Writes first and only then updates state — a card that vanishes on reload is worse
   * than an edit that refuses. */
  const commit = useCallback((next: PlayerCard[]): SaveResult => {
    const result = saveCatalogue(next);
    if (!result.ok) return result;

    setPlayers(next);
    // Mirrored into the repo so the work is not trapped in one browser profile.
    // Fire and forget: the edit is already saved locally, and a failed mirror is
    // reported in the panel rather than blocking the edit.
    void saveCatalogueFile(next).then(setFileState);
    return result;
  }, []);

  const create = useCallback(
    (draft: Omit<PlayerCardDraft, 'id'>): SaveResult => {
      const card = normalizeCard({ ...draft, id: newId(), createdAt: new Date().toISOString() });
      if (!card) return { ok: false, reason: 'unavailable' };
      return commit([...players, card]);
    },
    [players, commit],
  );

  const update = useCallback(
    (id: string, changes: Partial<PlayerCardDraft>): SaveResult => {
      const index = players.findIndex((card) => card.id === id);
      if (index < 0) return { ok: true };

      const merged = normalizeCard({ ...players[index], ...changes, id });
      if (!merged) return { ok: false, reason: 'unavailable' };

      const next = [...players];
      next[index] = merged;
      return commit(next);
    },
    [players, commit],
  );

  const remove = useCallback(
    (id: string) => commit(players.filter((card) => card.id !== id)),
    [players, commit],
  );

  const removeMany = useCallback(
    (ids: readonly string[]): SaveResult => {
      if (ids.length === 0) return { ok: true };
      const gone = new Set(ids);
      return commit(players.filter((card) => !gone.has(card.id)));
    },
    [players, commit],
  );

  const replaceAll = useCallback(
    (cards: readonly PlayerCard[]) => commit([...cards]),
    [commit],
  );

  const importMany = useCallback(
    (drafts: readonly Omit<PlayerCardDraft, 'id'>[]): SaveResult => {
      const createdAt = new Date().toISOString();
      const cards = drafts
        .map((draft) => normalizeCard({ ...draft, id: newId(), createdAt }))
        .filter((card): card is PlayerCard => card !== null);

      if (cards.length === 0) return { ok: true };
      return commit([...players, ...cards]);
    },
    [players, commit],
  );

  const value = useMemo<PlayerValue>(() => {
    const index = new Map(players.map((card) => [card.id, card]));
    return {
      players,
      byId: (id: string) => index.get(id),
      resolve: (ids: readonly string[]) =>
        ids.map((id) => index.get(id)).filter((card): card is PlayerCard => card !== undefined),
      create,
      update,
      remove,
      removeMany,
      importMany,
      replaceAll,
      art,
      reloadArt,
      fileState,
    };
  }, [
    players,
    create,
    update,
    remove,
    removeMany,
    importMany,
    replaceAll,
    art,
    reloadArt,
    fileState,
  ]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayers(): PlayerValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayers must be used inside a PlayerProvider');
  return value;
}
