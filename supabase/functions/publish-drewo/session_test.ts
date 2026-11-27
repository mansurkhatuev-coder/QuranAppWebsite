import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { signNekSession, verifyNekSession } from './session.ts';
import { passwordFingerprint } from './password-hash.ts';

const HASH_A = 'a1b2c3d4'.repeat(8); // 64 hex chars
const HASH_B = 'f9e8d7c6'.repeat(8);
const FP_A = passwordFingerprint(HASH_A);
const FP_B = passwordFingerprint(HASH_B);

Deno.test('sign/verify nek session', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000, pwdFp: FP_A },
    secret
  );
  const payload = await verifyNekSession(token, secret, FP_A);
  assertEquals(payload?.treeDir, 'drewo');
  assertEquals(payload?.pwdFp, FP_A);
});

Deno.test('expired session rejected', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() - 1000, pwdFp: FP_A },
    secret
  );
  assertEquals(await verifyNekSession(token, secret, FP_A), null);
});

Deno.test('two sign-ins with identical claims have independent session keys', async () => {
  const secret = 'test-secret';
  const claims = { treeDir: 'drewo', role: 'editor' as const, exp: Date.now() + 60_000, pwdFp: FP_A };
  const first = await signNekSession(claims, secret);
  const second = await signNekSession(claims, secret);
  const firstSession = await verifyNekSession(first, secret, FP_A);
  const secondSession = await verifyNekSession(second, secret, FP_A);
  assertNotEquals(firstSession?.sessionKey, secondSession?.sessionKey);
  assertEquals((await verifyNekSession(first, secret, FP_A))?.sessionKey, firstSession?.sessionKey);
});

Deno.test('a token from before session IDs still has a stable session key', async () => {
  const secret = 'test-secret';
  const encode = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encoder = new TextEncoder();
  const body = encode(JSON.stringify({ treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000, pwdFp: FP_A }));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {
    name: 'HMAC', hash: 'SHA-256'
  }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  const token = `${body}.${encode(String.fromCharCode(...signed))}`;
  const first = await verifyNekSession(token, secret, FP_A);
  assertEquals(first?.sessionKey.length, 64);
  assertEquals((await verifyNekSession(token, secret, FP_A))?.sessionKey, first?.sessionKey);
});

Deno.test('bad signature returns null', async () => {
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000, pwdFp: FP_A },
    'different-test-signing-key'
  );
  assertEquals(await verifyNekSession(token, 'test-secret', FP_A), null);
});

Deno.test('malformed token returns null', async () => {
  assertEquals(await verifyNekSession('!!!.!!!', 'test-secret', FP_A), null);
});

Deno.test('passwordFingerprint is 8 hex chars of the hash', () => {
  assertEquals(FP_A, 'a1b2c3d4');
  assertNotEquals(FP_A, FP_B);
});

Deno.test('passwordFingerprint falls back when no hash is stored', () => {
  assertEquals(passwordFingerprint(null), 'nopwhash');
  assertEquals(passwordFingerprint(''), 'nopwhash');
  assertNotEquals(passwordFingerprint('not-a-hash'), 'nopwhash');
});

Deno.test('session signed under an old password is rejected', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000, pwdFp: FP_A },
    secret
  );
  assertEquals(await verifyNekSession(token, secret, FP_B), null);
});

Deno.test('session without a fingerprint is rejected', async () => {
  const secret = 'test-secret';
  const legacy = { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000 };
  const token = await signNekSession(legacy as never, secret);
  assertEquals(await verifyNekSession(token, secret, FP_A), null);
  assertEquals(await verifyNekSession(token, secret, 'nopwhash'), null);
});
