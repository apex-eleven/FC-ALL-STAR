import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * Manager-mode ranks, shared between real players.
 *
 * Stored on the same `leaderboard/{uid}` document the OVR table uses — written with
 * `merge`, so the rank and the published eleven sit side by side and neither write
 * wipes the other. No new collection, so no new security rule.
 */

const MAX_ENTRIES = 100;

/** What one account publishes about its manager rank. */
export interface ManagerRankRecord {
  uid: string;
  username: string;
  avatarId: string;
  /** Tier id, so the row still finds its trophy if the admin reorders the ladder. */
  tierId: string;
  /** Tier index at publish time — the fallback when the id is gone. */
  tier: number;
  stars: number;
  season: number;
  updatedAt: string;
}

export interface ManagerLadderRow extends ManagerRankRecord {
  /** Squad OVR from the same document, when the account has published one. */
  rating: number;
}

/** One number that sorts the ladder: tier first, then stars. */
export function ladderScore(tier: number, stars: number): number {
  return tier * 100_000 + Math.min(stars, 99_999);
}

export async function publishManagerRank(record: ManagerRankRecord): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;
  try {
    await setDoc(
      doc(db, PATHS.leaderboard, record.uid),
      {
        uid: record.uid,
        username: record.username,
        avatarId: record.avatarId,
        manager: {
          tierId: record.tierId,
          tier: record.tier,
          stars: record.stars,
          season: record.season,
          updatedAt: record.updatedAt,
        },
        managerScore: ladderScore(record.tier, record.stars),
      },
      { merge: true },
    );
    return true;
  } catch {
    // A failed publish only leaves this account's old rank showing to others.
    return false;
  }
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Highest rank first. Accounts that never played manager mode are not in it. */
export async function fetchManagerLadder(): Promise<ManagerLadderRow[]> {
  if (!isCloudEnabled()) return [];
  const db = cloudDb();
  if (!db) return [];

  try {
    const snapshot = await getDocs(
      query(collection(db, PATHS.leaderboard), orderBy('managerScore', 'desc'), limit(MAX_ENTRIES)),
    );
    return snapshot.docs.flatMap((row) => {
      const data = row.data() as Record<string, unknown>;
      const manager = (data.manager ?? {}) as Record<string, unknown>;
      if (typeof data.uid !== 'string') return [];
      return [
        {
          uid: data.uid,
          username: typeof data.username === 'string' ? data.username : '-',
          avatarId: typeof data.avatarId === 'string' ? data.avatarId : '',
          rating: num(data.rating),
          tierId: typeof manager.tierId === 'string' ? manager.tierId : '',
          tier: Math.max(0, Math.round(num(manager.tier))),
          stars: Math.max(0, Math.round(num(manager.stars))),
          season: Math.round(num(manager.season, -1)),
          updatedAt: typeof manager.updatedAt === 'string' ? manager.updatedAt : '',
        },
      ];
    });
  } catch {
    return [];
  }
}
