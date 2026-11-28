import { createHash } from 'node:crypto';
import { assertEquals, assertMatch, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFamilyPasswordHash, passwordFingerprint, verifyFamilyPassword } from './password-hash.ts';

Deno.test('new password records use independent salts and verify only the matching password', async () => {
  const password = 'тестовый пароль';
  const first = await createFamilyPasswordHash(password);
  const second = await createFamilyPasswordHash(password);
  assertMatch(first, /^pbkdf2-sha256\$600000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assertNotEquals(first.split('$')[2], second.split('$')[2]);
  assertNotEquals(passwordFingerprint(first), passwordFingerprint(second));
  assertEquals(await verifyFamilyPassword(password, first), true);
  assertEquals(await verifyFamilyPassword(password + '!', first), false);
});

Deno.test('legacy SHA-256 records keep their verifier and session fingerprint', async () => {
  const password = 'тестовое наследие';
  const legacy = createHash('sha256').update(`drewo-pw:${password}`).digest('hex');
  assertEquals(await verifyFamilyPassword(password, legacy.toUpperCase()), true);
  assertEquals(await verifyFamilyPassword('другая фраза', legacy), false);
  assertEquals(passwordFingerprint(legacy.toUpperCase()), legacy.slice(0, 8));
});

Deno.test('invalid or unsupported password records cannot verify', async () => {
  const bad = `pbkdf2-sha256$1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
  assertEquals(await verifyFamilyPassword('any password', bad), false);
  assertEquals(await verifyFamilyPassword('any password', 'invalid'), false);
  assertNotEquals(passwordFingerprint(bad), passwordFingerprint(null));
});
