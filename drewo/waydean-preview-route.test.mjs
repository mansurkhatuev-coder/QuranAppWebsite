import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as previewRoute from './waydean-preview-route.mjs';
import { accountPreviewUrl, isFamilyPreviewRoute, previewUrlForMode, resolveFamilyPreviewRoute } from './waydean-preview-route.mjs';

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

test('refresh links update the cache key while preserving the current tree and access route', () => {
  assert.equal(typeof previewRoute.buildPreviewReloadUrl, 'function');
  assert.equal(previewRoute.buildPreviewReloadUrl(
    'https://waydean.ru/drewo/waydean-preview.html?state=path&person=hoti-1&source=account&refresh=old',
    1_798_000_000_123
  ), 'https://waydean.ru/drewo/waydean-preview.html?state=path&person=hoti-1&source=account&refresh=1798000000123');
});

test('the explicit refresh action is wired to a draft and in-progress-save guard', () => {
  const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');
  assert.match(html, /id="moreRefresh"/);
  assert.match(script, /#moreRefresh'\)\.addEventListener\('click', reloadPreviewPage\)/);
  assert.match(script, /editStatus === 'saving'/);
  assert.match(script, /hasUncommittedDraft\(\) && !window\.confirm/);
  assert.match(script, /buildPreviewReloadUrl\(location\.href, Date\.now\(\)\)/);
});

test('the new tree menu keeps the existing trees management cabinet reachable', () => {
  const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');
  assert.match(html, /id="moreTreesCabinet"/);
  assert.match(script, /#moreTreesCabinet'\)\.addEventListener\('click'/);
  assert.match(script, /new URL\('\.\.\/trees\/', location\.href\)/);
});

test('family login is explicit or comes from a signed session/invite without replacing admin login', () => {
  assert.equal(isFamilyPreviewRoute('?source=family&state=all-tree'), true);
  assert.equal(isFamilyPreviewRoute('?nek=signed-token'), true);
  assert.equal(isFamilyPreviewRoute('?invite=hoti'), true);
  assert.equal(isFamilyPreviewRoute('?source=account&nek=signed-token'), false);
  assert.equal(isFamilyPreviewRoute('?state=all-tree'), false);
});

test('local family URLs fall back to the local tree and strip live credentials from the address', () => {
  assert.deepEqual(resolveFamilyPreviewRoute(
    'http://127.0.0.1:8784/drewo/waydean-preview.html?state=all-tree&source=family&nek=secret&invite=private',
    '127.0.0.1'
  ), {
    enabled: false,
    href: 'http://127.0.0.1:8784/drewo/waydean-preview.html?state=all-tree'
  });
  assert.equal(resolveFamilyPreviewRoute(
    'https://waydean.ru/drewo/waydean-preview.html?source=family&state=all-tree',
    'waydean.ru'
  ).enabled, true);
});

test('family routes are disabled on every non-production host and strip signed tokens', () => {
  assert.deepEqual(resolveFamilyPreviewRoute(
    'https://preview.example/drewo/waydean-preview.html?state=all-tree&source=family&nek=secret&invite=private',
    'preview.example'
  ), {
    enabled: false,
    href: 'https://preview.example/drewo/waydean-preview.html?state=all-tree'
  });
  assert.equal(resolveFamilyPreviewRoute(
    'https://waydean.ru/drewo/waydean-preview.html?source=family&state=all-tree',
    'waydean.ru'
  ).enabled, true);
});

test('production share links open the live tree and strip session or invite parameters', () => {
  assert.equal(typeof previewRoute.buildTreeSharePayload, 'function');
  const payload = previewRoute.buildTreeSharePayload({
    href: 'https://waydean.ru/drewo/waydean-preview.html?state=all-tree&source=account&nek=secret-token&invite=private',
    title: 'WAYDEAN',
    localPreview: false
  });
  assert.deepEqual(payload, {
    title: 'WAYDEAN',
    text: 'WAYDEAN — семейное древо',
    url: 'https://waydean.ru/drewo/'
  });
  assert.equal(JSON.stringify(payload).includes('secret-token'), false);
});

test('local share links retain the preview state but remove refresh and access tokens', () => {
  assert.equal(typeof previewRoute.buildTreeSharePayload, 'function');
  const payload = previewRoute.buildTreeSharePayload({
    href: 'http://127.0.0.1:8784/drewo/waydean-preview.html?state=path&refresh=one&source=family&nek=secret-token&invite=private#person',
    title: 'WAYDEAN',
    localPreview: true
  });
  assert.equal(payload.url, 'http://127.0.0.1:8784/drewo/waydean-preview.html?state=path');
  assert.equal(payload.text, 'WAYDEAN — локальный просмотр семейного древа');
  assert.equal(JSON.stringify(payload).includes('secret-token'), false);
});

test('non-production hosted previews share their own route without deployment-only query parameters', () => {
  const payload = previewRoute.buildTreeSharePayload({
    href: 'https://preview.example/drewo/waydean-preview.html?state=all-tree&refresh=build-7&source=account',
    title: 'WAYDEAN',
    localPreview: false
  });
  assert.equal(payload.url, 'https://preview.example/drewo/waydean-preview.html?state=all-tree');
});

test('native share cancellation stays quiet and other failures fall back to copying', async () => {
  assert.equal(typeof previewRoute.shareTreeLink, 'function');
  const payload = { title: 'WAYDEAN', text: 'WAYDEAN — семейное древо', url: 'https://waydean.ru/drewo/' };
  const copied = [];
  let sharedPayload = null;
  assert.equal(await previewRoute.shareTreeLink({
    payload,
    share: async value => { sharedPayload = value; },
    copy: async text => copied.push(text)
  }), 'shared');
  assert.equal(sharedPayload, payload);
  assert.deepEqual(copied, []);

  assert.equal(await previewRoute.shareTreeLink({
    payload,
    share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); },
    copy: async text => copied.push(text)
  }), 'cancelled');
  assert.deepEqual(copied, []);

  assert.equal(await previewRoute.shareTreeLink({
    payload,
    share: async () => { throw new Error('share unavailable'); },
    copy: async text => copied.push(text)
  }), 'copied');
  assert.deepEqual(copied, ['WAYDEAN — семейное древо\nhttps://waydean.ru/drewo/']);
});

