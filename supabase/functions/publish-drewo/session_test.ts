import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { passwordFingerprint, signNekSession, verifyNekSession } from './session.ts';

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

Deno.test('bad signature returns null', async () => {
  const secret = 'test-secret';
  const token = await signNekSession(
    { treeDir: 'drewo', role: 'editor', exp: Date.now() + 60_000, pwdFp: FP_A },
    secret
  );
  const [body, sig] = token.split('.');
  const last = sig[sig.length - 1] === 'A' ? 'B' : 'A';
  const tampered = `${body}.${sig.slice(0, -1)}${last}`;
  assertEquals(await verifyNekSession(tampered, secret, FP_A), null);
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
  assertEquals(passwordFingerprint('not-a-hash'), 'nopwhash');
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
