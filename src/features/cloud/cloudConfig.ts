import { doc, getDoc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import {
  announceConfigChange,
  applySnapshot,
  collectSnapshot,
  isSnapshot,
  type Snapshot,
} from '@/features/backup/backup';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * Game settings, shared by everyone through Firestore.
 *
 * This is the difference between "the admin edits their own browser" and "the admin
 * edits the game". The card catalogue, packs, draft rates, league tuning, banners,
 * item art and the rest live under `config/`, every client reads them at startup,
 * and the rules let only an admin write them.
 *
 * The repo file `public/config/admin.json` stays as the fallback: a deployment with
 * no Firebase still ships its settings, and a Firestore outage leaves the game
 * playable with whatever was committed.
 *
 * ## Parts
 *
 * Firestore caps a document at 1 MiB, and uploaded art (banners, trophies, item
 * pictures) is stored as data URLs — together they outgrow one document. The
 * settings are therefore written as a string cut into parts, `config/admin-part-0`,
 * `-1`, …, and `config/admin` names how many parts the current save has and when it
 * was made. Readers fetch the parts, check each carries the same save stamp, and
 * join them. A save made before parts existed (`snapshot` inline on `config/admin`)
 * still reads.
 */

/**
 * Characters per part. Firestore counts UTF-8 bytes and Thai text is three bytes a
 * character, so a part is sized for the worst case: 300 000 × 3 stays under 1 MiB.
 */
const PART_CHARS = 300_000;
/** A settings save bigger than this (about 9 MB) is refused rather than written. */
const MAX_PARTS = 30;

export type ConfigPushState = 'saved' | 'too-large' | 'denied' | 'unavailable' | 'failed';

function configRef() {
  const db = cloudDb();
  return db ? doc(db, PATHS.config, PATHS.configDoc) : null;
}

function partRef(index: number) {
  const db = cloudDb();
  return db ? doc(db, PATHS.config, `${PATHS.configDoc}-part-${index}`) : null;
}

/** Writes the current browser's settings to the cloud. Admin only, by rule. */
export async function pushConfigToCloud(): Promise<ConfigPushState> {
  const reference = configRef();
  if (!reference) return 'unavailable';

  // Accounts are never part of this: the config documents are world-readable so
  // that the sign-in screen can load the game before anyone has logged in.
  const snapshot = collectSnapshot(false);
  const payload = JSON.stringify(snapshot);
  const parts: string[] = [];
  for (let start = 0; start < payload.length; start += PART_CHARS) {
    parts.push(payload.slice(start, start + PART_CHARS));
  }
  if (parts.length > MAX_PARTS) return 'too-large';

  try {
    // Parts first, the index last: a reader woken by the index finds every part of
    // this save already in place.
    for (const [index, data] of parts.entries()) {
      const target = partRef(index);
      if (!target) return 'unavailable';
      await setDoc(target, { data, savedAt: snapshot.savedAt, index });
    }
    await setDoc(reference, { parts: parts.length, savedAt: snapshot.savedAt });
    return 'saved';
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    return code === 'permission-denied' ? 'denied' : 'failed';
  }
}

/**
 * The settings a `config/admin` document points at, or null when they cannot be
 * put together (missing part, part from another save, malformed JSON).
 */
async function readSnapshot(index: DocumentData): Promise<Snapshot | null> {
  let raw: string;
  if (typeof index.snapshot === 'string') {
    // Saved before parts existed.
    raw = index.snapshot;
  } else {
    const count = typeof index.parts === 'number' ? Math.floor(index.parts) : 0;
    if (count <= 0 || count > MAX_PARTS) return null;
    const pieces: string[] = [];
    for (let part = 0; part < count; part += 1) {
      const target = partRef(part);
      if (!target) return null;
      const document = await getDoc(target);
      const data = document.exists() ? document.data() : null;
      // A part from a different save means a newer write is under way; its index
      // update will arrive and be read then.
      if (!data || data.savedAt !== index.savedAt || typeof data.data !== 'string') return null;
      pieces.push(data.data);
    }
    raw = pieces.join('');
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? (parsed as Snapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Reads shared settings and applies them over the local copy.
 *
 * `replace`, not `missing-only` — that is the point of shared settings. A player's
 * browser holding an older catalogue must take the admin's newer one, otherwise the
 * first person to open the game would be stuck with that day's cards forever.
 *
 * Their own account data is untouched: it is not in these documents at all.
 */
export async function pullConfigFromCloud(): Promise<number> {
  if (!isCloudEnabled()) return 0;

  const reference = configRef();
  if (!reference) return 0;

  try {
    const document = await getDoc(reference);
    if (!document.exists()) return 0;

    const snapshot = await readSnapshot(document.data());
    return snapshot ? applySnapshot(snapshot, 'replace') : 0;
  } catch {
    // Offline, blocked, or rules misconfigured. The committed JSON already ran, so
    // the game has settings either way.
    return 0;
  }
}

/**
 * Keeps the running app in step with the admin, without a reload.
 *
 * One `onSnapshot` on the index document. An admin closing the panel is one save;
 * every open tab gets the new settings within a few seconds and the screen they are
 * looking at re-reads itself — no refresh, and no polling loop burning reads on a
 * game nobody is editing.
 *
 * The first callback fires immediately with the current document, which is harmless:
 * it applies the same settings the boot sequence already pulled.
 */
export function watchCloudConfig(): () => void {
  const reference = configRef();
  if (!reference) return () => undefined;

  // Only the newest index is applied: parts are fetched asynchronously, and an older
  // read finishing late must not overwrite a newer one.
  let latest = 0;

  return onSnapshot(
    reference,
    (document) => {
      if (!document.exists()) return;
      const ticket = ++latest;
      void readSnapshot(document.data())
        .then((snapshot) => {
          if (!snapshot || ticket !== latest) return;
          // Replace, not merge: the admin's copy is the game's copy. A player's
          // browser holding yesterday's packs has to take today's.
          applySnapshot(snapshot, 'replace');
          announceConfigChange();
        })
        .catch(() => {
          // A malformed or unreadable save must not take the running game down.
        });
    },
    () => {
      // Offline or rules changed underneath us. The settings already loaded stay in
      // place, which is the right outcome — the game keeps playing.
    },
  );
}
