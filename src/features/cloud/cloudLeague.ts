import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import type { LeagueRecord } from '@/features/league/types';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * The league table, shared between real players.
 *
 * Each client writes one document — its own — and reads everyone else's. There is no
 * server tick and no matchmaking: every player still resolves their own fixtures
 * locally, and this collection is how those results become a table other people can
 * see. Whoever is playing that day appears in it; whoever is not simply does not.
 *
 * Path: `league/{seasonId}/entries/{uid}`. Keyed by season so yesterday's table is
 * still readable and the reset needs no cleanup job — a new day is a new collection,
 * and Firestore charges nothing for one that is never read again.
 */

export interface LeagueEntry {
  uid: string;
  username: string;
  avatarId: string;
  /** Squad rating, so other players' simulations have something real to play against. */
  rating: number;
  stars: number;
  record: LeagueRecord;
  updatedAt: string;
}

/** Enough to fill a 20-team table several times over without pulling the whole game. */
const MAX_ENTRIES = 100;

function entriesRef(seasonId: string) {
  const db = cloudDb();
  return db ? collection(db, PATHS.league, seasonId, PATHS.leagueEntries) : null;
}

/**
 * Publishes this player's standing.
 *
 * Called after the day's fixtures are resolved, not on a timer: the numbers only
 * change when a match is played, and writing unchanged values would turn an idle tab
 * into a billing line.
 */
export async function publishEntry(seasonId: string, entry: LeagueEntry): Promise<boolean> {
  const db = cloudDb();
  if (!db || !seasonId) return false;

  try {
    await setDoc(doc(db, PATHS.league, seasonId, PATHS.leagueEntries, entry.uid), entry);
    return true;
  } catch {
    // A failed publish costs this player a place in other people's tables for a
    // while. It must never cost them the match they just played, which is already
    // saved on their account.
    return false;
  }
}

/** Reads the table, best first. Returns an empty list when the cloud is off or unreachable. */
export async function fetchEntries(seasonId: string): Promise<LeagueEntry[]> {
  if (!isCloudEnabled() || !seasonId) return [];

  const reference = entriesRef(seasonId);
  if (!reference) return [];

  try {
    const snapshot = await getDocs(
      query(reference, orderBy('stars', 'desc'), limit(MAX_ENTRIES)),
    );

    return snapshot.docs
      .map((entry) => entry.data() as Partial<LeagueEntry>)
      .filter((entry): entry is LeagueEntry => typeof entry.uid === 'string')
      .map((entry) => ({
        ...entry,
        // Repaired the same way everything else read from outside is: a hand-edited
        // document should not be able to put a nonsense row in everyone's table.
        stars: Number.isFinite(entry.stars) ? entry.stars : 0,
        rating: Number.isFinite(entry.rating) ? entry.rating : 0,
      }));
  } catch {
    return [];
  }
}
