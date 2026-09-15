import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import type { LeaderboardEntry } from '@/features/leaderboard/types';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * The OVR leaderboard, shared between real players.
 *
 * Unlike `cloudLeague`, this collection is not scoped to a season: one document per
 * account, at `leaderboard/{uid}`, replaced whenever that account's starting eleven
 * changes. There is no reset and no rotation — it is a running answer to "who has
 * the strongest eleven right now", not a ladder that plays out over a day.
 */

/** Enough for the leaderboard screen to feel full without pulling every account. */
const MAX_ENTRIES = 100;

function leaderboardRef() {
  const db = cloudDb();
  return db ? collection(db, PATHS.leaderboard) : null;
}

/**
 * Publishes this account's starting eleven.
 *
 * Called from the club screen whenever the squad or its ratings actually change —
 * never on a timer, and never when nothing moved, so an idle tab does not turn into
 * a stream of writes.
 */
export async function publishLeaderboardEntry(entry: LeaderboardEntry): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;

  try {
    await setDoc(doc(db, PATHS.leaderboard, entry.uid), entry);
    return true;
  } catch {
    // A failed publish just leaves this account's old standing in place (or absent)
    // for a while. It must never cost them anything locally — the squad they just
    // built is already saved on their own account regardless.
    return false;
  }
}

/** Reads the table, best OVR first. Returns an empty list when the cloud is off or unreachable. */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!isCloudEnabled()) return [];

  const reference = leaderboardRef();
  if (!reference) return [];

  try {
    const snapshot = await getDocs(query(reference, orderBy('rating', 'desc'), limit(MAX_ENTRIES)));

    return snapshot.docs
      .map((row) => row.data() as Partial<LeaderboardEntry>)
      .filter((row): row is LeaderboardEntry => typeof row.uid === 'string')
      .map((row) => ({
        ...row,
        // Repaired the same way every other cloud read is: a hand-edited document
        // should not be able to put a nonsense row in everyone's table.
        rating: Number.isFinite(row.rating) ? row.rating : 0,
        cards: Array.isArray(row.cards) ? row.cards : [],
      }));
  } catch {
    return [];
  }
}
