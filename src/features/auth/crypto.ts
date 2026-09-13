import type { Credential } from './types';

const ITERATIONS = 150_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

export class CryptoUnavailableError extends Error {
  constructor() {
    super('Web Crypto is unavailable. Passwords cannot be hashed.');
    this.name = 'CryptoUnavailableError';
  }
}

function subtle(): SubtleCrypto {
  // crypto.subtle only exists in a secure context: https, or localhost in dev.
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new CryptoUnavailableError();
  return crypto.subtle;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

async function derive(password: string, salt: ArrayBuffer, iterations: number): Promise<string> {
  const key = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password).slice().buffer,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_LENGTH_BITS,
  );

  return toHex(bits);
}

export async function hashPassword(password: string): Promise<Credential> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const salt = saltBytes.slice().buffer;
  const hash = await derive(password, salt, ITERATIONS);

  return {
    algorithm: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    salt: toHex(salt),
    hash,
  };
}

/** Compares in constant time so the check cannot be timed character by character. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  credential: Credential,
): Promise<boolean> {
  const candidate = await derive(password, fromHex(credential.salt), credential.iterations);
  return equals(candidate, credential.hash);
}
