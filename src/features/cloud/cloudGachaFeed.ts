import { addDoc, collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import type { GachaRarity } from '@/features/gacha/types';
import { GACHA_RARITIES } from '@/features/gacha/types';
import { cloudDb, isCloudEnabled } from './firebase';

/**
 * The public winners feed: "who just won what".
 *
 * Its own collection, append only. The rule (see firestore.rules) lets a signed-in
 * player add a row for themselves and nobody edit or delete one, so a feed row is a
 * claim about a spin and nothing more — it grants nothing, and a faked row costs its
 * author nothing but a line in a list.
 */

export const GACHA_FEED_PATH = 'gachaFeed';
const FEED_LIMIT = 20;

export interface GachaFeedRow {
  uid: string;
  username: string;
  avatarId: string;
  prize: string;
  rarity: GachaRarity;
  at: string;
}

export async function publishGachaWin(row: GachaFeedRow): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;
  try {
    await addDoc(collection(db, GACHA_FEED_PATH), row);
    return true;
  } catch {
    // A failed publish only means this win is missing from the feed.
    return false;
  }
}

/** Newest wins first. Empty when the cloud is off or the rule is not in place yet. */
export async function fetchGachaFeed(): Promise<GachaFeedRow[]> {
  if (!isCloudEnabled()) return [];
  const db = cloudDb();
  if (!db) return [];

  try {
    const snapshot = await getDocs(
      query(collection(db, GACHA_FEED_PATH), orderBy('at', 'desc'), limit(FEED_LIMIT)),
    );
    return snapshot.docs.flatMap((document) => {
      const data = document.data() as Record<string, unknown>;
      if (typeof data.uid !== 'string' || typeof data.at !== 'string') return [];
      return [
        {
          uid: data.uid,
          username: typeof data.username === 'string' ? data.username : '-',
          avatarId: typeof data.avatarId === 'string' ? data.avatarId : '',
          prize: typeof data.prize === 'string' ? data.prize : '-',
          rarity: GACHA_RARITIES.includes(data.rarity as GachaRarity)
            ? (data.rarity as GachaRarity)
            : 'common',
          at: data.at,
        },
      ];
    });
  } catch {
    return [];
  }
}
