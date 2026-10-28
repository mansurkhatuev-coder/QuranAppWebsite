import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('specialist test editor stores drafts separately from the preserved Tajweed editor', async () => {
  const current = await readFile(new URL('./editor.js', import.meta.url), 'utf8');
  const legacy = await readFile(new URL('../../tajweed-editor/editor.js', import.meta.url), 'utf8');
  assert.match(current, /quranapp-admin-v2-tajweed-editor-library:v1/);
  assert.match(legacy, /tajweed-azkar-editor:v2/);
  assert.doesNotMatch(current, /tajweed-azkar-editor:v2/);
});
