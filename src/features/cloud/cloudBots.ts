import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { Account } from '@/features/auth/types';
import { normalizeUsername, resolveRole } from '@/features/auth/constants';
import { emptyClub } from '@/features/club/club';
import { startingWallet } from '@/features/currencies/wallet';
import { STARTING_XP } from '@/features/profile/leveling';
import { emptySquad } from '@/features/squad/squad';
import { isFormationId } from '@/features/squad/constants';
import { BOT_LOG_LIMIT, CHAT_LINE_MAX_LENGTH, CHAT_LINES_MAX, defaultBotSettings, emptyStats } from '@/features/bots/constants';
import { emptyDay } from '@/features/bots/schedule';
import {
  BOT_PERSONAS,
  type BotIncome,
  type BotLease,
  type BotPersona,
  type BotProfile,
  type BotSettings,
} from '@/features/bots/types';
import { CURRENCY_ORDER } from '@/features/currencies/constants';
import { PATHS, cloudDb } from './firebase';

/**
 * Bots in Firestore.
 *
 * A bot's account is written to the same three places a signup writes —
 * `accounts/{uid}`, `usernames/{name}` and, once it has a team, `leaderboard/{uid}` —
 * with the same fields, so nothing a player can read tells it apart. Everything that
 * says "this is a bot" is in `bots/{uid}` and `botConfig/*`, which the rules keep
 * admin-only (see firestore.rules).
 *
 * A bot has no Firebase Auth user at all. Nobody can sign in as one; its uid is a
 * random id in the same 28-character shape Auth hands out.
 */

const SETTINGS_DOC = 'settings';
const LEASE_DOC = 'lease';

function db() {
  return cloudDb();
}

/** A uid in the shape Firebase Auth uses: 28 characters of [A-Za-z0-9]. */
export function randomUid(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

// ---------------------------------------------------------------------------
// normalisers — everything read back is repaired, never trusted
// ---------------------------------------------------------------------------

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function lines(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim().slice(0, CHAT_LINE_MAX_LENGTH))
    .filter((line) => line.length > 0)
    .slice(0, CHAT_LINES_MAX);
}

function income(value: unknown, fallback: BotIncome): BotIncome {
  if (typeof value !== 'object' || value === null) return { ...fallback };
  const source = value as Record<string, unknown>;
  const out: BotIncome = {};
  for (const kind of CURRENCY_ORDER) {
    const amount = Math.floor(num(source[kind], 0));
    if (amount > 0) out[kind] = Math.min(100_000_000, amount);
  }
  return out;
}

export function normalizeBotSettings(value: unknown): BotSettings {
  const fallback = defaultBotSettings();
  if (typeof value !== 'object' || value === null) return fallback;
  const source = value as Record<string, unknown>;
  const incomeSource = (source.income ?? {}) as Record<string, unknown>;
  return {
    enabled: source.enabled === true,
    chat: source.chat !== false,
    chatGapMinutes: Math.max(1, Math.min(240, Math.round(num(source.chatGapMinutes, fallback.chatGapMinutes)))),
    chatLines: lines(source.chatLines, fallback.chatLines),
    pullLines: lines(source.pullLines, fallback.pullLines),
    rankupLines: lines(source.rankupLines, fallback.rankupLines),
    winLines: lines(source.winLines, fallback.winLines),
    promoteLines: lines(source.promoteLines, fallback.promoteLines),
    oneOfOne: source.oneOfOne === true,
    income: Object.fromEntries(
      BOT_PERSONAS.map((persona) => [
        persona,
        incomeSource[persona] === undefined ? { ...fallback.income[persona] } : income(incomeSource[persona], {}),
      ]),
    ) as Record<BotPersona, BotIncome>,
  };
}

function isPersona(value: unknown): value is BotPersona {
  return typeof value === 'string' && (BOT_PERSONAS as readonly string[]).includes(value);
}

