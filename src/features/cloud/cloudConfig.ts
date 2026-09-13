import { doc, getDoc, setDoc } from 'firebase/firestore';
import { applySnapshot, collectSnapshot, isSnapshot, type Snapshot } from '@/features/backup/backup';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * Game settings, shared by everyone through one Firestore document.
 *
 * This is the difference between "the admin edits their own browser" and "the admin
 * edits the game". The card catalogue, packs, draft rates, league tuning, banners,
 * and walkout timings all live in `config/admin`, every client reads it at startup,
 * and the rules let only an admin write it.
 *
 * The repo file `public/config/admin.json` stays as the fallback: a deployment with
 * no Firebase still ships its settings, and a Firestore outage leaves the game
 * playable with whatever was committed.
 */

/**
 * Firestore's hard limit is 1 MiB per document. Banner images are stored as data
 * URLs, so a few large uploads genuinely can approach it — refusing early with a
 * clear message beats a write that fails with a quota error nobody can interpret.
 */
const MAX_DOC_BYTES = 900_000;

export type ConfigPushState = 'saved' | 'too-large' | 'denied' | 'unavailable' | 'failed';

function configRef() {
  const db = cloudDb();
  return db ? doc(db, PATHS.config, PATHS.configDoc) : null;
}

/** Writes the current browser's settings to the cloud. Admin only, by rule. */
export async function pushConfigToCloud(): Promise<ConfigPushState> {
  const reference = configRef();
  if (!reference) return 'unavailable';

  // Accounts are never part of this: the config document is world-readable so that
  // the sign-in screen can load the game before anyone has logged in.
  const snapshot = collectSnapshot(false);
  const payload = JSON.stringify(snapshot);
  if (payload.length > MAX_DOC_BYTES) return 'too-large';

  try {
    await setDoc(reference, { snapshot: payload, savedAt: snapshot.savedAt });
    return 'saved';
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    return code === 'permission-denied' ? 'denied' : 'failed';
  }
}

/**
 * Reads shared settings and applies them over the local copy.
 *
 * `replace`, not `missing-only` — that is the point of shared settings. A player's
 * browser holding an older catalogue must take the admin's newer one, otherwise the
 * first person to open the game would be stuck with that day's cards forever.
 *
 * Their own account data is untouched: it is not in this document at all.
 */
export async function pullConfigFromCloud(): Promise<number> {
  if (!isCloudEnabled()) return 0;

  const reference = configRef();
  if (!reference) return 0;

  try {
    const document = await getDoc(reference);
    if (!document.exists()) return 0;

    const raw = document.data().snapshot;
    if (typeof raw !== 'string') return 0;

    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return 0;

    return applySnapshot(parsed as Snapshot, 'replace');
  } catch {
    // Offline, blocked, or rules misconfigured. The committed JSON already ran, so
    // the game has settings either way.
    return 0;
  }
}
