import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeFamilyTokenFromUrl,
  familySessionKey,
  loginFamilySession,
  readLegacyTreeViewSession,
  readFamilySession,
  resolveFamilyInvite,
  resolveFamilyPreviewAccess,
  storeFamilySession,
  verifyFamilySession
} from './waydean-preview-family-auth.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test('stores family sessions in tab-scoped storage under the legacy tree key', () => {
  const storage = memoryStorage();
  assert.equal(familySessionKey('drewo'), 'nek-session:drewo');
  assert.equal(storeFamilySession(storage, 'drewo', 'signed-token'), true);
  assert.equal(readFamilySession(storage, 'drewo'), 'signed-token');
  assert.equal(readFamilySession(storage, 'another-tree'), '');
  assert.equal(storeFamilySession(storage, 'drewo', ''), true);
  assert.equal(readFamilySession(storage, 'drewo'), '');
});

test('recognizes the still-valid remembered identity from the legacy tree', () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  storage.setItem('drewo-view-session', JSON.stringify({ personId: 'mansur', at: now - 29 * 24 * 60 * 60 * 1000 }));

  assert.deepEqual(readLegacyTreeViewSession(storage, now), { personId: 'mansur' });

  storage.setItem('drewo-view-session', JSON.stringify({ personId: 'mansur', at: now - 31 * 24 * 60 * 60 * 1000 }));
  assert.equal(readLegacyTreeViewSession(storage, now), null);
  storage.setItem('drewo-view-session', '{broken');
  assert.equal(readLegacyTreeViewSession(storage, now), null);
});

test('opens a remembered legacy tree as read-only when its server session has expired', async () => {
  const result = await resolveFamilyPreviewAccess({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: 'expired-token',
    legacyViewSession: { personId: 'mansur' },
    fetcher: async () => jsonResponse({ error: 'Сессия истекла' }, 401)
  });

  assert.deepEqual(result, { authenticated: false, legacyReadOnly: true, session: null });
});

test('uses the old tree remembered identity when its tab-scoped token is unavailable', async () => {
  const result = await resolveFamilyPreviewAccess({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: '',
    legacyViewSession: { personId: 'mansur' },
    fetcher: async () => { throw new Error('No request should be needed'); }
  });

  assert.deepEqual(result, { authenticated: false, legacyReadOnly: true, session: null });
});

test('does not silently open the family tree without a valid legacy view session', async () => {
  await assert.rejects(resolveFamilyPreviewAccess({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: '',
    legacyViewSession: null
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');
});

test('a demo route never treats the HOTI remembered viewer as demo access', async () => {
  await assert.rejects(resolveFamilyPreviewAccess({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo-reklama',
    token: '',
    allowLegacyReadOnly: false,
    legacyViewSession: { personId: 'mansur' },
    fetcher: async () => { throw new Error('No request should be needed'); }
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');
});

test('consumes a signed invite token from the URL without leaving it in navigation history', () => {
  assert.deepEqual(
    consumeFamilyTokenFromUrl('https://waydean.ru/drewo/waydean-preview.html?source=family&nek=signed%2Btoken&state=path#tree'),
    {
      token: 'signed+token',
      cleanUrl: '/drewo/waydean-preview.html?source=family&state=path#tree'
    }
  );
});

test('family login verifies the server session and stores its refreshed token', async () => {
  const storage = memoryStorage();
  const requests = [];
  const result = await loginFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    login: 'HOTI',
    password: 'family-password',
    treeDir: 'drewo',
    storage,
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return body.action === 'login-tree'
        ? jsonResponse({ ok: true, treeDir: 'drewo', sessionToken: 'login-token' })
        : jsonResponse({ ok: true, treeDir: 'drewo', role: 'viewer', locked: false, sessionToken: 'refreshed-token' });
    }
  });

  assert.deepEqual(requests, [
    { action: 'login-tree', login: 'hoti', password: 'family-password' },
    { action: 'auth', treeDir: 'drewo', sessionToken: 'login-token' }
  ]);
  assert.equal(result.role, 'viewer');
  assert.equal(readFamilySession(storage, 'drewo'), 'refreshed-token');
});

test('does not store a token when family credentials are rejected', async () => {
  const storage = memoryStorage();
  await assert.rejects(loginFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    login: 'hoti',
    password: 'wrong-password',
    treeDir: 'drewo',
    storage,
    fetcher: async () => jsonResponse({ error: 'Неверный логин или пароль' }, 401)
  }), error => error.status === 401 && error.message === 'Неверный логин или пароль');
  assert.equal(readFamilySession(storage, 'drewo'), '');
});

test('redirects credentials for a different tree only to the server-resolved same-origin path', async () => {
  const result = await loginFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    login: 'other',
    password: 'family-password',
    treeDir: 'drewo',
    origin: 'https://waydean.ru',
    fetcher: async () => jsonResponse({
      ok: true,
      treeDir: 'other-tree',
      path: '/other-tree/',
      sessionToken: 'signed token'
    })
  });
  assert.deepEqual(result, {
    redirect: true,
    redirectUrl: '/other-tree/?nek=signed+token'
  });
});