test('the family login and sign-out controls remain separate from the admin account form', () => {
  const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');
  const familyAuth = readFileSync(new URL('./waydean-preview-family-auth.mjs', import.meta.url), 'utf8');

  assert.match(html, /id="waydeanFamilyLoginForm"/);
  assert.match(html, /id="familyLogout"/);
  assert.match(html, /source=family&amp;state=all-tree/);
  assert.match(html, /source=account&amp;state=all-tree/);
  assert.match(familyAuth, /action: 'auth'/);
  assert.match(script, /resolveFamilyInvite/);
  assert.match(script, /familySessionTokenMemory/);
});

test('the local offline cache precaches the current preview entry modules', () => {
  const html = readFileSync(new URL('./waydean-preview.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('./waydean-preview.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('./waydean-preview-sw.js', import.meta.url), 'utf8');
  const entryScript = html.match(/import\('\.\/(waydean-preview\.js\?v=[^']+)'\)/)?.[1];
  const cameraModule = script.match(/from '\.\/(waydean-preview-camera\.mjs\?v=[^']+)'/)?.[1];
  const versionedModules = [...script.matchAll(/from '\.\/([^']+\.mjs\?v=[^']+)'/g)].map(match => match[1]);

  assert.ok(entryScript, 'preview HTML should use a versioned app script');
  assert.ok(cameraModule, 'preview app should use a versioned camera module');
  assert.ok(versionedModules.some(module => module.startsWith('waydean-preview-pwa.mjs?')), 'preview app should use a versioned PWA module');
  assert.ok(worker.includes(`'./${entryScript}'`), 'offline cache should precache the current app script');
  assert.ok(worker.includes(`'./${cameraModule}'`), 'offline cache should precache the current camera module');
  for (const module of versionedModules) {
    assert.ok(worker.includes(`'./${module}'`), `offline cache should precache the current module URL: ${module}`);
  }
  assert.ok(worker.includes("'./waydean-preview-route.mjs?v=family-route-5'"));
  assert.ok(worker.includes("'./waydean-preview-family-auth.mjs?v=family-auth-1'"));
  assert.match(worker, /CACHE_NAME = 'waydean-preview-shell-v\d+'/);
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
