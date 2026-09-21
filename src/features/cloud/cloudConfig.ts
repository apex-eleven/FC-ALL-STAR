import { doc, getDoc, onSnapshot, setDoc, type DocumentData } from 'firebase/firestore';
import {
  announceConfigChange,
  applySnapshotDetailed,
  collectSnapshot,
  isSnapshot,
  type ApplyResult,
  type Snapshot,
} from '@/features/backup/backup';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * Game settings, shared by everyone through Firestore.
 *
 * This is the difference between "the admin edits their own browser" and "the admin
 * edits the game". The card catalogue, packs, draft rates, cup tuning, banners,
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

export type ConfigPushState =
  | 'saved'
  | 'too-large'
  | 'denied'
  | 'unavailable'
  | 'failed'
  /** Someone else saved since this browser last synced. Pushing would undo their work. */
  | 'stale'
  /** This browser holds less than the cloud does. Pushing would delete what it lacks. */
  | 'would-shrink';

/**
 * Which cloud save this browser is built on — set when it pulls one in full or
 * pushes one. A push only goes ahead without asking when the cloud is still on that
 * save; otherwise this browser is behind and its copy would overwrite newer work.
 */
const BASE_KEY = 'football-home-ui:config-base:v1';

function readBase(): string | null {
  try {
    return window.localStorage.getItem(BASE_KEY);
  } catch {
    return null;
  }
}

function writeBase(savedAt: string): void {
  try {
    window.localStorage.setItem(BASE_KEY, savedAt);
  } catch {
    // Out of room. The guard then falls back to comparing sizes.
  }
}

/** Why the last push was held back, for the panel to explain. */
export interface PushGuard {
  cloudEntries: number | null;
  cloudChars: number | null;
  cloudSavedAt: string | null;
  localEntries: number;
  localChars: number;
}

let lastGuard: PushGuard | null = null;
export function lastPushGuard(): PushGuard | null {
  return lastGuard;
}

/** Size of what the last push sent, in characters. Shown beside the push result. */
let lastPushChars = 0;
export function lastPushSize(): number {
  return lastPushChars;
}

function configRef() {
  const db = cloudDb();
  return db ? doc(db, PATHS.config, PATHS.configDoc) : null;
}

function partRef(index: number) {
  const db = cloudDb();
  return db ? doc(db, PATHS.config, `${PATHS.configDoc}-part-${index}`) : null;
}

/**
 * Writes the current browser's settings to the cloud. Admin only, by rule.
 *
 * Without `force`, it first checks it is not about to destroy something. This used
 * to be unconditional, and the admin panel called it on every close — so opening and
 * closing the panel in a browser that had only the four-entry fallback from the repo
 * replaced the whole game's settings (packs, catalogue, cup, fusion, every picture)
 * with that fallback, for every player. `force` is for an admin who has been shown
 * the numbers and means it.
 */
export async function pushConfigToCloud(options: { force?: boolean } = {}): Promise<ConfigPushState> {
  const reference = configRef();
  if (!reference) return 'unavailable';

  // Accounts are never part of this: the config documents are world-readable so
  // that the sign-in screen can load the game before anyone has logged in.
  const snapshot = collectSnapshot(false);
  const payload = JSON.stringify(snapshot);
  lastPushChars = payload.length;
  const localEntries = Object.keys(snapshot.entries).length;

  if (!options.force) {
    try {
      const current = await getDoc(reference);
      if (current.exists()) {
        const data = current.data();
        const cloudSavedAt = typeof data.savedAt === 'string' ? data.savedAt : null;
        const cloudEntries = typeof data.entries === 'number' ? data.entries : null;
        const cloudChars = typeof data.chars === 'number' ? data.chars : null;
        const cloudParts = typeof data.parts === 'number' ? data.parts : 0;
        lastGuard = { cloudEntries, cloudChars, cloudSavedAt, localEntries, localChars: payload.length };

        const base = readBase();
        // Behind: this browser last synced with an older save than the cloud has.
        if (base && cloudSavedAt && cloudSavedAt !== base) return 'stale';
        // No record of syncing (a browser from before this check existed): fall back
        // to size. Fewer entries, or fewer parts on an index too old to count them.
        if (!base) {
          const localParts = Math.ceil(payload.length / PART_CHARS);
          const smaller = cloudEntries !== null ? localEntries < cloudEntries : localParts < cloudParts;
          if (smaller) return 'would-shrink';
        }
      }
    } catch {
      // Cannot see the cloud copy. The write below will fail the same way if the
      // cloud is really unreachable, and succeed if only this read was refused.
    }
  }
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
    // Entry count and size ride on the index so the next push can compare against
    // them without fetching every part.
    await setDoc(reference, {
      parts: parts.length,
      savedAt: snapshot.savedAt,
      entries: localEntries,
      chars: payload.length,
    });
    writeBase(snapshot.savedAt);
    lastGuard = null;
    return 'saved';
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    return code === 'permission-denied' ? 'denied' : 'failed';
  }
}

