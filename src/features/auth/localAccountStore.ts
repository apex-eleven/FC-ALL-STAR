import type { AccountStore, StoredAccount } from './types';
import { normalizeUsername } from './constants';

const ACCOUNTS_KEY = 'football-home-ui:accounts:v2';
const SESSION_KEY = 'football-home-ui:session:v2';

type Registry = Record<string, StoredAccount>;

function readRegistry(): Registry {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Registry;
  } catch {
    return {};
  }
}

function writeRegistry(registry: Registry): void {
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(registry));
  } catch {
    // Storage can be blocked (private mode, disabled cookies). The session still
    // works in memory until reload.
  }
}

/**
 * Browser-local account registry. Multiple accounts per browser, one active
 * session. Not shared between devices and not a security boundary — see
 * features/auth/README.md.
 */
export const localAccountStore: AccountStore = {
  async find(username) {
    return readRegistry()[normalizeUsername(username)] ?? null;
  },

  async create(account) {
    const registry = readRegistry();
    registry[normalizeUsername(account.username)] = account;
    writeRegistry(registry);
  },

  async update(account) {
    const registry = readRegistry();
    const key = normalizeUsername(account.username);
    if (!registry[key]) return;
    registry[key] = account;
    writeRegistry(registry);
  },

  async remove(username) {
    const registry = readRegistry();
    delete registry[normalizeUsername(username)];
    writeRegistry(registry);
  },

  async list() {
    return Object.values(readRegistry());
  },

  async loadSession() {
    try {
      return window.localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },

  async saveSession(username) {
    try {
      window.localStorage.setItem(SESSION_KEY, normalizeUsername(username));
    } catch {
      // Ignore.
    }
  },

  async clearSession() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore.
    }
  },
};
