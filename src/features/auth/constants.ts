import type { AuthError, Role } from './types';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 16;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 64;

/**
 * Letters (any script, so Thai works), digits, and a few separators. Deliberately
 * excludes whitespace so the name stays on one line in the top bar.
 */
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;

/**
 * Usernames that get the admin role. Compared lowercase. Claiming one of these at
 * signup also requires ADMIN_SIGNUP_CODE.
 *
 * IMPORTANT: this gate is cosmetic. Everything runs in the browser, so anyone can
 * edit localStorage and hand themselves the role. It stops casual use, not an
 * attacker. Move role assignment server-side before it protects anything real.
 */
export const ADMIN_USERNAMES: readonly string[] = ['admin', 'ddx'];

/** Also shipped to the browser, therefore also not a secret. Same caveat. */
export const ADMIN_SIGNUP_CODE = 'numero-10';

export function isAdminUsername(username: string): boolean {
  return ADMIN_USERNAMES.includes(username.trim().toLowerCase());
}

export function resolveRole(username: string): Role {
  return isAdminUsername(username) ? 'admin' : 'player';
}

/** Counts by code point so Thai and emoji do not inflate the length. */
export function nameLength(raw: string): number {
  return [...raw.trim()].length;
}

export function checkUsername(raw: string): AuthError | null {
  const value = raw.trim();
  if (nameLength(value) < USERNAME_MIN_LENGTH) return 'username-too-short';
  if (nameLength(value) > USERNAME_MAX_LENGTH) return 'username-too-long';
  if (!USERNAME_PATTERN.test(value)) return 'username-invalid-chars';
  return null;
}

export function checkPassword(raw: string): AuthError | null {
  if (raw.length < PASSWORD_MIN_LENGTH) return 'password-too-short';
  if (raw.length > PASSWORD_MAX_LENGTH) return 'password-too-long';
  return null;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
