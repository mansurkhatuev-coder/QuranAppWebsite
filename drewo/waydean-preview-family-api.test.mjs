import test from 'node:test';
import assert from 'node:assert/strict';
import { callFamilyTreeAction, canEditFamilyTreeRole, canPublishFamilyTreeSession } from './waydean-preview-family-api.mjs';

const common = {
  endpoint: 'https://example.test/functions/publish-drewo',
  treeDir: 'drewo',
  sessionToken: 'signed-family-token'
};

test('only production editor roles receive family write controls', () => {
  assert.equal(canEditFamilyTreeRole('editor'), true);
  assert.equal(canEditFamilyTreeRole('super'), true);
  assert.equal(canEditFamilyTreeRole('viewer'), false);
  assert.equal(canEditFamilyTreeRole(''), false);
});

test('a family session cannot publish while the tree is locked', () => {
  assert.equal(canPublishFamilyTreeSession({ token: 'signed', role: 'editor', locked: false }), true);
  assert.equal(canPublishFamilyTreeSession({ token: 'signed', role: 'editor', locked: true }), false);
  assert.equal(canPublishFamilyTreeSession({ token: '', role: 'super', locked: false }), false);
  assert.equal(canPublishFamilyTreeSession({ token: 'signed', role: 'viewer', locked: false }), false);
});

test('loads a fresh server tree through the signed family session', async () => {
  let request;
  const result = await callFamilyTreeAction('family-load', {}, {
    ...common,
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        ok: true,
        treeDir: 'drewo',
        role: 'editor',
        treeJson: '{"id":"root"}',
        activityJson: '[]',
        fingerprint: 'server-fingerprint'
      }));
    }
  });

  assert.equal(request.url, common.endpoint);
  assert.deepEqual(JSON.parse(request.options.body), {
    action: 'family-load',
    treeDir: 'drewo',
    sessionToken: common.sessionToken
  });
  assert.equal(result.fingerprint, 'server-fingerprint');
  assert.equal(result.role, 'editor');
});

test('publishes with the signed family session and never enables force merge', async () => {
  let body;
  const result = await callFamilyTreeAction('publish', {
    treeDir: 'attacker',
    sessionToken: 'attacker-token',
    password: 'must-not-leak',
    force: true,
    treeJson: '{"id":"root"}',
    baseFingerprint: 'base'
  }, {
    ...common,
    fetcher: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, treeDir: 'drewo', fingerprint: 'next' }));
    }
  });

  assert.deepEqual(body, {
    treeDir: 'drewo',
    sessionToken: common.sessionToken,
    action: 'publish',
    force: false,
    treeJson: '{"id":"root"}',
    baseFingerprint: 'base'
  });
  assert.equal(result.fingerprint, 'next');
});

test('allows family push actions only through the signed session and strips credential fields', async () => {
  const requests = [];
  const responses = {
    'vapid-public': { ok: true, treeDir: 'drewo', publicKey: 'AQID' },
    subscribe: { ok: true, treeDir: 'drewo', count: 1 },
    unsubscribe: { ok: true, treeDir: 'drewo', count: 0 }
  };

  for (const [action, payload] of [
    ['vapid-public', { password: 'must-not-leak' }],
    ['subscribe', { password: 'must-not-leak', subscription: { endpoint: 'https://push.example/device' } }],
    ['unsubscribe', { password: 'must-not-leak', endpoint: 'https://push.example/device' }]
  ]) {
    await callFamilyTreeAction(action, payload, {
      ...common,
      fetcher: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return new Response(JSON.stringify(responses[action]));
      }
    });
  }

  assert.deepEqual(requests, [
    { action: 'vapid-public', treeDir: 'drewo', sessionToken: common.sessionToken },
    { action: 'subscribe', treeDir: 'drewo', sessionToken: common.sessionToken, subscription: { endpoint: 'https://push.example/device' } },
    { action: 'unsubscribe', treeDir: 'drewo', sessionToken: common.sessionToken, endpoint: 'https://push.example/device' }
  ]);
});

test('rejects writes without a session and does not call the service', async () => {
  let requested = false;
  await assert.rejects(callFamilyTreeAction('publish', {}, {
    ...common,
    sessionToken: '',
    fetcher: async () => { requested = true; }
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');
  assert.equal(requested, false);
});

test('preserves current server snapshot when a family publish conflicts', async () => {
  await assert.rejects(callFamilyTreeAction('publish', {}, {
    ...common,
    fetcher: async () => new Response(JSON.stringify({
      ok: false,
      conflict: true,
      error: 'Версия изменилась',
      serverFingerprint: 'latest',
      serverTreeJson: '{"id":"server"}',
      serverActivityJson: '[]'
    }), { status: 409 })
  }), error => error.code === 'WAYDEAN_PUBLISH_CONFLICT'
    && error.details.serverFingerprint === 'latest'
    && error.details.serverTreeJson === '{"id":"server"}');
});

test('rejects a server response for a different tree', async () => {
  await assert.rejects(callFamilyTreeAction('family-load', {}, {
    ...common,
    fetcher: async () => new Response(JSON.stringify({
      ok: true,
      treeDir: 'another-tree',
      treeJson: '{"id":"root"}',
      fingerprint: 'x'
    }))
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');
});
