import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { avatarCatalogue } from '@/data/mock/avatars';
import { DEFAULT_AVATAR_ID } from '@/features/avatars/constants';
import { emptyClub, normalizeClub } from '@/features/club/club';
import { withoutLegacy } from '@/features/club/legacy';
import { normalizeWallet, startingWallet } from '@/features/currencies/wallet';
import { awardXP, STARTING_LEVEL, STARTING_XP } from '@/features/profile/leveling';
import { emptySquad, indexOwned, normalizeSquad } from '@/features/squad/squad';
import {
  ADMIN_SIGNUP_CODE,
  checkPassword,
  checkUsername,
  isAdminUsername,
  normalizeUsername,
  resolveRole,
} from '@/features/auth/constants';
import type { Account, AuthResult, AuthStatus } from '@/features/auth/types';
import { AuthContext, type AuthValue, type SignUpInput } from '@/features/auth/AuthContext';
import { PATHS, cloudAuth, cloudDb, usernameToEmail } from './firebase';

const OK: AuthResult = { ok: true, error: null };

/**
 * The same account shape, stored in Firestore instead of localStorage.
 *
 * The credential is **not** here. Firebase Auth owns passwords; this document holds
 * only what the game plays with. That is the whole reason the cloud path could not
 * reuse the local account store: the local one hands the caller a password hash to
 * verify in the browser, and doing that from a database everyone can read would mean
 * publishing everyone's hashes.
 */
function accountDoc(uid: string) {
  const db = cloudDb();
  return db ? doc(db, PATHS.accounts, uid) : null;
}

/** Repairs a document read from Firestore, the same way the local store repairs storage. */
function toAccount(uid: string, data: Record<string, unknown>): Account {
  const username = typeof data.username === 'string' ? data.username : 'player';
  const club = { players: withoutLegacy(normalizeClub(data.club).players) };
  const owned = indexOwned(club.players);

  return {
    id: uid,
    username,
    role: resolveRole(username),
    level: typeof data.level === 'number' ? data.level : STARTING_LEVEL,
    currentXP: typeof data.currentXP === 'number' ? data.currentXP : STARTING_XP,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    lastSignInAt:
      typeof data.lastSignInAt === 'string' ? data.lastSignInAt : new Date().toISOString(),
    avatarId:
      typeof data.avatarId === 'string' &&
      avatarCatalogue.some((entry) => entry.id === data.avatarId)
        ? data.avatarId
        : DEFAULT_AVATAR_ID,
    wallet: normalizeWallet(data.wallet),
    ledger: Array.isArray(data.ledger) ? (data.ledger as Account['ledger']) : [],
    draftProgress:
      typeof data.draftProgress === 'object' && data.draftProgress !== null
        ? (data.draftProgress as Account['draftProgress'])
        : {},
    club,
    squad: normalizeSquad(data.squad, owned),
    league: (data.league as Account['league']) ?? undefined,
  };
}

/** Strips undefined — Firestore rejects it, and `league` is undefined on new accounts. */
function toDocument(account: Account): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...account };
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) delete raw[key];
  }
  return raw;
}

export interface CloudAuthProviderProps {
  children: ReactNode;
}

/**
 * Accounts in Firebase: one identity, every device.
 *
 * Mirrors the local provider's contract exactly, so every screen in the game is
 * unaware of which one it is running under. Where they differ is only in what cannot
 * be faked locally — a username registry that is actually global, and an admin list
 * that lives on the server rather than in a constant.
 */
