import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();
const iterations = 600_000;
const prefix = `pbkdf2-sha256$${iterations}$`;
const legacyHash = /^[0-9a-f]{64}$/i;

function currentRecord(hash: string) {
  if (!hash.startsWith(prefix)) return null;
  return /^([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(hash.slice(prefix.length));
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, key, 256);
  return Buffer.from(bits);
}

export async function createFamilyPasswordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt);
  return `${prefix}${Buffer.from(salt).toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyFamilyPassword(password: string, hash: string): Promise<boolean> {
  if (legacyHash.test(hash)) {
    const derived = createHash('sha256').update(`drewo-pw:${password}`).digest();
    return timingSafeEqual(derived, Buffer.from(hash, 'hex'));
  }
  const record = currentRecord(hash);
  if (!record) return false;
  const [, salt, verifier] = record;
  const derived = await derivePassword(password, Uint8Array.from(Buffer.from(salt, 'hex')));
  return timingSafeEqual(derived, Buffer.from(verifier, 'hex'));
}

export function passwordFingerprint(hash?: string | null): string {
  if (!hash) return 'nopwhash';
  // Keep previously issued sessions working for untouched legacy passwords.
  if (legacyHash.test(hash)) return hash.slice(0, 8).toLowerCase();
  if (!currentRecord(hash)) return 'invalid';
  return `record:${createHash('sha256').update(hash).digest('hex')}`;
}
