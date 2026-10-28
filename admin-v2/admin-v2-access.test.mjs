import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function runAccess({ hostname, session, getSessionError = null }) {
  const nodes = {
    'app-frame': { hidden: true },
    'access-gate': { hidden: false },
    'access-gate-message': { textContent: '' },
    'access-gate-actions': { hidden: true },
    'access-gate-retry': { addEventListener() {} },
  };
  const mobileNav = { removeAttribute(name) { this.removedAttribute = name; } };
  const redirects = [];
  const window = {
    location: { hostname, origin: `https://${hostname}`, replace: (url) => redirects.push(url) },
    AdminSupabase: {
      isEnabled: () => true,
      getSession: async () => {
        if (getSessionError) throw getSessionError;
        return session;
      },
    },
    AdminReturnRouting: {
      loginUrl: (path) => `https://${hostname}/admin/?returnTo=${encodeURIComponent(path)}`,
    },
  };
  const document = {
    getElementById: (id) => nodes[id],
    querySelector: (selector) => selector === '.mobile-nav' ? mobileNav : null,
  };
  const source = await readFile(new URL('./admin-v2-access.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window, document });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { nodes, mobileNav, redirects };
}

test('production without a session returns through the existing admin login', async () => {
  const result = await runAccess({ hostname: 'waydean.ru', session: null });
  assert.equal(result.redirects[0], 'https://waydean.ru/admin/?returnTo=%2Fadmin-v2%2F');
  assert.equal(result.nodes['app-frame'].hidden, true);
});

test('production session reveals the new admin shell', async () => {
  const result = await runAccess({ hostname: 'waydean.ru', session: { access_token: 'session' } });
  assert.equal(result.nodes['app-frame'].hidden, false);
  assert.equal(result.nodes['access-gate'].hidden, true);
  assert.equal(result.mobileNav.removedAttribute, 'hidden');
  assert.equal(result.redirects.length, 0);
});

test('failed session check keeps the shell hidden and exposes recovery actions', async () => {
  const result = await runAccess({ hostname: 'waydean.ru', session: null, getSessionError: new Error('offline') });
  assert.equal(result.nodes['app-frame'].hidden, true);
  assert.equal(result.nodes['access-gate-actions'].hidden, false);
  assert.equal(result.redirects.length, 0);
});
