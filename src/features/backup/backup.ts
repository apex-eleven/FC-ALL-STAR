/**
 * Backup and restore for everything the game keeps in this browser.
 *
 * Two different problems, deliberately solved two different ways:
 *
 * **Admin data** — the card catalogue, draft and store setup, league tuning, news
 * banners, walkout timings. No secrets, and it is the work that hurts most to lose.
 * Mirrored into `public/config/admin.json` under the dev server, restored
 * automatically when a fresh browser has nothing, and committed with the repo so it
 * follows the project to a new machine.
 *
 * **Accounts** — usernames, password hashes, wallets, clubs, squads, league standing.
 * These never go into `public/`: that folder is served to anyone who opens the site,
 * and publishing password hashes because it was convenient would be indefensible.
 * They travel through an export file the operator saves wherever they want.
 */

/** Everything this app stores is namespaced. Nothing else in localStorage is touched. */
export const STORAGE_PREFIX = 'football-home-ui:';

/**
 * Fired after settings are replaced underneath a running app.
 *
 * Every context reads its storage once, when it mounts. Without a nudge the only way
 * to see new settings is a page reload, which is exactly what a player in the middle
 * of a draft should not be asked to do.
 */
export const CONFIG_CHANGED_EVENT = 'fcallstar:config-changed';

export function announceConfigChange() {
  window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT));
}

/**
 * Per-device preferences. Never shared, even though they live under the same prefix.
 *
 * Sound volume is the player's, not the game's. Pushing the admin's setting to
 * everyone would turn one person's muted tab into everyone's muted tab.
 */
const PERSONAL_KEYS = [
  `${STORAGE_PREFIX}sound:v1`,
  // Which announcement this device has closed. Shared, it would carry the admin's
  // own "already seen" out to everyone and the notice would never appear.
  `${STORAGE_PREFIX}announcement-seen:v1`,
  // How much this device animates. One player's phone on battery saver must not
  // decide how the game looks for everybody else.
  `${STORAGE_PREFIX}motion:v1`,
];

/** Keys holding account data — excluded from anything written into public/. */
const ACCOUNT_KEYS = [`${STORAGE_PREFIX}accounts:v2`, `${STORAGE_PREFIX}session:v2`];

/**
 * Keys that a newer key has replaced, as `old -> new`.
 *
 * An old key is only dead once its replacement exists. A browser that never opened
 * the newer build still has its real data under the old key, and dropping it from a
 * backup there would lose the save — so the check is per-browser, not a blanket list.
 *
 * This matters more than it sounds: `draft-events:v1` holds the banner images as data
 * URLs and ran to 797 KB in practice, which was twenty times the size of everything
 * else in the mirror put together.
 */
const SUPERSEDED: Record<string, string> = {
  [`${STORAGE_PREFIX}draft-events:v1`]: `${STORAGE_PREFIX}draft-events:v2`,
  [`${STORAGE_PREFIX}news-slides:v1`]: `${STORAGE_PREFIX}news-slides:v2`,
};

/**
 * Keys from before accounts existed. Nothing reads them any more, and the phase-1
 * profile record is account-shaped, so it has no business in a public/ file.
 */
const ABANDONED = [`${STORAGE_PREFIX}account:v1`];

function isDead(key: string): boolean {
  if (ABANDONED.includes(key)) return true;

  const replacement = SUPERSEDED[key];
  return replacement !== undefined && window.localStorage.getItem(replacement) !== null;
}

/** Served from public/, so a fresh browser can read it back. */
export const CONFIG_FILE = '/config/admin.json';

const CONFIG_ENDPOINT = '/__store/config';

export interface Snapshot {
  /** Format marker, so a wrong file picked by mistake is refused rather than applied. */
  kind: 'fc-allstar-backup';
  version: 1;
  savedAt: string;
  includesAccounts: boolean;
  /** localStorage key -> raw stored string. Values are kept verbatim. */
  entries: Record<string, string>;
}

function readKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Reads the current browser state. `withAccounts: false` leaves out anything secret. */
export function collectSnapshot(withAccounts: boolean): Snapshot {
  const entries: Record<string, string> = {};

  for (const key of readKeys()) {
    if (!withAccounts && ACCOUNT_KEYS.includes(key)) continue;
    if (!withAccounts && PERSONAL_KEYS.includes(key)) continue;
    if (isDead(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }

  return {
    kind: 'fc-allstar-backup',
    version: 1,
    savedAt: new Date().toISOString(),
    includesAccounts: withAccounts,
    entries,
  };
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Snapshot>;
  return candidate.kind === 'fc-allstar-backup' && typeof candidate.entries === 'object';
}

export type ApplyMode = 'missing-only' | 'replace';

/**
 * Writes a snapshot back into localStorage.
 *
 * `missing-only` fills gaps and never overwrites — that is what the automatic restore
 * uses, so opening the game on a machine that already has data cannot wipe it.
 * `replace` overwrites every key in the file, which is what an operator means when
 * they deliberately import a backup.
 *
 * The caller must reload the page afterwards: every context read its storage once, at
 * mount, and none of them are watching for changes underneath.
 */
export function applySnapshot(snapshot: Snapshot, mode: ApplyMode): number {
  let applied = 0;

  for (const [key, value] of Object.entries(snapshot.entries)) {
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    if (mode === 'missing-only' && window.localStorage.getItem(key) !== null) continue;

    try {
      window.localStorage.setItem(key, value);
      applied += 1;
    } catch {
      // Out of quota partway through. Stop rather than leave half a save behind.
      break;
    }
  }

  return applied;
}

export type MirrorState = 'saved' | 'unavailable' | 'failed';

/** Mirrors the admin config into the repo. Dev only — a build has no endpoint. */
export async function saveConfigToRepo(): Promise<MirrorState> {
  if (!import.meta.env.DEV) return 'unavailable';

  try {
    const response = await fetch(CONFIG_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(collectSnapshot(false)),
    });
    return response.ok ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Fills an empty browser from the config committed in the repo.
 *
 * Runs before the app renders, because every provider reads its storage as it mounts
 * and would otherwise start from defaults, then be contradicted a frame later.
 */
export async function restoreConfigFromRepo(): Promise<number> {
  try {
    const response = await fetch(CONFIG_FILE, { cache: 'no-cache' });
    if (!response.ok) return 0;

    const parsed: unknown = await response.json();
    if (!isSnapshot(parsed)) return 0;

    // Never overwrites. A machine with its own data keeps it.
    return applySnapshot(parsed, 'missing-only');
  } catch {
    return 0;
  }
}

export function downloadSnapshot(snapshot: Snapshot) {
  const stamp = snapshot.savedAt.slice(0, 19).replace(/[:T]/g, '-');
  const name = snapshot.includesAccounts
    ? `fc-allstar-backup-${stamp}.json`
    : `fc-allstar-config-${stamp}.json`;

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();

  // Revoking immediately cancels the download in some browsers; a frame is enough.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export async function readSnapshotFile(file: File): Promise<Snapshot | null> {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
