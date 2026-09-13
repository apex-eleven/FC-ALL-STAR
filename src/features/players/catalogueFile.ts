import { normalizeCatalogue } from './playerStore';
import type { PlayerCard } from './types';

/** Served from public/, so it is readable by any browser that opens the app. */
export const CATALOGUE_FILE = '/players/catalogue.json';

/** Written by the dev-server plugin in vite-plugins/repo-store.ts. */
const CATALOGUE_ENDPOINT = '/__store/catalogue';

export type FileSaveState = 'saved' | 'unavailable' | 'failed';

/**
 * Reads the catalogue committed in the repo.
 *
 * Used to seed a browser that has nothing stored yet — a cleared profile, a second
 * browser, a different machine. Returns an empty list when the file is absent, which
 * is the normal state before anything has been saved.
 */
export async function loadCatalogueFile(): Promise<PlayerCard[]> {
  try {
    const response = await fetch(CATALOGUE_FILE, { cache: 'no-cache' });
    if (!response.ok) return [];
    return normalizeCatalogue(await response.json());
  } catch {
    return [];
  }
}

/**
 * Asks the dev server to write the catalogue into the repo.
 *
 * `unavailable` is not an error: a production build has no such endpoint, and the
 * admin panel offers a manual download there instead.
 */
export async function saveCatalogueFile(cards: readonly PlayerCard[]): Promise<FileSaveState> {
  if (!import.meta.env.DEV) return 'unavailable';

  try {
    const response = await fetch(CATALOGUE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cards),
    });
    return response.ok ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Manual export, for when the dev server is not the one running the app. */
export function downloadCatalogue(cards: readonly PlayerCard[]) {
  const blob = new Blob([`${JSON.stringify(cards, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'catalogue.json';
  link.click();

  // Revoking immediately can cancel the download in some browsers; a frame is enough.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** Reads a file the admin picked. Repaired through the same normaliser as storage. */
export async function readCatalogueUpload(file: File): Promise<PlayerCard[] | null> {
  try {
    return normalizeCatalogue(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
