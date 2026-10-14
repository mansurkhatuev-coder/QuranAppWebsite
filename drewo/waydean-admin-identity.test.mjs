import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readWaydeanAdminEmail } from './waydean-admin-identity.mjs';

const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');

test('shows which signed-in admin account was denied access', () => {
  assert.match(html, /id="waydeanAccountHint"/, 'the denied-account hint must exist in the page');
  assert.match(app, /readWaydeanAdminEmail/, 'the hint must use the current shared admin session');
});

test('returns only the signed-in account email for the denied-access hint', async () => {
  const email = await readWaydeanAdminEmail({
    getSession: async () => ({
      access_token: 'must-not-be-returned',
      user: { id: 'must-not-be-returned', email: '  admin@example.com  ' },
    }),
  });
  assert.equal(email, 'admin@example.com');
});

test('fails closed when there is no readable admin session', async () => {
  assert.equal(await readWaydeanAdminEmail(null), '');
  assert.equal(await readWaydeanAdminEmail({ getSession: async () => { throw new Error('offline'); } }), '');
});