type ReadOutcome = { snapshot: Snapshot; chars: number } | { error: string };

/**
 * The settings a `config/admin` document points at, or why they could not be put
 * together. The reason used to be thrown away, which is how a browser could sit on
 * stale packs indefinitely with nothing anywhere saying so.
 */
async function readSnapshot(index: DocumentData): Promise<ReadOutcome> {
  let raw: string;
  if (typeof index.snapshot === 'string') {
    // Saved before parts existed.
    raw = index.snapshot;
  } else {
    const count = typeof index.parts === 'number' ? Math.floor(index.parts) : 0;
    if (count <= 0 || count > MAX_PARTS) return { error: `จำนวนส่วนไม่ถูกต้อง (${String(index.parts)})` };
    const pieces: string[] = [];
    for (let part = 0; part < count; part += 1) {
      const target = partRef(part);
      if (!target) return { error: 'ยังไม่ได้เชื่อม Firebase' };
      const document = await getDoc(target);
      const data = document.exists() ? document.data() : null;
      // A part from a different save means a newer write is under way; its index
      // update will arrive and be read then.
      if (!data) return { error: `หาส่วนที่ ${part + 1}/${count} ไม่เจอ` };
      if (data.savedAt !== index.savedAt) {
        return { error: `ส่วนที่ ${part + 1}/${count} มาจากการบันทึกคนละครั้ง (กำลังบันทึกใหม่อยู่?)` };
      }
      if (typeof data.data !== 'string') return { error: `ส่วนที่ ${part + 1}/${count} ข้อมูลเสีย` };
      pieces.push(data.data);
    }
    raw = pieces.join('');
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed)
      ? { snapshot: parsed as Snapshot, chars: raw.length }
      : { error: 'รูปแบบข้อมูลไม่ใช่ไฟล์ตั้งค่าของเกม' };
  } catch {
    return { error: 'แกะข้อมูลไม่ได้ (JSON เสีย)' };
  }
}

/** What the latest pull from the cloud did — shown in the admin panel's backup tab. */
export type PullResult =
  | { state: 'disabled' }
  | { state: 'no-config' }
  | { state: 'read-failed'; reason: string }
  | ({ state: 'applied'; chars: number; at: string } & ApplyResult);

let lastPull: PullResult | null = null;

/** The outcome of the most recent pull this session, boot or live update. */
export function lastPullResult(): PullResult | null {
  return lastPull;
}

function applyRead(outcome: ReadOutcome): PullResult {
  if ('error' in outcome) return { state: 'read-failed', reason: outcome.error };
  const applied = applySnapshotDetailed(outcome.snapshot, 'replace');
  const result: PullResult = {
    state: 'applied',
    chars: outcome.chars,
    at: outcome.snapshot.savedAt,
    ...applied,
  };
  if (applied.skipped.length > 0) {
    console.warn('[cloud] พื้นที่เก็บในเบราว์เซอร์ไม่พอ ข้ามค่าตั้งบางรายการ', applied.skipped);
  } else {
    // Complete: this browser now holds exactly that save.
    writeBase(outcome.snapshot.savedAt);
  }
  return result;
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
export async function pullConfigFromCloud(): Promise<PullResult> {
  if (!isCloudEnabled()) return (lastPull = { state: 'disabled' });

  const reference = configRef();
  if (!reference) return (lastPull = { state: 'disabled' });

  try {
    const document = await getDoc(reference);
    if (!document.exists()) return (lastPull = { state: 'no-config' });
    lastPull = applyRead(await readSnapshot(document.data()));
  } catch (error) {
    // Offline, blocked, or rules misconfigured. The committed JSON already ran, so
    // the game has settings either way — but the admin panel now says why.
    lastPull = {
      state: 'read-failed',
      reason: error instanceof Error ? error.message.split('\n')[0] ?? 'unknown' : String(error),
    };
  }
  if (lastPull.state === 'read-failed') console.warn('[cloud] ดึงตั้งค่าจากคลาวด์ไม่สำเร็จ', lastPull.reason);
  return lastPull;
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
        .then((outcome) => {
          if (ticket !== latest) return;
          // Replace, not merge: the admin's copy is the game's copy. A player's
          // browser holding yesterday's packs has to take today's.
          lastPull = applyRead(outcome);
          if (lastPull.state === 'applied' && lastPull.applied > 0) announceConfigChange();
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
