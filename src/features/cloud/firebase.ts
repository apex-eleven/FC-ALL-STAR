import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase, initialised only if it has been configured.
 *
 * The game works with no Firebase at all — saves live in the browser, and that is
 * still the default. These env vars are what turns on the cloud layer, and the whole
 * module is written so that a missing config is an ordinary state rather than a
 * crash: `isCloudEnabled()` is false, every caller falls back to local, and nothing
 * throws on a deployment where the operator has not set the variables yet.
 *
 * The keys are not secrets. Firebase web config is meant to ship in the client, and
 * the actual protection is the Firestore rules in `firestore.rules` — locking the
 * keys away would buy nothing and only make deploys harder.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebaseConfig | null {
  const config: FirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  };

  // All or nothing. A half-filled config fails at call time with errors that look
  // like network trouble, which is a miserable thing to debug on a live site.
  const complete = Object.values(config).every((value) => value.length > 0);
  return complete ? config : null;
}

const config = readConfig();

export function isCloudEnabled(): boolean {
  return config !== null;
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

/**
 * Built on first use rather than at import.
 *
 * Nothing outside the cloud layer should pay for Firebase when the game runs locally,
 * and initialising at module scope would run on every page load whether the feature
 * is on or not.
 */
function ensureApp(): FirebaseApp | null {
  if (!config) return null;
  if (!app) app = initializeApp(config);
  return app;
}

export function cloudAuth(): Auth | null {
  const instance = ensureApp();
  if (!instance) return null;
  if (!authInstance) authInstance = getAuth(instance);
  return authInstance;
}

export function cloudDb(): Firestore | null {
  const instance = ensureApp();
  if (!instance) return null;
  if (!dbInstance) dbInstance = getFirestore(instance);
  return dbInstance;
}

/**
 * Username -> the address Firebase Auth signs in with.
 *
 * Firebase Auth needs an email; this game has usernames. Mapping them onto a
 * synthetic address keeps the sign-in form unchanged, and leaves the door open to
 * real email later — a player who adds one is just another credential on the same
 * account.
 *
 * Lowercased so "DDX" and "ddx" are one person, matching normalizeUsername.
 */
export const SYNTHETIC_EMAIL_DOMAIN = 'players.fcallstar.local';

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** Firestore paths, in one place so a rename here cannot drift from firestore.rules. */
export const PATHS = {
  accounts: 'accounts',
  usernames: 'usernames',
  admins: 'admins',
  config: 'config',
  configDoc: 'admin',
  leaderboard: 'leaderboard',
  gachaFeed: 'gachaFeed',
  saveErrors: 'saveErrors',
} as const;
