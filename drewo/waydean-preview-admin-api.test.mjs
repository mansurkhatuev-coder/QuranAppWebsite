import test from 'node:test';
import assert from 'node:assert/strict';
import { callWaydeanAdminAction } from './waydean-preview-admin-api.mjs';

const access = {
  endpoint: 'https://example.supabase.co/functions/v1/publish-drewo',
  anonKey: 'public-key',
  accessToken: 'user-access-token'
};

test('calls only Waydean account actions with the verified bearer session', async () => {
  let request;
  const result = await callWaydeanAdminAction('waydean-admin-load', { treeDir: 'attacker' }, access, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true, treeDir: 'drewo', treeJson: '{"id":"root"}' }));
  });

  assert.equal(request.url, access.endpoint);
  assert.equal(request.options.headers.Authorization, 'Bearer user-access-token');
  assert.equal(request.options.headers.apikey, 'public-key');
  assert.deepEqual(JSON.parse(request.options.body), { treeDir: 'drewo', action: 'waydean-admin-load' });
  assert.equal(result.treeDir, 'drewo');
});

test('rejects missing account credentials without making a request', async () => {
  let called = false;
  await assert.rejects(
    callWaydeanAdminAction('waydean-admin-publish', {}, { ...access, accessToken: '' }, async () => { called = true; }),
    error => error.code === 'WAYDEAN_AUTH_REQUIRED'
  );
  assert.equal(called, false);
});

test('preserves server conflict snapshots for safe recovery', async () => {
  await assert.rejects(
    callWaydeanAdminAction('waydean-admin-publish', {}, access, async () => new Response(JSON.stringify({
      conflict: true,
      error: 'На сайте другая версия',
      serverFingerprint: 'new-fingerprint',
      serverTreeJson: '{"id":"server"}',
      serverActivityJson: '[]'
    }), { status: 409 })),
    error => error.code === 'WAYDEAN_PUBLISH_CONFLICT'
      && error.details.serverFingerprint === 'new-fingerprint'
      && error.details.serverTreeJson === '{"id":"server"}'
  );
});

test('fails closed for actions outside the explicit account API allowlist', async () => {
  let called = false;
  await assert.rejects(
    callWaydeanAdminAction('publish', {}, access, async () => { called = true; }),
    error => error.code === 'WAYDEAN_ACTION_NOT_ALLOWED'
  );
  assert.equal(called, false);
});
