import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { applyLegacyRouteTransitions } from './legacy-route-transitions.mjs';
import { preparePagesArtifact } from './prepare-pages-artifact.mjs';

test('Pages build transitions only explicit family routes and removes their old assets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'waydean-transition-'));
  const source = join(root, 'source');
  const artifact = join(source, 'dist', 'pages');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(source, 'drewo'), { recursive: true });
  await mkdir(join(source, 'drewo-guzat'), { recursive: true });
  await mkdir(join(source, 'scripts'), { recursive: true });
  await writeFile(join(source, 'drewo', 'index.html'), '<main>Old family</main>');
  await writeFile(join(source, 'drewo', 'viewer.js'), 'old private viewer');
  await writeFile(join(source, 'drewo-guzat', 'index.html'), '<main>Old family</main>');
  await writeFile(join(source, 'scripts', 'legacy-transitions.json'), '{"routes":["internal registry"]}');

  await preparePagesArtifact(source, artifact, { transitionManifest: {
    origin: 'https://trees.example.test',
    routes: [
      { directory: 'drewo', state: 'migrated', treeId: '123e4567-e89b-12d3-a456-426614174000' },
      { directory: 'drewo-guzat', state: 'transferring' }
    ]
  } });

  const moved = await readFile(join(artifact, 'drewo', 'index.html'), 'utf8');
  assert.match(moved, /https:\/\/trees\.example\.test\/t\/123e4567-e89b-12d3-a456-426614174000\//);
  assert.doesNotMatch(moved, /Old family|tree-data|\?nek|<script/i);
  await assert.rejects(readFile(join(artifact, 'drewo', 'viewer.js')));
  const transferring = await readFile(join(artifact, 'drewo-guzat', 'index.html'), 'utf8');
  assert.match(transferring, /Древо переносится/);
  assert.deepEqual(await readdir(join(artifact, 'drewo-guzat')), ['index.html']);
  await assert.rejects(readFile(join(artifact, 'scripts', 'legacy-transitions.json')));
});

test('transition manifest rejects unknown routes, duplicate routes, caller URLs and malformed IDs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'waydean-transition-invalid-'));
  const artifact = join(root, 'artifact');
  const output = join(artifact, 'dist', 'pages');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(artifact, 'drewo'), { recursive: true });
  const validOrigin = 'https://trees.example.test';
  const cases = [
    { origin: validOrigin, routes: [{ directory: '../private', state: 'migrated', treeId: '123e4567-e89b-12d3-a456-426614174000' }] },
    { origin: validOrigin, routes: [{ directory: 'drewo', state: 'transferring', treeId: '123e4567-e89b-12d3-a456-426614174000' }] },
    { origin: validOrigin, routes: [{ directory: 'drewo', state: 'migrated', treeId: 'bad', returnTo: 'https://evil.test' }] },
    { origin: validOrigin, routes: [], replaceNekLanding: 'yes' },
    { origin: 'https://trees.example.test/?returnTo=https://evil.test', routes: [] }
  ];
  for (const manifest of cases) await assert.rejects(
    preparePagesArtifact(artifact, output, { transitionManifest: manifest })
  );
});

