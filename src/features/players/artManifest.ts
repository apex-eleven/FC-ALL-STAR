import { PLAYER_ART_BASE, PLAYER_ART_MANIFEST } from './constants';

/** Turns a stored file name into something an <img src> can use. */
export function playerArtUrl(artId: string | null | undefined): string | null {
  if (!artId) return null;
  // Already a path or a data URL: leave it alone, so art that arrived another way
  // still renders.
  if (artId.startsWith('/') || artId.startsWith('data:') || artId.startsWith('http')) return artId;

  // Encoded, because real card art is named by whoever downloaded it: spaces,
  // brackets and accents are routine ("Dembélé_fc_25_download (1).gif"), and a name
  // containing # or ? would otherwise cut the URL in half.
  return `${PLAYER_ART_BASE}${encodeURIComponent(artId)}`;
}

export type ArtManifestStatus = 'loading' | 'ready' | 'missing';

export interface ArtManifest {
  status: ArtManifestStatus;
  files: string[];
}

function readFiles(payload: unknown): string[] {
  // Accept both shapes so a hand-written manifest works as well as a generated one.
  const list = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && Array.isArray((payload as { files?: unknown }).files)
      ? ((payload as { files: unknown[] }).files)
      : [];

  return list
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .map((entry) => entry.replace(/^.*\//, ''))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Reads the list of art files sitting in `public/players/`.
 *
 * A browser cannot list a directory, so the file names come from a manifest built by
 * `npm run players:manifest`. A missing manifest is an ordinary state, not an error:
 * the picker says so and the admin can still type a file name by hand.
 */
export async function loadArtManifest(): Promise<ArtManifest> {
  try {
    const response = await fetch(PLAYER_ART_MANIFEST, { cache: 'no-cache' });
    if (!response.ok) return { status: 'missing', files: [] };

    const files = readFiles(await response.json());
    return { status: files.length > 0 ? 'ready' : 'missing', files };
  } catch {
    return { status: 'missing', files: [] };
  }
}
