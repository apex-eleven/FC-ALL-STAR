import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { avatarCatalogue } from '@/data/mock/avatars';
import { normalizeAvatarId } from '@/features/avatars/unlocks';
import { DEFAULT_AVATAR_ID } from '@/features/avatars/constants';
import { normalizeWallet, startingWallet } from '@/features/currencies/wallet';
import { emptyClub, normalizeClub } from '@/features/club/club';
import { withoutLegacy } from '@/features/club/legacy';
import { emptySquad, indexOwned, normalizeSquad } from '@/features/squad/squad';
import { normalizeProgress } from '@/features/transfers/transferConfigStore';
import { normalizeProgress as normalizeShopProgress } from '@/features/shop/shopConfigStore';
import { awardXP, STARTING_LEVEL, STARTING_XP } from '@/features/profile/leveling';
import {
  ADMIN_SIGNUP_CODE,
  checkPassword,
  checkUsername,
  isAdminUsername,
  resolveRole,
} from './constants';
import { CryptoUnavailableError, hashPassword, verifyPassword } from './crypto';
import { localAccountStore } from './localAccountStore';
import { isCloudEnabled } from '@/features/cloud/firebase';
import { CloudAuthProvider } from '@/features/cloud/CloudAuthProvider';
import type { Account, AccountStore, AuthResult, AuthStatus, StoredAccount } from './types';

export interface SignUpInput {
  username: string;
  password: string;
  confirmPassword: string;
  adminCode?: string;
}

export interface AuthValue {
  status: AuthStatus;
  account: Account | null;
  isAdmin: boolean;
  signUp(input: SignUpInput): Promise<AuthResult>;
  signIn(username: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  addXP(amount: number): void;
  /** Stores the chosen avatar id. Unlock checking is the caller's job. */
  setAvatar(avatarId: string): void;

  /**
   * Applies a change to the signed-in account and persists it. The mutator must be
   * pure — it may be called more than once under StrictMode.
   */
  updateAccount(mutate: (account: Account) => Account): void;
  /**
   * Same, for any account in the store. Admin only; the caller is responsible for
   * checking isAdmin, and so is the server that will eventually own this.
   */
  updateOther(username: string, mutate: (account: Account) => Account): Promise<boolean>;
  /** Every account in this browser, credentials stripped. */
  listAccounts(): Promise<Account[]>;
}

/**
 * Exported so the cloud provider can fill the same context.
 *
 * Both providers hand down an identical `AuthValue`, which is what lets every screen
 * in the game stay unaware of whether the save lives in this browser or in Firestore.
 */
export const AuthContext = createContext<AuthValue | null>(null);

const OK: AuthResult = { ok: true, error: null };

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Strips the credential before anything outside this feature sees the account, and
 * repairs fields that older records predate.
 */
function toPublic(stored: StoredAccount): Account {
  const { credential: _credential, ...account } = stored;
  // The placeholder pool cards are stripped on the way out, so no screen ever has to
  // know they existed. normalizeSquad then drops any slot that pointed at one.
  const club = { players: withoutLegacy(normalizeClub(account.club).players) };
  return {
    ...account,
    avatarId: normalizeAvatarId(account.avatarId, avatarCatalogue),
    wallet: normalizeWallet(account.wallet),
    ledger: account.ledger ?? [],
    // Pity counters are repaired against live rules where they are read, in
    // useDraftRun — the catalogue is not available this deep in the auth feature.
    draftProgress:
      typeof account.draftProgress === 'object' && account.draftProgress !== null
        ? account.draftProgress
        : {},
    club,
    squad: normalizeSquad(account.squad, indexOwned(club.players)),
    ...(account.transfer === undefined
      ? {}
      : {
          transfer: normalizeProgress(
            account.transfer,
            new Set(club.players.map((card) => card.id)),
          ),
        }),
    ...(account.shop === undefined ? {} : { shop: normalizeShopProgress(account.shop) }),
  };
}

export interface AuthProviderProps {
  children: ReactNode;
  /** Injectable so tests and a future server build can swap persistence. */
  store?: AccountStore;
}

/**
 * Picks the persistence layer once, at mount.
 *
 * A component boundary rather than a branch inside one provider: the two
 * implementations have different hooks in different orders, and React does not allow
 * that inside a single component. Splitting them also means the local path — the one
 * that has been working all along — is not touched by the cloud work at all.
 */
export function AuthProvider({ children, store }: AuthProviderProps) {
  if (isCloudEnabled()) return <CloudAuthProvider>{children}</CloudAuthProvider>;
  return <LocalAuthProvider store={store}>{children}</LocalAuthProvider>;
}

export function LocalAuthProvider({ children, store = localAccountStore }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const username = await storeRef.current.loadSession();
      const stored = username ? await storeRef.current.find(username) : null;
      if (cancelled) return;

      setAccount(stored ? toPublic(stored) : null);
      setStatus(stored ? 'signed-in' : 'signed-out');
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<AuthResult> => {
    const usernameError = checkUsername(input.username);
    if (usernameError) return { ok: false, error: usernameError };

    const passwordError = checkPassword(input.password);
    if (passwordError) return { ok: false, error: passwordError };

    if (input.password !== input.confirmPassword) {
      return { ok: false, error: 'password-mismatch' };
    }

    const username = input.username.trim();

    if (isAdminUsername(username)) {
      if (!input.adminCode) return { ok: false, error: 'admin-code-required' };
      if (input.adminCode.trim() !== ADMIN_SIGNUP_CODE) {
        return { ok: false, error: 'admin-code-wrong' };
      }
    }

    const existing = await storeRef.current.find(username);
    if (existing) return { ok: false, error: 'username-taken' };

    let credential;
    try {
      credential = await hashPassword(input.password);
    } catch (error) {
      if (error instanceof CryptoUnavailableError) {
        return { ok: false, error: 'crypto-unavailable' };
      }
      throw error;
    }

    const now = new Date().toISOString();
    const created: StoredAccount = {
      id: createId(),
      username,
      role: resolveRole(username),
      level: STARTING_LEVEL,
      currentXP: STARTING_XP,
      createdAt: now,
      lastSignInAt: now,
      avatarId: DEFAULT_AVATAR_ID,
      wallet: startingWallet(),
      ledger: [],
      draftProgress: {},
      club: emptyClub(),
      squad: emptySquad(),
      credential,
    };

    await storeRef.current.create(created);
    await storeRef.current.saveSession(username);
    setAccount(toPublic(created));
    setStatus('signed-in');
    return OK;
  }, []);

