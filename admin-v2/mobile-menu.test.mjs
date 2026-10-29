import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

test('mobile navigation opens, closes after choosing a section and closes on Escape', async () => {
  const listeners = {};
  const classes = new Set();
  const sidebar = { classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) }, contains: node => node.inside === true };
  const trigger = { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, addEventListener(type, fn) { listeners.trigger = fn; } };
  const document = { getElementById: id => id === 'mobile-menu-trigger' ? trigger : sidebar, addEventListener(type, fn) { listeners[type] = fn; } };
  vm.runInNewContext(await readFile(new URL('./mobile-menu.js', import.meta.url), 'utf8'), { document });
  listeners.trigger();
  assert.equal(trigger.attrs['aria-expanded'], 'true');
  assert.ok(classes.has('is-mobile-open'));
  listeners.click({ target: { inside: true, closest: () => ({}) } });
  assert.equal(trigger.attrs['aria-expanded'], 'false');
  listeners.trigger();
  listeners.keydown({ key: 'Escape' });
  assert.equal(trigger.attrs['aria-expanded'], 'false');
  assert.ok(!classes.has('is-mobile-open'));
});
