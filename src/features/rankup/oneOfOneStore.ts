import { normalizeOneOfOneRecord, type OneOfOneRecord, type OneOfOneResult } from './oneOfOne';

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

function write(register: Record<string, OneOfOneRecord>): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(register));
    return true;
  } catch {
    return false;
  }
}

/** Every title held, repaired on read. */
export function listOneOfOneLocal(): OneOfOneRecord[] {
  return Object.entries(read())
    .map(([key, value]) => normalizeOneOfOneRecord(value, key))
    .filter((record): record is OneOfOneRecord => record !== null);
}

/** Admin: puts `record` in the register, replacing whoever held that title. */
export function setOneOfOneLocal(record: OneOfOneRecord): boolean {
  return write({ ...read(), [record.key]: record });
}

/** Admin: frees a title, so the next copy to reach the level wins it. */
export function removeOneOfOneLocal(key: string): boolean {
  const register = read();
  delete register[key];
  return write(register);
}
