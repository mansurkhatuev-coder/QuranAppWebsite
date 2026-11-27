import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDrewoManagerAuth,
  DREWO_MANAGER_IGNORE_LEGACY_KEY,
  DREWO_MANAGER_STORAGE_KEY,
  hasDrewoManagerSession
} from '../../assets/drewo-manager-auth.mjs';

function makeStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function browser(t, { legacyAuth = null } = {}) {
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const clients = [];
  const window = {
    SUPABASE_CONFIG: { url: 'https://example.test', anonKey: 'synthetic-anon-key' },
    supabase: {
      createClient(url, anonKey, options) {
        const { storage, storageKey } = options.auth;
        clients.push({ url, anonKey, options });
        return {
          auth: {
            getSession: async () => ({ data: { session: JSON.parse(storage.getItem(storageKey) || 'null') } }),
            signInWithPassword: async ({ email, password }) => {
              if (password !== 'synthetic-password') return { error: new Error('Invalid login') };
              const session = {
                access_token: `token-${email}`,
                refresh_token: `refresh-${email}`,
                expires_at: Date.now() / 1000 + 3600,
                user: { email },
              };
              storage.setItem(storageKey, JSON.stringify(session));
              return { data: { session }, error: null };
            },
            signOut: async () => {
              storage.removeItem(storageKey);
              return { error: null };
            },
          },
        };
      },
    },
  };
  for (const [name, value] of Object.entries({ window, localStorage, sessionStorage })) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => before ? Object.defineProperty(globalThis, name, before) : delete globalThis[name]);
  }
  return { localStorage, sessionStorage, clients, auth: createDrewoManagerAuth({ legacyAuth }) };
}

test('unchecked login stays in this tab and survives navigation in the same tab', async t => {
  const { localStorage, sessionStorage, clients, auth } = browser(t);
  await auth.signIn('fixture@example.test', 'synthetic-password', false);

  const storageKey = clients[0].options.auth.storageKey;
  assert.match(storageKey, /^waydean-trees-tab-auth-/);
  assert.equal(clients[0].options.auth.storage, sessionStorage);
  assert.equal(clients[0].options.auth.persistSession, true);
  assert.equal(localStorage.getItem(DREWO_MANAGER_STORAGE_KEY), null);
  assert.equal((await auth.getSession()).access_token, 'token-fixture@example.test');
  assert.equal(hasDrewoManagerSession(), true);

  const afterNavigation = createDrewoManagerAuth();
  assert.equal((await afterNavigation.getSession()).access_token, 'token-fixture@example.test');
});

test('checked login shares the persistent manager session with the cabinet and editor', async t => {
  const { localStorage, clients, auth } = browser(t);
  await auth.signIn('fixture@example.test', 'synthetic-password', true);

  assert.equal(clients[0].options.auth.storage, localStorage);
  assert.equal(clients[0].options.auth.storageKey, DREWO_MANAGER_STORAGE_KEY);
  assert.equal(JSON.parse(localStorage.getItem(DREWO_MANAGER_STORAGE_KEY)).user.email, 'fixture@example.test');
  const otherPage = createDrewoManagerAuth();
  assert.equal((await otherPage.getSession()).access_token, 'token-fixture@example.test');
});

test('checked login still works when this browser blocks tab storage', async t => {
  const { localStorage, sessionStorage, clients, auth } = browser(t);
  sessionStorage.getItem = () => { throw new Error('storage disabled'); };
  sessionStorage.setItem = () => { throw new Error('storage disabled'); };
  await auth.signIn('fixture@example.test', 'synthetic-password', true);
  assert.equal(clients[0].options.auth.storage, localStorage);
  assert.equal((await auth.getSession()).access_token, 'token-fixture@example.test');
});

test('failed login does not save a manager session', async t => {
  const { localStorage, sessionStorage, auth } = browser(t);
  await assert.rejects(auth.signIn('fixture@example.test', 'wrong-password', true), /Invalid login/);
  assert.equal(localStorage.getItem(DREWO_MANAGER_STORAGE_KEY), null);
  assert.equal(sessionStorage.getItem(DREWO_MANAGER_IGNORE_LEGACY_KEY), null);
});

test('choosing tab-only login clears a previous persistent account on this device', async t => {
  const { localStorage, clients, auth } = browser(t);
  localStorage.setItem(DREWO_MANAGER_STORAGE_KEY, JSON.stringify({
    access_token: 'old-token', refresh_token: 'old-refresh', expires_at: Date.now() / 1000 + 3600,
    user: { email: 'old@example.test' },
  }));
  assert.equal((await auth.getSession()).access_token, 'old-token');

  await auth.signIn('new@example.test', 'synthetic-password', false);
  assert.equal(localStorage.getItem(DREWO_MANAGER_STORAGE_KEY), null);
  assert.equal(clients.some(client => client.options.auth.storageKey === DREWO_MANAGER_STORAGE_KEY), true);
  assert.equal((await createDrewoManagerAuth().getSession()).access_token, 'token-new@example.test');
});

test('legacy editor session works once and explicit sign-out prevents its return', async t => {
  let legacySession = { access_token: 'legacy-token', user: { email: 'legacy@example.test' } };
  let legacySignOuts = 0;
  const legacyAuth = {
    getSession: async () => legacySession,
    signOut: async () => { legacySignOuts += 1; legacySession = null; },
  };
  const { localStorage, auth } = browser(t, { legacyAuth });
  assert.equal((await auth.getSession()).access_token, 'legacy-token');
  await auth.signOut();
  assert.equal(legacySignOuts, 1);
  assert.equal(localStorage.getItem(DREWO_MANAGER_IGNORE_LEGACY_KEY), '1');
  assert.equal(await auth.getSession(), null);
});

test('new manager login suppresses stale legacy fallback', async t => {
  let legacyReads = 0;
  const legacyAuth = { getSession: async () => { legacyReads += 1; return { access_token: 'legacy-token' }; } };
  const { auth } = browser(t, { legacyAuth });
  await auth.signIn('new@example.test', 'synthetic-password', false);
  assert.equal((await createDrewoManagerAuth({ legacyAuth }).getSession()).access_token, 'token-new@example.test');
  assert.equal(legacyReads, 0);
});