export function normalizeBotProfile(uid: string, value: unknown): BotProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  const username = text(source.username);
  if (!username) return null;
  const now = new Date();
  const today = (source.today ?? {}) as Record<string, unknown>;
  const stats = (source.stats ?? {}) as Record<string, unknown>;
  const base = emptyStats();
  return {
    uid,
    username,
    persona: isPersona(source.persona) ? source.persona : 'regular',
    enabled: source.enabled !== false,
    createdAt: text(source.createdAt, now.toISOString()),
    createdBy: text(source.createdBy),
    activeFrom: Math.max(0, Math.min(23.75, num(source.activeFrom, 10))),
    activeTo: Math.max(1, Math.min(47, num(source.activeTo, 24))),
    formation: isFormationId(source.formation) ? source.formation : '4-3-3-attack',
    nextActionAt: text(source.nextActionAt, now.toISOString()),
    sessionLeft: Math.max(0, Math.floor(num(source.sessionLeft, 0))),
    lastActiveAt: text(source.lastActiveAt),
    today: {
      ...emptyDay(now),
      day: text(today.day, emptyDay(now).day),
      packs: num(today.packs, 0),
      matches: num(today.matches, 0),
      rankups: num(today.rankups, 0),
      cups: num(today.cups, 0),
      chats: num(today.chats, 0),
      paid: today.paid === true,
    },
    stats: Object.fromEntries(
      Object.keys(base).map((key) => [key, Math.max(0, Math.floor(num(stats[key], 0)))]),
    ) as unknown as BotProfile['stats'],
    log: Array.isArray(source.log)
      ? (source.log as unknown[])
          .filter((row): row is { at: string; text: string } => {
            const entry = row as Record<string, unknown>;
            return typeof entry?.at === 'string' && typeof entry?.text === 'string';
          })
          .slice(0, BOT_LOG_LIMIT)
      : [],
    boardSig: text(source.boardSig),
    ovr: Math.max(0, Math.round(num(source.ovr, 0))),
    rank: text(source.rank),
  };
}

// ---------------------------------------------------------------------------
// live views for the admin panel and the runner
// ---------------------------------------------------------------------------

/** Every bot, live. `null` means the collection cannot be read (not an admin, or rules missing). */
export function watchBots(onChange: (bots: BotProfile[] | null) => void): () => void {
  const database = db();
  if (!database) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(
    collection(database, PATHS.bots),
    (snapshot) => {
      const bots = snapshot.docs
        .map((entry) => normalizeBotProfile(entry.id, entry.data()))
        .filter((entry): entry is BotProfile => entry !== null)
        .sort((a, b) => a.username.localeCompare(b.username));
      onChange(bots);
    },
    () => onChange(null),
  );
}

export function watchBotSettings(onChange: (settings: BotSettings | null) => void): () => void {
  const database = db();
  if (!database) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(database, PATHS.botConfig, SETTINGS_DOC),
    (snapshot) => onChange(normalizeBotSettings(snapshot.exists() ? snapshot.data() : undefined)),
    () => onChange(null),
  );
}

export async function saveBotSettings(settings: BotSettings): Promise<boolean> {
  const database = db();
  if (!database) return false;
  try {
    await setDoc(doc(database, PATHS.botConfig, SETTINGS_DOC), normalizeBotSettings(settings));
    return true;
  } catch (error) {
    console.error('[bots] บันทึกตั้งค่าบอทไม่สำเร็จ', error);
    return false;
  }
}

export async function saveBotProfile(profile: BotProfile): Promise<boolean> {
  const database = db();
  if (!database) return false;
  try {
    await setDoc(doc(database, PATHS.bots, profile.uid), profile);
    return true;
  } catch (error) {
    console.error('[bots] บันทึกสถานะบอทไม่สำเร็จ', error);
    return false;
  }
}

