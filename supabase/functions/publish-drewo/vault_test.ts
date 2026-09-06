import {
  assertEquals,
  assertNotEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  LEGACY_VAULT_PATH,
  VAULT_ITERATIONS,
  VAULT_KDF,
  decryptVault,
  emptyVaultMap,
  encryptVault,
  parseVaultFile,
  serializeVaultFile,
  upsertVaultEntry,
  VAULT_PATH,
  type VaultFile,
} from './vault.ts';

const KEY = 'test-vault-key-material';

Deno.test('vault lives outside the published site tree', () => {
  assertEquals(VAULT_PATH, '_private/credentials.vault.json');
  assertEquals(LEGACY_VAULT_PATH, 'trees/credentials.vault.json');
  assertEquals(VAULT_PATH.startsWith('_private/'), true);
});

Deno.test('round-trip encrypt/decrypt', async () => {
  const map = emptyVaultMap();
  const file = await encryptVault(map, KEY);
  const restored = await decryptVault(file, KEY);
  assertEquals(restored, map);
});

Deno.test('encryptVault uses PBKDF2-SHA256 with a random salt', async () => {
  const a = await encryptVault(emptyVaultMap(), KEY);
  const b = await encryptVault(emptyVaultMap(), KEY);
  assertEquals(a.version, 2);
  assertEquals(a.kdf, VAULT_KDF);
  assertEquals(a.iterations, VAULT_ITERATIONS);
  assertEquals(VAULT_ITERATIONS >= 210000, true);
  assertEquals(atob(a.salt ?? '').length, 16);
  assertNotEquals(a.salt, b.salt);
  assertNotEquals(a.iv, b.iv);
});

Deno.test('upsert drewo/hoti then encrypt round-trip', async () => {
  const entry = {
    login: 'hoti',
    password: 'secret-pass',
    title: 'Хьоти некъ',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
  const map = upsertVaultEntry(emptyVaultMap(), 'drewo', entry);
  const file = await encryptVault(map, KEY);
  const restored = await decryptVault(file, KEY);
  assertEquals(restored.drewo, entry);
});

Deno.test('upsert is immutable', () => {
  const base = emptyVaultMap();
  const entry = {
    login: 'hoti',
    password: 'x',
    title: 'Test',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
  const next = upsertVaultEntry(base, 'drewo', entry);
  assertEquals(base, {});
  assertEquals(next.drewo, entry);
});

Deno.test('parseVaultFile and serializeVaultFile round-trip', async () => {
  const file = await encryptVault(emptyVaultMap(), KEY);
  const raw = serializeVaultFile(file);
  assertEquals(raw.endsWith('\n'), true);
  assertEquals(parseVaultFile(raw), file);
  assertEquals(parseVaultFile(''), null);
  assertEquals(parseVaultFile('not json'), null);
  assertEquals(parseVaultFile('{"version":3}'), null);
});

Deno.test('parseVaultFile rejects a v2 file without salt or kdf', async () => {
  const file = await encryptVault(emptyVaultMap(), KEY);
  assertEquals(parseVaultFile(JSON.stringify({ ...file, salt: undefined })), null);
  assertEquals(parseVaultFile(JSON.stringify({ ...file, kdf: 'SHA-256' })), null);
});

Deno.test('wrong key fails decrypt', async () => {
  const file = await encryptVault(emptyVaultMap(), KEY);
  await assertRejects(() => decryptVault(file, 'wrong-key'));
});

Deno.test('legacy v1 files still decrypt so an existing vault can be migrated', async () => {
  const map = upsertVaultEntry(emptyVaultMap(), 'drewo', {
    login: 'hoti',
    password: 'legacy-pass',
    title: 'Хьоти некъ',
    updatedAt: '2026-09-06T00:00:00.000Z',
  });

  // Reproduces the pre-PBKDF2 format: AES-GCM key = SHA-256(keyMaterial).
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(KEY));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(map))
    )
  );
  const b64 = (bytes: Uint8Array) =>
    btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  const legacy: VaultFile = {
    version: 1,
    alg: 'AES-GCM',
    iv: b64(iv),
    data: b64(ciphertext),
  };

  assertEquals(parseVaultFile(JSON.stringify(legacy)), legacy);
  assertEquals(await decryptVault(legacy, KEY), map);
});
