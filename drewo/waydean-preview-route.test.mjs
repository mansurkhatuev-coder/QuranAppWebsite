import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountPreviewUrl, previewUrlForMode } from './waydean-preview-route.mjs';

test('the selected self path stays active when the preview is reopened', () => {
  const nextUrl = previewUrlForMode(
    'http://127.0.0.1:8784/drewo/waydean-preview.html?state=all-tree&person=someone-else&refresh=main-19',
    'path'
  );

  assert.equal(nextUrl, '/drewo/waydean-preview.html?state=path&refresh=main-19');
});

test('returning to the full tree also updates the reopen state', () => {
  const nextUrl = previewUrlForMode(
    'http://127.0.0.1:8784/drewo/waydean-preview.html?state=path&refresh=main-19',
    'all-tree'
  );

  assert.equal(nextUrl, '/drewo/waydean-preview.html?state=all-tree&refresh=main-19');
});

test('production preview URLs enter the admin-account flow and keep the selected view', () => {
  const nextUrl = accountPreviewUrl(
    'https://waydean.ru/drewo/waydean-preview.html?state=all-tree&refresh=main-24'
  );

  assert.equal(nextUrl, '/drewo/waydean-preview.html?state=all-tree&refresh=main-24&source=account');
});

test('the local offline cache precaches the current preview entry modules', () => {
  const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('./waydean-preview-sw.js', import.meta.url), 'utf8');
  const entryScript = html.match(/import\('\.\/(waydean-preview\.js\?v=[^']+)'\)/)?.[1];
  const cameraModule = script.match(/from '\.\/(waydean-preview-camera\.mjs\?v=[^']+)'/)?.[1];

  assert.ok(entryScript, 'preview HTML should use a versioned app script');
  assert.ok(cameraModule, 'preview app should use a versioned camera module');
  assert.ok(worker.includes(`'./${entryScript}'`), 'offline cache should precache the current app script');
  assert.ok(worker.includes(`'./${cameraModule}'`), 'offline cache should precache the current camera module');
  assert.ok(worker.includes("'./waydean-preview-route.mjs?v=account-route-20261016-1'"));
  assert.match(worker, /CACHE_NAME = 'waydean-preview-shell-v14'/);
});

test('the offline cache contains every versioned preview stylesheet referenced by the page', () => {
  const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('./waydean-preview-sw.js', import.meta.url), 'utf8');
  const stylesheetUrls = [...html.matchAll(/href="(waydean-preview(?:-[^"]+)?\.css(?:\?[^"]+)?)"/g)].map(match => match[1]);

  assert.ok(stylesheetUrls.length > 0);
  for (const stylesheet of stylesheetUrls) {
    assert.ok(worker.includes(`'./${stylesheet}'`), `offline cache should use the current stylesheet URL: ${stylesheet}`);
  }
});
