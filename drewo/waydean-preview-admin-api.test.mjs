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

test('sends account backup operations through the fixed Waydean tree route', async () => {
  for (const action of [
    'waydean-admin-backups',
    'waydean-admin-snapshot',
    'waydean-admin-pin-backup',
    'waydean-admin-restore'
  ]) {
    let requestBody;
    const result = await callWaydeanAdminAction(action, { backup: 'drewo-backup.json' }, access, async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, treeDir: 'drewo' }));
    });
    assert.equal(requestBody.action, action);
    assert.equal(requestBody.treeDir, 'drewo');
    assert.equal(requestBody.backup, 'drewo-backup.json');
    assert.equal(result.ok, true);
  }
});

test('sends account lock and password changes through the fixed Waydean tree route', async () => {
  const requests = [];
  for (const [action, payload] of [
    ['waydean-admin-lock', { locked: true, reason: '' }],
    ['waydean-admin-password', { newPassword: 'new-family-password' }]
  ]) {
    await callWaydeanAdminAction(action, payload, access, async (_url, options) => {
      requests.push({
        authorization: options.headers.Authorization,
        body: JSON.parse(options.body)
      });
      return new Response(JSON.stringify({ ok: true, treeDir: 'drewo' }));
    });
  }

  assert.deepEqual(requests, [
    {
      authorization: 'Bearer user-access-token',
      body: { locked: true, reason: '', treeDir: 'drewo', action: 'waydean-admin-lock' }
    },
    {
      authorization: 'Bearer user-access-token',
      body: { newPassword: 'new-family-password', treeDir: 'drewo', action: 'waydean-admin-password' }
    }
  ]);
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
  for (const action of ['publish', 'set-lock', 'set-password', 'waydean-admin-delete-tree']) {
    let called = false;
    await assert.rejects(
      callWaydeanAdminAction(action, {}, access, async () => { called = true; }),
      error => error.code === 'WAYDEAN_ACTION_NOT_ALLOWED'
    );
    assert.equal(called, false, `${action} must not reach the API directly`);
  }
});
