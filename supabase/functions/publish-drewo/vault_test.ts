import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decryptVault,
  emptyVaultMap,
  encryptVault,
  parseVaultFile,
  serializeVaultFile,
  upsertVaultEntry,
  VAULT_PATH,
} from './vault.ts';

const KEY = 'test-vault-key-material';

Deno.test('VAULT_PATH constant', () => {
  assertEquals(VAULT_PATH, 'trees/credentials.vault.json');
});

Deno.test('round-trip encrypt/decrypt', async () => {
  const map = emptyVaultMap();
  const file = await encryptVault(map, KEY);
  const restored = await decryptVault(file, KEY);
  assertEquals(restored, map);
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
  assertEquals(parseVaultFile('{"version":2}'), null);
});

Deno.test('wrong key fails decrypt', async () => {
  const file = await encryptVault(emptyVaultMap(), KEY);
  await assertRejects(() => decryptVault(file, 'wrong-key'));
});
