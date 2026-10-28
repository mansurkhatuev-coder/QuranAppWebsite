import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadGuard() {
  const source = await readFile(new URL('./transition-guard.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window }, { filename: 'transition-guard.js' });
  return window.AdminV2TransitionGuard;
}

test('outer library selection saves before changing active item and rebuilding the editor frame', async () => {
  const source = await readFile(new URL('./prototype.js', import.meta.url), 'utf8');
  const start = source.indexOf('$("#library-list").addEventListener("click"');
  const end = source.indexOf('$("#add-material").addEventListener("click"', start);
  const handler = source.slice(start, end);
  const fence = handler.indexOf('runAfterEmbeddedTajweedSave(() =>');
  const selection = handler.indexOf('state.activeId = reference.id');
  const redraw = handler.indexOf('renderAll();', selection);

  assert.ok(start >= 0 && end > start, 'library click handler exists');
  assert.ok(fence >= 0 && selection > fence, 'save fence wraps active item mutation');
  assert.ok(redraw > selection, 'editor redraw follows the guarded selection');
});

test('runs a transition after the save handshake succeeds, including when no embedded editor is open', async () => {
  const guard = await loadGuard();
  const order = [];
  const run = guard.create(async () => { order.push('save'); return true; });

  const result = await run(() => order.push('transition'));

  assert.equal(result, true);
  assert.deepEqual(order, ['save', 'transition']);
});

test('does not run the transition when saving fails or throws', async () => {
  const guard = await loadGuard();
  const failed = [];
  const run = guard.create(async () => false, { onFailure: () => failed.push('save-failed') });
  let transitions = 0;

  assert.equal(await run(() => { transitions += 1; }), false);
  assert.equal(transitions, 0);
  assert.deepEqual(failed, ['save-failed']);

  const rejected = guard.create(async () => { throw new Error('storage'); });
  assert.equal(await rejected(() => { transitions += 1; }), false);
  assert.equal(transitions, 0);
});

test('ignores overlapping transitions while a save is pending', async () => {
  const guard = await loadGuard();
  let releaseSave;
  const run = guard.create(() => new Promise((resolve) => { releaseSave = resolve; }));
  let transitions = 0;
  const first = run(() => { transitions += 1; });
  const second = await run(() => { transitions += 1; });

  assert.equal(second, false);
  releaseSave(true);
  assert.equal(await first, true);
  assert.equal(transitions, 1);
});