export async function patchBotProfile(uid: string, changes: Partial<BotProfile>): Promise<boolean> {
  const database = db();
  if (!database) return false;
  try {
    await updateDoc(doc(database, PATHS.bots, uid), changes);
    return true;
  } catch (error) {
    console.error('[bots] แก้สถานะบอทไม่สำเร็จ', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// create / delete
// ---------------------------------------------------------------------------

export interface CreateBotInput {
  username: string;
  persona: BotPersona;
  level: number;
  avatarId: string;
  /** How long ago the account claims to have been made. */
  createdAt: Date;
  activeFrom: number;
  activeTo: number;
  formation: BotProfile['formation'];
  /** First action — a random point soon, so a batch does not all start together. */
  firstActionAt: Date;
  createdBy: string;
}

export type CreateBotResult = { ok: true; uid: string } | { ok: false; error: 'taken' | 'failed' | 'offline' };

/**
 * Writes a new bot: the account a signup would write, the username claim, and the
 * admin-only profile. The account goes first — a profile without an account would
 * leave the runner chasing an id that does not exist.
 */
export async function createBot(input: CreateBotInput): Promise<CreateBotResult> {
  const database = db();
  if (!database) return { ok: false, error: 'offline' };

  const username = input.username.trim();
  const key = normalizeUsername(username);

  try {
    const claim = await getDoc(doc(database, PATHS.usernames, key));
    if (claim.exists()) return { ok: false, error: 'taken' };

    const uid = randomUid();
    const created = input.createdAt.toISOString();
    // Exactly the fields CloudAuthProvider.signUp writes, nothing more.
    const account: Account = {
      id: uid,
      username,
      role: resolveRole(username),
      level: input.level,
      currentXP: STARTING_XP,
      createdAt: created,
      lastSignInAt: created,
      avatarId: input.avatarId,
      wallet: startingWallet(),
      ledger: [],
      draftProgress: {},
      club: emptyClub(),
      squad: emptySquad(),
    };
    await setDoc(doc(database, PATHS.accounts, uid), { ...account, updatedAt: serverTimestamp() });
    await setDoc(doc(database, PATHS.usernames, key), { uid, username });

    const now = new Date();
    const profile: BotProfile = {
      uid,
      username,
      persona: input.persona,
      enabled: true,
      createdAt: now.toISOString(),
      createdBy: input.createdBy,
      activeFrom: input.activeFrom,
      activeTo: input.activeTo,
      formation: input.formation,
      nextActionAt: input.firstActionAt.toISOString(),
      sessionLeft: 0,
      lastActiveAt: '',
      today: emptyDay(now),
      stats: emptyStats(),
      log: [{ at: now.toISOString(), text: `สร้างโดย ${input.createdBy || 'แอดมิน'}` }],
      boardSig: '',
      ovr: 0,
      rank: '',
    };
    await setDoc(doc(database, PATHS.bots, uid), profile);
    return { ok: true, uid };
  } catch (error) {
    console.error('[bots] สร้างบอทไม่สำเร็จ', error);
    return { ok: false, error: 'failed' };
  }
}

/**
 * Removes a bot everywhere it shows: its leaderboard row, its name, its save, and
 * its profile. Chat lines it already sent stay, the way a deleted player's do.
 */
export async function deleteBot(profile: Pick<BotProfile, 'uid' | 'username'>): Promise<boolean> {
  const database = db();
  if (!database) return false;
  try {
    await deleteDoc(doc(database, PATHS.leaderboard, profile.uid));
    await deleteDoc(doc(database, PATHS.usernames, normalizeUsername(profile.username)));
    await deleteDoc(doc(database, PATHS.accounts, profile.uid));
    await deleteDoc(doc(database, PATHS.bots, profile.uid));
    return true;
  } catch (error) {
    console.error('[bots] ลบบอทไม่สำเร็จ', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// the runner lease — one browser drives the bots at a time
// ---------------------------------------------------------------------------

function normalizeLease(value: unknown): BotLease | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  const holder = text(source.holder);
  if (!holder) return null;
  return { holder, label: text(source.label), until: num(source.until, 0) };
}

/**
 * Takes or renews the lease. True when this holder owns it afterwards.
 *
 * Two admins with the game open would otherwise both play every bot, and each bot
 * would do everything twice. The lease is a plain expiry time: whoever holds it keeps
 * renewing; if that browser closes, it lapses and the next one takes over.
 */
export async function claimLease(holder: string, label: string, ttlMs: number): Promise<boolean> {
  const database = db();
  if (!database) return false;
  const reference = doc(database, PATHS.botConfig, LEASE_DOC);
  try {
    return await runTransaction(database, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = normalizeLease(snapshot.exists() ? snapshot.data() : undefined);
      const now = Date.now();
      if (current && current.holder !== holder && current.until > now) return false;
      transaction.set(reference, { holder, label, until: now + ttlMs });
      return true;
    });
  } catch {
    return false;
  }
}

export async function releaseLease(holder: string): Promise<void> {
  const database = db();
  if (!database) return;
  const reference = doc(database, PATHS.botConfig, LEASE_DOC);
  try {
    await runTransaction(database, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = normalizeLease(snapshot.exists() ? snapshot.data() : undefined);
      if (current?.holder === holder) transaction.set(reference, { holder: '', label: '', until: 0 });
    });
  } catch {
    // A lease that is not released simply expires.
  }
}

export function watchLease(onChange: (lease: BotLease | null) => void): () => void {
  const database = db();
  if (!database) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(database, PATHS.botConfig, LEASE_DOC),
    (snapshot) => onChange(normalizeLease(snapshot.exists() ? snapshot.data() : undefined)),
    () => onChange(null),
  );
}
