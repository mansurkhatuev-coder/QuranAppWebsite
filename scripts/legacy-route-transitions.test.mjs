import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
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
    { origin: 'https://trees.example.test/?returnTo=https://evil.test', routes: [] }
  ];
  for (const manifest of cases) await assert.rejects(
    preparePagesArtifact(artifact, output, { transitionManifest: manifest })
  );
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