test('demo login rejects credentials resolved to a different family tree', async () => {
  const storage = memoryStorage();
  await assert.rejects(loginFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    login: 'other-tree',
    password: 'demo-password',
    treeDir: 'drewo-reklama',
    allowTreeRedirect: false,
    storage,
    fetcher: async () => jsonResponse({
      ok: true,
      treeDir: 'drewo-guzat',
      path: '/drewo-guzat/',
      sessionToken: 'must-not-be-forwarded'
    })
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');
  assert.equal(readFamilySession(storage, 'drewo-reklama'), '');
});

test('rejects a redirected family path that could leave the current site', async () => {
  await assert.rejects(loginFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    login: 'other',
    password: 'family-password',
    treeDir: 'drewo',
    origin: 'https://waydean.ru',
    fetcher: async () => jsonResponse({
      ok: true,
      treeDir: 'other-tree',
      path: '//attacker.example/',
      sessionToken: 'signed-token'
    })
  }), /небезопасный адрес/i);
});

test('verifies saved sessions against the requested tree and rejects an API mismatch', async () => {
  await assert.rejects(verifyFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: 'signed-token',
    fetcher: async () => jsonResponse({ ok: true, treeDir: 'another-tree', role: 'viewer', sessionToken: 'x' })
  }), /другому семейному древу/i);
});

test('classifies a missing/expired family session as requiring a fresh login', async () => {
  await assert.rejects(verifyFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: '',
    fetcher: async () => jsonResponse({ ok: true })
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');

  await assert.rejects(verifyFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: 'expired-token',
    fetcher: async () => jsonResponse({ error: 'Сессия истекла' }, 401)
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_REQUIRED');
});

test('keeps network failures distinguishable from expired family sessions', async () => {
  await assert.rejects(verifyFamilySession({
    endpoint: 'https://example.test/functions/publish-drewo',
    treeDir: 'drewo',
    token: 'signed-token',
    fetcher: async () => { throw new TypeError('offline'); }
  }), error => error.code === 'WAYDEAN_FAMILY_AUTH_UNAVAILABLE');
});

test('resolves invitation codes through the existing public invitation endpoint', async () => {
  let request;
  const invite = await resolveFamilyInvite({
    endpoint: 'https://example.test/functions/publish-drewo',
    code: 'HoTi',
    fetcher: async (_url, options) => {
      request = JSON.parse(options.body);
      return jsonResponse({ ok: true, code: 'hoti', title: 'Семейное древо', treeDir: 'drewo', invitePath: '/t/hoti' });
    }
  });
  assert.deepEqual(request, { action: 'resolve-invite', code: 'hoti' });
  assert.equal(invite.treeDir, 'drewo');
  assert.equal(invite.invitePath, '/t/hoti');
});
