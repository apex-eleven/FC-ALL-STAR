/**
 * Firebase, initialised only if it has been configured.
 *
 * The game works with no Firebase at all — saves live in the browser, and that is
 * still the default. These env vars are what turns on the cloud layer, and the whole
 * module is written so that a missing config is an ordinary state rather than a
 * crash: `isCloudEnabled()` is false, callers fall back to local, and nothing throws
 * on a deployment where the operator has not set the variables yet.
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

  // All or nothing. A half-filled config produces failures at call time that look
  // like network errors, which is a miserable thing to debug on a live site.
  const complete = Object.values(config).every((value) => value.length > 0);
  return complete ? config : null;
}

const config = readConfig();

export function isCloudEnabled(): boolean {
  return config !== null;
}

export function cloudConfig(): FirebaseConfig | null {
  return config;
}

/**
 * Username -> the address Firebase Auth signs in with.
 *
 * Firebase Auth needs an email; this game has usernames. Mapping them to a synthetic
 * address on a domain nobody sends mail to keeps the sign-in form unchanged, while
 * leaving the door open to real email later — a player who adds one is just another
 * credential on the same account.
 *
 * Lowercased so "DDX" and "ddx" are the same person, matching normalizeUsername.
 */
export const SYNTHETIC_EMAIL_DOMAIN = 'players.fcallstar.local';

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
