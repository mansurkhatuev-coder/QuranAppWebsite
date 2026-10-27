import test from 'node:test';
import assert from 'node:assert/strict';
import { requireWaydeanAdminAccess } from './waydean-preview-access.mjs';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;

function setBrowser({ endpoint = 'https://example.supabase.co/functions/v1/publish-drewo', session = null, fetcher }) {
  globalThis.window = {
    location: { origin: 'https://waydean.ru' },
    SUPABASE_CONFIG: { anonKey: 'public-anon-key' },
    AdminSupabase: {
      isEnabled: () => true,
      getSession: async () => session,
    },
  };
  globalThis.document = { querySelector: () => ({ content: endpoint }) };
  globalThis.fetch = fetcher;
}

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
});

test('does not call the access endpoint when there is no Supabase Auth session', async () => {
  let calls = 0;
  setBrowser({ fetcher: async () => { calls += 1; } });

  await assert.rejects(
    requireWaydeanAdminAccess('drewo'),
    (error) => error.code === 'WAYDEAN_AUTH_REQUIRED'
  );
  assert.equal(calls, 0);
});

test('verifies the existing admin session with a bearer token before the tree loads', async () => {
  let request;
  setBrowser({
    session: { access_token: 'supabase-access-token' },
    fetcher: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, treeDir: 'drewo' }), { status: 200 });
    },
  });

  const access = await requireWaydeanAdminAccess('drewo');
  assert.equal(request.url, 'https://example.supabase.co/functions/v1/publish-drewo');
  assert.equal(request.options.headers.Authorization, 'Bearer supabase-access-token');
  assert.equal(request.options.headers.apikey, 'public-anon-key');
  assert.deepEqual(JSON.parse(request.options.body), { action: 'waydean-admin-auth', treeDir: 'drewo' });
  assert.equal(access.endpoint, request.url);
  assert.equal(access.accessToken, 'supabase-access-token');
  assert.equal(access.anonKey, 'public-anon-key');
});

test('offers login again when the server rejects an expired session', async () => {
  setBrowser({
    session: { access_token: 'expired-token' },
    fetcher: async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  });

  await assert.rejects(
    requireWaydeanAdminAccess('drewo'),
    (error) => error.code === 'WAYDEAN_AUTH_REQUIRED'
  );
});

test('keeps another Supabase user out', async () => {
  setBrowser({
    session: { access_token: 'other-user-token' },
    fetcher: async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
  });

  await assert.rejects(
    requireWaydeanAdminAccess('drewo'),
    (error) => error.code === 'WAYDEAN_ACCESS_DENIED'
  );
});

test('explains when the server-side admin account has not been configured', async () => {
  setBrowser({
    session: { access_token: 'admin-token' },
    fetcher: async () => new Response(JSON.stringify({ ok: false, code: 'allowlist_not_configured' }), { status: 503 }),
  });

  await assert.rejects(
    requireWaydeanAdminAccess('drewo'),
    (error) => error.code === 'WAYDEAN_AUTH_UNAVAILABLE' && error.message.includes('ещё не настроен')
  );
});

test('rejects an unexpected tree even if the server replies success', async () => {
  setBrowser({
    session: { access_token: 'admin-token' },
    fetcher: async () => new Response(JSON.stringify({ ok: true, treeDir: 'another-tree' }), { status: 200 }),
  });

  await assert.rejects(
    requireWaydeanAdminAccess('drewo'),
    (error) => error.code === 'WAYDEAN_ACCESS_DENIED'
  );
});

test('fails closed when the authorization endpoint cannot be reached', async () => {
  setBrowser({
    session: { access_token: 'admin-token' },
    fetcher: async () => { throw new TypeError('Failed to fetch'); },
  });

  await assert.rejects(
    requireWaydeanAdminAccess('drewo'),
    (error) => error.code === 'WAYDEAN_AUTH_UNAVAILABLE'
  );
});
