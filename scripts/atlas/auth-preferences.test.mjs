import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNT_EMAIL_KEY, FAMILY_LOGIN_KEY, clearFamilyAccess, rememberIdentifier, restoreRememberedIdentifier } from '../../assets/drewo-auth-preferences.mjs';

function fixture(t) {
  function storage() {
    const values = new Map();
    return { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) };
  }
  const values = { localStorage: storage(), sessionStorage: storage(), location: { search: '' } };
  for (const [name, value] of Object.entries(values)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => before ? Object.defineProperty(globalThis, name, before) : delete globalThis[name]);
  }
  return values;
}

test('only the chosen login or email is remembered, and switching starts with a blank form', t => {
  const { localStorage, location } = fixture(t);
  rememberIdentifier(FAMILY_LOGIN_KEY, 'synthetic', true);
  rememberIdentifier(ACCOUNT_EMAIL_KEY, 'fixture@example.test', true);
  assert.deepEqual(JSON.parse(localStorage.getItem(FAMILY_LOGIN_KEY)), { login: 'synthetic' });
  assert.equal(localStorage.getItem(ACCOUNT_EMAIL_KEY), 'fixture@example.test');
  const input = { value: '' }, choice = { checked: false };
  restoreRememberedIdentifier(input, choice, FAMILY_LOGIN_KEY);
  assert.equal(input.value, 'synthetic');
  assert.equal(choice.checked, true);
  const managerEmail = { value: '' }, rememberSession = { checked: false };
  restoreRememberedIdentifier(managerEmail, rememberSession, ACCOUNT_EMAIL_KEY, { checkChoice: false });
  assert.equal(managerEmail.value, 'fixture@example.test');
  assert.equal(rememberSession.checked, false);
  location.search = '?switch=1';
  const empty = { value: '' };
  restoreRememberedIdentifier(empty, { checked: false }, ACCOUNT_EMAIL_KEY);
  assert.equal(empty.value, '');
  rememberIdentifier(FAMILY_LOGIN_KEY, 'synthetic', false);
  assert.equal(localStorage.getItem(FAMILY_LOGIN_KEY), null);
});

test('exit clears access and the atlas handoff for the selected family', t => {
  const { localStorage, sessionStorage } = fixture(t);
  sessionStorage.setItem('nek-session:drewo-sample', 'synthetic');
  sessionStorage.setItem('nek-session:drewo-other', 'separate');
  sessionStorage.setItem('drewo-atlas:family-view', JSON.stringify({ dir: 'drewo-sample' }));
  localStorage.setItem('nek:lastTree', JSON.stringify({ path: '/drewo-sample/' }));
  clearFamilyAccess('drewo-sample');
  assert.equal(sessionStorage.getItem('nek-session:drewo-sample'), null);
  assert.equal(sessionStorage.getItem('nek-session:drewo-other'), 'separate');
  assert.equal(sessionStorage.getItem('drewo-atlas:family-view'), null);
  assert.equal(localStorage.getItem('nek:lastTree'), null);
});