test('an opted-in Nek landing opens the new Atlas and old invitation links still open family login', async t => {
  const source = await mkdtemp(join(tmpdir(), 'waydean-nek-landing-'));
  t.after(() => rm(source, { recursive: true, force: true }));
  const artifact = join(source, 'dist', 'pages');
  const entry = join(source, 'nek', 'index.html');
  const html = await readFile(new URL('../nek/index.html', import.meta.url), 'utf8');
  await mkdir(join(source, 'nek'));
  await writeFile(entry, html);
  const manifest = { origin: 'https://trees.example.test', routes: [] };
  await preparePagesArtifact(source, artifact, { transitionManifest: manifest });
  assert.equal(await readFile(join(artifact, 'nek', 'index.html'), 'utf8'), html);
  await preparePagesArtifact(source, artifact, { transitionManifest: { ...manifest, replaceNekLanding: true } });
  const published = await readFile(join(artifact, 'nek', 'index.html'), 'utf8');
  const destination = published.match(/<meta name="drewo-atlas-transition" content="([^"]+)">/)?.[1];
  assert.equal(destination, `${manifest.origin}/atlas/`);
  assert.equal(await readFile(entry, 'utf8'), html);

  const script = await readFile(new URL('../nek/nek.js', import.meta.url), 'utf8');
  const visit = (address, treePath = '/drewo/') => {
    const page = new URL(address, 'https://old.example.test');
    const redirects = [];
    const elements = new Map();
    const handlers = new Map();
    const getElementById = id => {
      if (!elements.has(id)) elements.set(id, {
        value: '', hidden: true, focus() {}, setAttribute() {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(event, handler) { handlers.set(`${id}:${event}`, handler); }
      });
      return elements.get(id);
    };
    const sessions = new Map();
    runInNewContext(script, {
      URL, URLSearchParams,
      document: { querySelector: selector => selector.startsWith('meta') ? { content: destination } : null, getElementById },
      window: {
        location: { search: page.search, hash: page.hash, origin: page.origin,
          replace: target => redirects.push(target), assign: target => redirects.push(target) },
        matchMedia: () => ({ matches: true }), addEventListener() {},
        sessionStorage: { setItem: (key, value) => sessions.set(key, value) }
      },
      navigator: {}, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
      fetch: async () => ({ ok: true, json: async () => ({
        ok: true, treeDir: 'drewo', path: treePath, sessionToken: 'synthetic-session'
      }) })
    });
    return { redirects, getElementById, handlers, sessions };
  };
  assert.deepEqual(visit('/nek/').redirects, ['https://trees.example.test/atlas/']);
  const invite = visit('/nek/?login=1&u=synthetic');
  assert.deepEqual(invite.redirects, []);
  assert.equal(invite.getElementById('login-input').value, 'synthetic');
  invite.getElementById('password-input').value = 'synthetic-password';
  invite.handlers.get('login-panel:submit')({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(invite.redirects, ['/drewo/']);
  assert.equal(invite.sessions.get('nek-session:drewo'), 'synthetic-session');

  const wrongPath = visit('/nek/?login=1&u=synthetic', '/drewo-other/');
  wrongPath.getElementById('password-input').value = 'synthetic-password';
  wrongPath.handlers.get('login-panel:submit')({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(wrongPath.redirects, []);
  assert.equal(wrongPath.sessions.size, 0);
});

test('route writer refuses source directories and any path without the generated-artifact marker', async t => {
  const root = await mkdtemp(join(tmpdir(), 'waydean-transition-guard-'));
  const source = join(root, 'checkout');
  const family = join(source, 'drewo');
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(family, { recursive: true });
  await writeFile(join(family, 'index.html'), 'keep source tree');
  await assert.rejects(preparePagesArtifact(source, family), /dist\/pages/);
  await assert.rejects(applyLegacyRouteTransitions(source, {
    origin: 'https://trees.example.test',
    routes: [{ directory: 'drewo', state: 'transferring' }]
  }), /проверенном dist\/pages/);
  assert.equal(await readFile(join(family, 'index.html'), 'utf8'), 'keep source tree');
});

test('Pages builder refuses linked dist/output paths without touching their targets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'waydean-pages-symlink-'));
  const source = join(root, 'checkout');
  const outside = join(root, 'outside');
  t.after(async () => {
    await unlink(join(source, 'dist', 'pages')).catch(() => {});
    await unlink(join(source, 'dist')).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(source, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'keep.txt'), 'external marker');
  await symlink(outside, join(source, 'dist'), 'junction');
  await assert.rejects(preparePagesArtifact(source, join(source, 'dist', 'pages')), /dist directory/);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'external marker');

  await rm(join(source, 'dist'), { recursive: true, force: true });
  await mkdir(join(source, 'dist'), { recursive: true });
  await symlink(outside, join(source, 'dist', 'pages'), 'junction');
  await assert.rejects(preparePagesArtifact(source, join(source, 'dist', 'pages')), /output path/);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'external marker');
});
