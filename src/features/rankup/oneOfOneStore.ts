import type { OneOfOneRecord, OneOfOneResult } from './oneOfOne';

/**
 * The 1 OF 1 register for a game with no server: this browser is the whole server,
 * so the first copy to reach a level here holds the title here. With Firebase on,
 * `features/cloud/cloudOneOfOne.ts` is used instead and the register is shared.
 */
const KEY = 'football-home-ui:one-of-one:v1';

function read(): Record<string, OneOfOneRecord> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, OneOfOneRecord>)
      : {};
  } catch {
    return {};
  }
}

export function claimOneOfOneLocal(record: OneOfOneRecord): OneOfOneResult {
  const register = read();
  const holder = register[record.key];
  if (holder) return holder.cardId === record.cardId ? 'won' : 'taken';
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...register, [record.key]: record }));
    return 'won';
  } catch {
    return 'error';
  }
}
