import { collection, deleteDoc, doc, getDocs, runTransaction, setDoc } from 'firebase/firestore';
import {
  normalizeOneOfOneRecord,
  type OneOfOneRecord,
  type OneOfOneResult,
} from '@/features/rankup/oneOfOne';
import { PATHS, cloudDb } from './firebase';

/**
 * Claims a 1 OF 1 title in the shared register, `oneOfOne/{key}`.
 *
 * A transaction, so two players reaching +10 on the same card in the same second
 * cannot both win: Firestore retries the loser's transaction, which then reads the
 * winner's document and comes back `taken`. The rules let a player create a title and
 * nothing else (see firestore.rules); moving or withdrawing one is admin-only.
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

/** Every title held. Null when the register could not be read. */
export async function listOneOfOneCloud(): Promise<OneOfOneRecord[] | null> {
  const db = cloudDb();
  if (!db) return null;
  try {
    const snapshot = await getDocs(collection(db, PATHS.oneOfOne));
    return snapshot.docs
      .map((entry) => normalizeOneOfOneRecord(entry.data(), entry.id))
      .filter((record): record is OneOfOneRecord => record !== null);
  } catch (error) {
    console.error('[cloud] 1 OF 1 list failed', error);
    return null;
  }
}

/** Admin: writes `record` over whoever held that title. */
export async function setOneOfOneCloud(record: OneOfOneRecord): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;
  try {
    await setDoc(doc(db, PATHS.oneOfOne, record.key), record);
    return true;
  } catch (error) {
    console.error('[cloud] 1 OF 1 grant failed', error);
    return false;
  }
}

/** Admin: frees a title. */
export async function removeOneOfOneCloud(key: string): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, PATHS.oneOfOne, key));
    return true;
  } catch (error) {
    console.error('[cloud] 1 OF 1 revoke failed', error);
    return false;
  }
}
