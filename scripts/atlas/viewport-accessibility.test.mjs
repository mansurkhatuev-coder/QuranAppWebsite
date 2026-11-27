import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';

const root = new URL('../../', import.meta.url);
const path = relative => new URL(relative, root);

test('Drewo entry routes use responsive viewports and keep user zoom enabled', async () => {
  const registry = JSON.parse(await readFile(path('trees/registry.json'), 'utf8'));
  const pages = new Set([
    'index.html', 'atlas/index.html', 'nek/index.html', 'trees/index.html',
    'drewo/index.html', 'drewo/waydean-preview.html', 'drewo/legacy.html',
    'drewo-covza/index.html', 'drewo-shahiid-nek/index.html', 'join/index.html',
    't/index.html',
  ]);
  for (const {treeDir} of registry.trees) {
    pages.add(`${treeDir}/index.html`);
    pages.add(`${treeDir}/legacy.html`);
  }
  for (const item of await readdir(path('t'), {withFileTypes: true})) {
    if (item.isDirectory()) pages.add(`t/${item.name}/index.html`);
  }

  for (const relative of pages) {
    let html;
    try {
      html = await readFile(path(relative), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' && relative.endsWith('/legacy.html')) continue;
      throw error;
    }
    const meta = html.match(/<meta\b(?=[^>]*\bname=["']viewport["'])[^>]*>/i)?.[0];
    assert.ok(meta, `${relative} must declare a viewport`);
    const content = meta.match(/\bcontent=["']([^"']+)["']/i)?.[1] ?? '';
    assert.match(content, /(?:^|,)\s*width\s*=\s*device-width(?:\s*,|$)/i, `${relative} must size to the device width`);
    assert.match(content, /(?:^|,)\s*initial-scale\s*=\s*1(?:\.0+)?(?:\s*,|$)/i, `${relative} must use the normal initial scale`);
    assert.doesNotMatch(content, /user-scalable\s*=\s*no/i, `${relative} must not disable user zoom`);
    const maxScale = content.match(/(?:maximum-scale|max-scale)\s*=\s*([\d.]+)/i)?.[1];
    assert.ok(maxScale === undefined || Number(maxScale) > 1, `${relative} must allow zooming in`);
  }
});