  const signIn = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    const stored = await storeRef.current.find(username);
    // Deliberately distinct from 'wrong-password' — with no server there is no
    // account enumeration to protect against, and the clearer message helps more.
    if (!stored) return { ok: false, error: 'account-not-found' };

    let matches: boolean;
    try {
      matches = await verifyPassword(password, stored.credential);
    } catch (error) {
      if (error instanceof CryptoUnavailableError) {
        return { ok: false, error: 'crypto-unavailable' };
      }
      throw error;
    }

    if (!matches) return { ok: false, error: 'wrong-password' };

    // Role is re-resolved on every sign-in, so editing ADMIN_USERNAMES takes effect
    // for accounts that already exist.
    const next: StoredAccount = {
      ...stored,
      role: resolveRole(stored.username),
      lastSignInAt: new Date().toISOString(),
    };

    await storeRef.current.update(next);
    await storeRef.current.saveSession(next.username);
    setAccount(toPublic(next));
    setStatus('signed-in');
    return OK;
  }, []);

  const signOut = useCallback(async () => {
    await storeRef.current.clearSession();
    setAccount(null);
    setStatus('signed-out');
  }, []);

  const persist = useCallback(async (next: Account) => {
    const stored = await storeRef.current.find(next.username);
    if (stored) await storeRef.current.update({ ...stored, ...next });
  }, []);

  const updateAccount = useCallback(
    (mutate: (account: Account) => Account) => {
      setAccount((current) => {
        if (!current) return current;
        const next = mutate(current);
        if (next === current) return current;
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateOther = useCallback(
    async (username: string, mutate: (account: Account) => Account) => {
      const stored = await storeRef.current.find(username);
      if (!stored) return false;

      const next = mutate(toPublic(stored));
      await storeRef.current.update({ ...stored, ...next });

      // Keep the live session in step when an admin edits their own account.
      setAccount((current) =>
        current && current.username.toLowerCase() === username.toLowerCase() ? next : current,
      );
      return true;
    },
    [],
  );

  const listAccounts = useCallback(async () => {
    return (await storeRef.current.list()).map(toPublic);
  }, []);

  const addXP = useCallback(
    (amount: number) => {
      updateAccount((current) => {
        const { level, currentXP } = awardXP(
          { level: current.level, currentXP: current.currentXP },
          amount,
        );
        return { ...current, level, currentXP };
      });
    },
    [updateAccount],
  );

  const setAvatar = useCallback(
    (avatarId: string) => updateAccount((current) => ({ ...current, avatarId })),
    [updateAccount],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      account,
      isAdmin: account?.role === 'admin',
      signUp,
      signIn,
      signOut,
      addXP,
      setAvatar,
      updateAccount,
      updateOther,
      listAccounts,
    }),
    [
      status,
      account,
      signUp,
      signIn,
      signOut,
      addXP,
      setAvatar,
      updateAccount,
      updateOther,
      listAccounts,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}

/** For screens that only render when signed in. */
export function useAccount(): Account {
  const { account } = useAuth();
  if (!account) throw new Error('useAccount used while signed out');
  return account;
}

/** Gate admin-only UI on this. Remember it is a UI gate, not a security boundary. */
export function useIsAdmin(): boolean {
  return useAuth().isAdmin;
}