export function CloudAuthProvider({ children }: CloudAuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Writes are frequent (every pull, every squad change). Keeping the latest account
  // in a ref lets updateAccount apply its mutation without re-subscribing anything.
  const accountRef = useRef<Account | null>(null);
  accountRef.current = account;

  /** A uid is an admin if `admins/{uid}` exists. The rules check the same document. */
  const checkAdmin = useCallback(async (uid: string): Promise<boolean> => {
    const db = cloudDb();
    if (!db) return false;
    try {
      const snapshot = await getDoc(doc(db, PATHS.admins, uid));
      return snapshot.exists();
    } catch {
      return false;
    }
  }, []);

  const loadAccount = useCallback(
    async (user: User): Promise<Account | null> => {
      const reference = accountDoc(user.uid);
      if (!reference) return null;

      const snapshot = await getDoc(reference);
      if (!snapshot.exists()) return null;
      return toAccount(user.uid, snapshot.data());
    },
    [],
  );

  // Firebase restores the session itself; this just turns that into game state.
  useEffect(() => {
    const auth = cloudAuth();
    if (!auth) {
      setStatus('signed-out');
      return;
    }

    return onAuthStateChanged(auth, (user) => {
      void (async () => {
        if (!user) {
          setAccount(null);
          setIsAdmin(false);
          setStatus('signed-out');
          return;
        }

        const loaded = await loadAccount(user);
        setAccount(loaded);
        setIsAdmin(await checkAdmin(user.uid));
        setStatus(loaded ? 'signed-in' : 'signed-out');
      })();
    });
  }, [loadAccount, checkAdmin]);

  const signUp = useCallback(
    async (input: SignUpInput): Promise<AuthResult> => {
      const auth = cloudAuth();
      const db = cloudDb();
      if (!auth || !db) return { ok: false, error: 'crypto-unavailable' };

      const usernameError = checkUsername(input.username);
      if (usernameError) return { ok: false, error: usernameError };

      const passwordError = checkPassword(input.password);
      if (passwordError) return { ok: false, error: passwordError };

      if (input.password !== input.confirmPassword) {
        return { ok: false, error: 'password-mismatch' };
      }

      const username = input.username.trim();
      const key = normalizeUsername(username);

      if (isAdminUsername(username)) {
        if (!input.adminCode) return { ok: false, error: 'admin-code-required' };
        if (input.adminCode.trim() !== ADMIN_SIGNUP_CODE) {
          return { ok: false, error: 'admin-code-wrong' };
        }
      }

      // Checked before creating the auth user so the usual case fails cleanly. The
      // real guarantee is the Firestore rule: `usernames/{name}` can be created but
      // never overwritten, so two people racing for one name cannot both win.
      const claim = await getDoc(doc(db, PATHS.usernames, key));
      if (claim.exists()) return { ok: false, error: 'username-taken' };

      let user: User;
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          usernameToEmail(username),
          input.password,
        );
        user = credential.user;
      } catch (error) {
        // Firebase knows the name is taken even when the registry lookup missed it,
        // because the synthetic email is derived from the username.
        const code = (error as { code?: string }).code ?? '';
        if (code === 'auth/email-already-in-use') return { ok: false, error: 'username-taken' };
        if (code === 'auth/weak-password') return { ok: false, error: 'password-too-short' };
        return { ok: false, error: 'crypto-unavailable' };
      }

      const now = new Date().toISOString();
      const created: Account = {
        id: user.uid,
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
      };

      await setDoc(doc(db, PATHS.accounts, user.uid), {
        ...toDocument(created),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, PATHS.usernames, key), { uid: user.uid, username });

      setAccount(created);
      setIsAdmin(await checkAdmin(user.uid));
      setStatus('signed-in');
      return OK;
    },
    [checkAdmin],
  );

  const signIn = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      const auth = cloudAuth();
      if (!auth) return { ok: false, error: 'crypto-unavailable' };

      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          usernameToEmail(username),
          password,
        );

        const loaded = await loadAccount(credential.user);
        if (!loaded) return { ok: false, error: 'account-not-found' };

        const stamped = { ...loaded, lastSignInAt: new Date().toISOString() };
        const reference = accountDoc(credential.user.uid);
        if (reference) await updateDoc(reference, { lastSignInAt: stamped.lastSignInAt });

        setAccount(stamped);
        setIsAdmin(await checkAdmin(credential.user.uid));
        setStatus('signed-in');
        return OK;
      } catch (error) {
        const code = (error as { code?: string }).code ?? '';
        // Firebase deliberately blurs "no such user" and "wrong password" into one
        // code to stop account enumeration. The game's two messages collapse to the
        // more useful one rather than guessing.
        if (code === 'auth/user-not-found') return { ok: false, error: 'account-not-found' };
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          return { ok: false, error: 'wrong-password' };
        }
        return { ok: false, error: 'crypto-unavailable' };
      }
    },
    [loadAccount, checkAdmin],
  );

  const signOut = useCallback(async () => {
    const auth = cloudAuth();
    if (auth) await firebaseSignOut(auth);
    setAccount(null);
    setIsAdmin(false);
    setStatus('signed-out');
  }, []);

  /**
   * Applies a change locally, then writes it.
   *
   * Local first on purpose: every pull, drag, and match calls this, and waiting for a
   * round trip before the screen updates would make the game feel broken on a slow
   * connection. A failed write is logged and the next change retries the whole
   * document, so the save converges rather than drifting.
   */
  const updateAccount = useCallback((mutate: (account: Account) => Account) => {
    const current = accountRef.current;
    if (!current) return;

    const next = mutate(current);
    if (next === current) return;

    setAccount(next);
    accountRef.current = next;

    const reference = accountDoc(next.id);
    if (!reference) return;

    void setDoc(reference, { ...toDocument(next), updatedAt: serverTimestamp() }).catch(
      (error: unknown) => {
        console.error('[cloud] ไม่สามารถบันทึกเซฟขึ้นคลาวด์ได้', error);
      },
    );
  }, []);

  const updateOther = useCallback(
    async (username: string, mutate: (account: Account) => Account): Promise<boolean> => {
      const db = cloudDb();
      if (!db) return false;

      const claim = await getDoc(doc(db, PATHS.usernames, normalizeUsername(username)));
      const uid = claim.exists() ? (claim.data().uid as string) : null;
      if (!uid) return false;

      const reference = doc(db, PATHS.accounts, uid);
      const snapshot = await getDoc(reference);
      if (!snapshot.exists()) return false;

      const next = mutate(toAccount(uid, snapshot.data()));
      await setDoc(reference, { ...toDocument(next), updatedAt: serverTimestamp() });

      // The admin may be editing their own account through the admin panel.
      if (accountRef.current?.id === uid) setAccount(next);
      return true;
    },
    [],
  );

  const listAccounts = useCallback(async (): Promise<Account[]> => {
    const db = cloudDb();
    if (!db) return [];

    try {
      const snapshot = await getDocs(collection(db, PATHS.accounts));
      return snapshot.docs.map((entry) => toAccount(entry.id, entry.data()));
    } catch {
      // Rules refuse this to non-admins, which is the point. An empty list is the
      // honest answer rather than an error dialog on a screen they cannot open.
      return [];
    }
  }, []);

  const addXP = useCallback(
    (amount: number) => {
      updateAccount((current) => {
        const result = awardXP({ level: current.level, currentXP: current.currentXP }, amount);
        return { ...current, level: result.level, currentXP: result.currentXP };
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
      // Cloud admin is the `admins/{uid}` document, not the username constant: a name
      // anyone can register must not grant the panel on a public site.
      isAdmin,
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
      isAdmin,
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
