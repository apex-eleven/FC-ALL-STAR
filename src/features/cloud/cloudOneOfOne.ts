import { doc, runTransaction } from 'firebase/firestore';
import type { OneOfOneRecord, OneOfOneResult } from '@/features/rankup/oneOfOne';
import { PATHS, cloudDb } from './firebase';

/**
 * Claims a 1 OF 1 title in the shared register, `oneOfOne/{key}`.
 *
 * A transaction, so two players reaching +10 on the same card in the same second
 * cannot both win: Firestore retries the loser's transaction, which then reads the
 * winner's document and comes back `taken`. The rules allow creating a title and
 * nothing else (see firestore.rules), so a title once written stays with its holder.
 *
 * Re-claiming a title this same copy already holds (it fell to +8 and climbed back)
 * answers `won` without writing.
 */
export async function claimOneOfOneCloud(record: OneOfOneRecord): Promise<OneOfOneResult> {
  const db = cloudDb();
  if (!db) return 'error';
  const reference = doc(db, PATHS.oneOfOne, record.key);
  try {
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (snapshot.exists()) {
        const holder = snapshot.data() as Partial<OneOfOneRecord>;
        return holder.cardId === record.cardId && holder.uid === record.uid ? 'won' : 'taken';
      }
      transaction.set(reference, record);
      return 'won';
    });
  } catch (error) {
    console.error('[cloud] 1 OF 1 claim failed', error);
    return 'error';
  }
}
