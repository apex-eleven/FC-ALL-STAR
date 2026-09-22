import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { PATHS, cloudDb, isCloudEnabled } from './firebase';

/**
 * The home-screen live chat.
 *
 * Its own collection, append only, same shape of rule as the gacha feed (see
 * firestore.rules): a signed-in player adds a row for themselves, nobody edits one,
 * an admin can delete. Name, avatar, level and OVR ride along on each row as a
 * snapshot of the sender at the moment they typed — they are the sender's own claim,
 * not verified by the server, and must never be read as anything more than display.
 */

export const CHAT_PATH = PATHS.chat;

/** How many recent messages the box keeps live. Every row is one read per listener. */
export const CHAT_LIMIT = 40;

/** Kept in step with the size check in firestore.rules. */
export const CHAT_MAX_LENGTH = 120;

export interface ChatMessage {
  id: string;
  uid: string;
  username: string;
  avatarId: string;
  level: number;
  ovr: number;
  text: string;
  /** Milliseconds. Estimated locally until the server stamps the row. */
  at: number;
}

export type ChatDraft = Omit<ChatMessage, 'id' | 'at'>;

function toInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

export async function sendChatMessage(draft: ChatDraft): Promise<boolean> {
  const db = cloudDb();
  if (!db) return false;
  const text = draft.text.trim().slice(0, CHAT_MAX_LENGTH);
  if (!text) return false;
  try {
    await addDoc(collection(db, CHAT_PATH), {
      uid: draft.uid,
      username: draft.username,
      avatarId: draft.avatarId,
      level: toInt(draft.level, 1),
      ovr: toInt(draft.ovr, 0),
      text,
      at: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Live listener, oldest message first. Returns the unsubscribe.
 * `onChange(null)` means the chat is unavailable (cloud off, or the rule missing).
 */
export function watchChat(onChange: (messages: ChatMessage[] | null) => void): () => void {
  if (!isCloudEnabled()) {
    onChange(null);
    return () => undefined;
  }
  const db = cloudDb();
  if (!db) {
    onChange(null);
    return () => undefined;
  }

  return onSnapshot(
    query(collection(db, CHAT_PATH), orderBy('at', 'desc'), limit(CHAT_LIMIT)),
    (snapshot) => {
      const rows = snapshot.docs.flatMap((document) => {
        const data = document.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>;
        if (typeof data.uid !== 'string' || typeof data.text !== 'string') return [];
        const stamp = data.at as Timestamp | null | undefined;
        return [
          {
            id: document.id,
            uid: data.uid,
            username: typeof data.username === 'string' ? data.username : '-',
            avatarId: typeof data.avatarId === 'string' ? data.avatarId : '',
            level: toInt(data.level, 1),
            ovr: toInt(data.ovr, 0),
            text: data.text.slice(0, CHAT_MAX_LENGTH),
            at: stamp && typeof stamp.toMillis === 'function' ? stamp.toMillis() : Date.now(),
          },
        ];
      });
      onChange(rows.reverse());
    },
    () => onChange(null),
  );
}
