import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadRouting() {
  const source = await readFile(new URL('./admin-return-routing.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, URL });
  return window.AdminReturnRouting;
}

test('return target only allows the exact same-origin V2 route', async () => {
  const routing = await loadRouting();
  const origin = 'https://waydean.ru';
  assert.equal(routing.resolveTarget('/admin-v2/', origin), `${origin}/admin-v2/`);
  assert.equal(routing.resolveTarget('https://attacker.example/admin-v2/', origin), null);
  assert.equal(routing.resolveTarget('/admin-v2/?external=1', origin), null);
  assert.equal(routing.resolveTarget('/admin-v2/../admin/', origin), null);
});

test('login URL carries only the allowlisted target', async () => {
  const routing = await loadRouting();
  const origin = 'https://waydean.ru';
  assert.equal(routing.loginUrl('/admin-v2/', origin), `${origin}/admin/?returnTo=%2Fadmin-v2%2F`);
  assert.equal(routing.loginUrl('https://attacker.example/', origin), `${origin}/admin/`);
});
