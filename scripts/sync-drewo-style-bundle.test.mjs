import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildBundle, isBundleCurrent, sourceFiles } from './sync-drewo-style-bundle.mjs';

test('Waydean CSS bundle is the exact ordered concatenation of its source stylesheets', async () => {
  assert.equal(sourceFiles.length, 23);
  const bundle = await buildBundle();
  const checkedInBundle = await readFile(new URL('../drewo/waydean-preview-bundle.css', import.meta.url), 'utf8');
  assert.equal(await isBundleCurrent(), true);
  assert.equal(checkedInBundle, bundle);

  let offset = 0;
  for (const file of sourceFiles) {
    const marker = `/* ${file} */\n`;
    const markerIndex = bundle.indexOf(marker, offset);
    assert.notEqual(markerIndex, -1, `${file} section marker/order`);
    offset = markerIndex + marker.length;
  }
});
