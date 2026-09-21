import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { cloudDb, PATHS } from './firebase';

/**
 * Reports of saves the cloud refused, one document per player.
 *
 * Written by the player's own browser when their account save fails, read only by
 * admins. It exists because a failed save used to be a line in the console and
 * nothing else — the game carried on from memory, and the first anyone heard of it
 * was a player asking where their pulls went.
 *
 * The report is a separate, tiny document on purpose: when the account document is
 * the thing Firestore is rejecting, a write to a *different* document with three
 * plain fields still goes through.
 */

export interface SaveErrorReport {
  uid: string;
  username: string;
  /** Firestore's own message, first line, trimmed. */
  message: string;
  /** How many failed saves this player has had since the report was last cleared. */
  count: number;
  /** When the most recent failure was reported. */
  at: Date | null;
}

const MESSAGE_MAX = 300;

/** First line of an error, short enough to sit in a list row. */
export function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0]?.slice(0, MESSAGE_MAX) ?? 'unknown error';
}

/**
 * Files or refreshes this player's report. Never throws and never waits on the game:
 * a reporting failure on top of a save failure must not become a third problem.
 */
export async function reportSaveError(input: {
  uid: string;
  username: string;
  message: string;
  count: number;
}): Promise<void> {
  const db = cloudDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, PATHS.saveErrors, input.uid),
      {
        uid: input.uid,
        username: input.username.slice(0, 40),
        message: input.message.slice(0, MESSAGE_MAX),
        count: input.count,
        at: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Nowhere left to report to. The on-screen bar is still showing.
  }
}

/** Newest first. Admin only — the rules refuse everyone else. */
export async function fetchSaveErrors(max = 100): Promise<SaveErrorReport[]> {
  const db = cloudDb();
  if (!db) return [];
  try {
    const snapshot = await getDocs(
      query(collection(db, PATHS.saveErrors), orderBy('at', 'desc'), limit(max)),
    );
    return snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        uid: typeof data.uid === 'string' ? data.uid : entry.id,
        username: typeof data.username === 'string' ? data.username : '—',
        message: typeof data.message === 'string' ? data.message : '',
        count: typeof data.count === 'number' ? data.count : 1,
        at: data.at instanceof Timestamp ? data.at.toDate() : null,
      };
    });
  } catch {
    return [];
  }
}

/** Clears one player's report once it has been dealt with. */
export async function clearSaveError(uid: string): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, PATHS.saveErrors, uid));
    return true;
  } catch {
    return false;
  }
}
