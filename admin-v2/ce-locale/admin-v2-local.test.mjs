import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('parent reports a CE draft saved only after the editor confirms a successful local save', async () => {
  const source = await readFile(new URL('./admin-v2-local.js', import.meta.url), 'utf8');
  const messages = [];
  let handleMessage;
  const window = {
    parent: { postMessage: (message) => messages.push(message) },
    location: { origin: 'http://preview.test' },
    addEventListener: (type, handler) => { if (type === 'message') handleMessage = handler; },
    CeWorkbench: { save: async () => false },
  };
  vm.runInNewContext(source, { window, document: { addEventListener() {} } });
  await handleMessage({ origin: 'http://preview.test', data: { type: 'admin-v2:save-draft' } });
  assert.deepEqual(messages.map((entry) => entry.type), ['admin-v2:dirty']);

  messages.length = 0;
  window.CeWorkbench.save = async () => true;
  await handleMessage({ origin: 'http://preview.test', data: { type: 'admin-v2:save-draft' } });
  assert.deepEqual(messages.map((entry) => entry.type), ['admin-v2:saved']);
});

test('new CE editor storage keys do not overlap the preserved legacy editor', async () => {
  const current = await readFile(new URL('./workbench.js', import.meta.url), 'utf8');
  const legacy = await readFile(new URL('../../admin/ce-locale/workbench.js', import.meta.url), 'utf8');
  const prefix = current.slice(current.indexOf("  const IS_LOCAL_HOST"), current.indexOf("  const HISTORY_LIMIT"));
  const keyFor = (hostname, search) => vm.runInNewContext(prefix + '\nSTORE_KEY', {global: {location: {hostname, search}}, URLSearchParams});
  assert.equal(keyFor('waydean.ru', ''), 'quranapp_admin_v2_ce_workbench_v1');
  assert.equal(keyFor('127.0.0.1', '?demo=1'), 'quranapp_admin_v2_ce_workbench_demo_v1');
  assert.equal(keyFor('waydean.ru', '?demo=1'), 'quranapp_admin_v2_ce_workbench_v1');
  assert.match(legacy, /quranapp_ce_workbench_v3/);
  assert.doesNotMatch(current, /quranapp_ce_workbench_v3/);
});
