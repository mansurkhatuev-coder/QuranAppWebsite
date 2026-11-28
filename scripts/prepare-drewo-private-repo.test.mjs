import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { prepareDrewoPrivateRepo } from './prepare-drewo-private-repo.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'drewo-private-stage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'checkout');
  await mkdir(source);
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  const put = async (path, data) => {
    const file = join(source, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  };
  for (const dir of ['drewo-reklama', 'drewo-example', 'drewo-unregistered']) {
    await put(`${dir}/index.html`, '<script id="tree-data">{"id":"synthetic"}</script>');
    await put(`${dir}/family-tree.json`, '{"id":"synthetic"}');
    await put(`${dir}/access.json`, '{}');
  }
  await put('trees/registry.json', JSON.stringify({ trees: [{ treeDir: 'drewo-example', login: 'example', title: 'Example' }] }));
  await put('_private/credentials.vault.json', '{"synthetic":true}');
  await put('drewo-example/backups/manifest.json', '{"items":[]}');
  await put('drewo-example/backups/fixture.json', '{"snapshot":"synthetic"}');
  await put('drewo-example/photos/пример.jpg', Buffer.from([255, 216, 255, 0, 255, 217]));
  await put('drewo-example/push-subscriptions.json', '[]');
  for (const name of ['sw.js', 'bg.jpg', 'icon-192.png', 'icon-512.png']) {
    await put(`drewo-reklama/${name}`, 'synthetic template');
  }
  await put('atlas/index.html', 'public atlas');
  await put('_private/other-project.json', 'unrelated fixture');
  git('add', '.');
  git('commit', '-m', 'Synthetic migration inputs');
  return { root, source, put, git };
}

test('copies the pinned snapshot, backups, photos and template byte for byte', async t => {
  const { root, source, put, git } = await fixture(t);
  const ref = git('rev-parse', 'HEAD');
  await put('drewo-example/family-tree.json', '{"id":"local edit"}');
  git('add', '.');
  git('commit', '-m', 'Synthetic concurrent edit');
  const destination = join(root, 'private-copy');
  const result = await prepareDrewoPrivateRepo({ source, ref, destination });
  assert.deepEqual(result, { commit: ref, trees: 3, outsideRegistry: 1, registryAndVault: 2,
    familyFiles: 10, backups: 2, photos: 1, templateAssets: 4, verifiedCopy: true });
  assert.equal(await readFile(join(destination, 'drewo-example/family-tree.json'), 'utf8'), '{"id":"synthetic"}');
  assert.equal(await readFile(join(source, 'drewo-example/family-tree.json'), 'utf8'), '{"id":"local edit"}');
  assert.deepEqual(await readFile(join(destination, 'drewo-example/photos/пример.jpg')), Buffer.from([255, 216, 255, 0, 255, 217]));
  assert.equal((await stat(destination)).mode & 0o777, 0o700);
  assert.equal((await stat(join(destination, '_private/credentials.vault.json'))).mode & 0o777, 0o600);
  for (const path of ['atlas/index.html', '_private/other-project.json', '.git']) {
    await assert.rejects(access(join(destination, path)), { code: 'ENOENT' });
  }
});

test('inventory writes no files and an existing destination is protected', async t => {
  const { root, source } = await fixture(t);
  const destination = join(root, 'outside');
  const report = await prepareDrewoPrivateRepo({ source });
  assert.equal(report.verifiedCopy, false);
  await assert.rejects(access(destination), { code: 'ENOENT' });
  await mkdir(destination);
  await writeFile(join(destination, 'keep'), 'unchanged');
  await assert.rejects(prepareDrewoPrivateRepo({ source, destination }), { code: 'EEXIST' });
  assert.equal(await readFile(join(destination, 'keep'), 'utf8'), 'unchanged');
  await assert.rejects(prepareDrewoPrivateRepo({ source, destination: join(source, 'staging') }), /outside the source/);
});

test('missing tree snapshots and symlinks abort before creating a copy', async t => {
  const { root, source, git } = await fixture(t);
  const destination = join(root, 'copy');
  git('rm', 'drewo-example/family-tree.json');
  git('commit', '-m', 'Remove synthetic snapshot');
  await assert.rejects(prepareDrewoPrivateRepo({ source, destination }), /explicit snapshot/);
  await symlink('../drewo-unregistered/family-tree.json', join(source, 'drewo-example/family-tree.json'));
  git('add', '.');
  git('commit', '-m', 'Add synthetic symlink');
  await assert.rejects(prepareDrewoPrivateRepo({ source, destination }), /non-regular Git object/);
  await assert.rejects(access(destination), { code: 'ENOENT' });
});
