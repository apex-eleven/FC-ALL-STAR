import type { Entity } from '@/types/common';
import type { Wallet, WalletEntry } from '@/features/currencies/types';
import type { DraftProgress } from '@/features/draft/types';
import type { Club } from '@/features/club/types';
import type { LeagueState } from '@/features/league/types';
import type { Squad } from '@/features/squad/types';
import type { TransferProgress } from '@/features/transfers/types';
import type { ShopProgress } from '@/features/shop/types';
import type { ManagerState } from '@/features/manager/types';
import type { MissionProgress } from '@/features/missions/types';
import type { StarPassProgress } from '@/features/starpass/types';
import type { Inventory } from '@/features/items/types';

export type Role = 'player' | 'admin';

/** Result of hashing a password. Never contains the password itself. */
export interface Credential {
  algorithm: 'PBKDF2-SHA-256';
  iterations: number;
  /** Hex encoded. */
  salt: string;
  /** Hex encoded derived key. */
  hash: string;
}

export interface Account extends Entity {
  /** Login ID and display name. Compared case-insensitively, stored as typed. */
  username: string;
  role: Role;
  level: number;
  /** XP earned toward the next level. The requirement is derived, never stored. */
  currentXP: number;
  createdAt: string;
  lastSignInAt: string;
  /** Catalogue id, not a URL — see features/avatars. Repaired on load. */
  avatarId: string;
  /** Balances, one per currency. Repaired on load by normalizeWallet. */
  wallet: Wallet;
  /** Recent balance changes, newest first, capped at LEDGER_LIMIT. */
  ledger: WalletEntry[];
  /** Pity counters per draft event. Repaired on load against the live pity rules. */
  draftProgress: DraftProgress;
  /** Cards pulled from drafts. */
  club: Club;
  /** Starting eleven and bench. Repaired on read against the cards still owned. */
  squad: Squad;
  /**
   * Today's league standing. Absent on accounts created before the league existed —
   * the provider fills it in on first open.
   */
  league?: LeagueState;
  /**
   * Signing-market watch list and sell locks. Absent on accounts created before the
   * market existed, which reads as nothing watched and nothing locked.
   */
  transfer?: TransferProgress;
  /** Shop purchase counts, for limits and first-purchase bonuses. Absent = nothing bought. */
  shop?: ShopProgress;
  /** Manager-mode ladder and weekly wins. Absent until the mode is first played. */
  manager?: ManagerState;
  /** Daily and weekly mission counts and claims. Absent until the first counted action. */
  missions?: MissionProgress;
  /** This season's Star Pass: XP, claims, premium. Absent until the first XP. */
  starpass?: StarPassProgress;
  /** Bag items, item-unlocked avatars, and the star shield switch. Absent until an item arrives. */
  inventory?: Inventory;
  /**
   * The name shown in game, set with a rename item. The login ID (`username`) never
   * changes. Absent = show the username.
   */
  displayName?: string;
}

/** What the store persists. The credential never leaves the auth feature. */
export interface StoredAccount extends Account {
  credential: Credential;
}

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export type AuthError =
  | 'username-too-short'
  | 'username-too-long'
  | 'username-invalid-chars'
  | 'username-taken'
  | 'username-reserved'
  | 'password-too-short'
  | 'password-too-long'
  | 'password-mismatch'
  | 'account-not-found'
  | 'wrong-password'
  | 'admin-code-required'
  | 'admin-code-wrong'
  | 'crypto-unavailable'
  | 'storage-unavailable';

export interface AuthResult {
  ok: boolean;
  error: AuthError | null;
}

/**
 * Persistence seam. Everything above talks to this interface, so moving accounts
 * to a server means writing one new implementation — no component changes.
 *
 * Usernames are keyed case-insensitively; implementations lowercase before lookup.
 */
export interface AccountStore {
  find(username: string): Promise<StoredAccount | null>;
  create(account: StoredAccount): Promise<void>;
  update(account: StoredAccount): Promise<void>;
  remove(username: string): Promise<void>;
  /** Every account in the store. The admin panel is the only caller. */
  list(): Promise<StoredAccount[]>;

  loadSession(): Promise<string | null>;
  saveSession(username: string): Promise<void>;
  clearSession(): Promise<void>;
}
