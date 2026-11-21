import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { preparePagesArtifact } from './prepare-pages-artifact.mjs';

test('publishes the site while removing private family snapshots and embedded payloads', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'drewo-pages-'));
  const source = join(temp, 'source');
  const output = join(source, 'dist', 'pages');
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(join(source, 'drewo', 'backups'), { recursive: true });
  await mkdir(join(source, 'drewo', 'photos'), { recursive: true });
  await mkdir(join(source, 'drewo-reklama'), { recursive: true });
  await writeFile(join(source, 'drewo', 'index.html'), '<main>family</main><script id="tree-data" type="application/json">PRIVATE_FIXTURE</script><script id="activity-log">PRIVATE_ACTIVITY</script>');
  await writeFile(join(source, 'drewo', 'family-tree.json'), '{"fixture":"private"}');
  await writeFile(join(source, 'drewo', 'access.json'), '{"passwordHash":"fixture"}');
  await writeFile(join(source, 'drewo', 'backups', 'old.html'), 'PRIVATE_BACKUP');
  await writeFile(join(source, 'drewo', 'photos', 'person.jpg'), 'PRIVATE_PHOTO');
  await writeFile(join(source, 'drewo-reklama', 'index.html'), '<script id="tree-data">SYNTHETIC_DEMO</script>');
  await writeFile(join(source, 'drewo-reklama', 'family-tree.json'), '{"fixture":"demo"}');
  await writeFile(join(source, 'atlas.json'), '{"public":true}');

  await preparePagesArtifact(source, output);

  const privatePage = await readFile(join(output, 'drewo', 'index.html'), 'utf8');
  assert.match(privatePage, /<main>family<\/main>/);
  assert.doesNotMatch(privatePage, /PRIVATE_FIXTURE|PRIVATE_ACTIVITY/);
  await assert.rejects(readFile(join(output, 'drewo', 'family-tree.json')));
  await assert.rejects(readFile(join(output, 'drewo', 'access.json')));
  await assert.rejects(readFile(join(output, 'drewo', 'backups', 'old.html')));
  await assert.rejects(readFile(join(output, 'drewo', 'photos', 'person.jpg')));
  assert.equal(await readFile(join(output, 'drewo-reklama', 'family-tree.json'), 'utf8'), '{"fixture":"demo"}');
  assert.equal(await readFile(join(output, 'atlas.json'), 'utf8'), '{"public":true}');
});

test('all legacy family viewers use server-authenticated loading instead of static private files', async () => {
  const root = new URL('../', import.meta.url);
  for (const directory of ['drewo', 'drewo-adam', 'drewo-covza', 'drewo-dada-yurt', 'drewo-guzat', 'drewo-shahiid-nek']) {
    const html = await readFile(new URL(`${directory}/index.html`, root), 'utf8');
    assert.doesNotMatch(html, /fetch\(['"]family-tree\.json/);
    assert.doesNotMatch(html, /fetch\(['"]access\.json/);
    assert.match(html, /action: 'family-load', treeDir: TREE_DIR/);
    assert.match(html, /action: 'status', treeDir: TREE_DIR/);
    assert.match(html, /function loadAuthenticatedFamilyTree\(\)[\s\S]*?applyRemoteTreeData\(remoteData\.tree, remoteData\.activityJson\)/);
    assert.match(html, /return hasSession \? loadAuthenticatedFamilyTree\(\) : false/);
    assert.match(html, /function expireNekSession\(\)[\s\S]*?setViewLocked\(true\)/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
    for (const [, attributes, body] of scripts) {
      if (/\btype\s*=\s*(["'])application\/(?:json|ld\+json)\1/i.test(attributes)) continue;
      assert.doesNotThrow(() => new Function(body), `${directory} contains invalid inline JavaScript`);
    }
  }
});

test('the legacy trees cabinet reads only server-generated aggregates', async () => {
  const cabinet = await readFile(new URL('../trees/trees.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cabinet, /family-tree\.json|backups\/manifest\.json/);
  assert.match(cabinet, /overview\?\.personCount/);
  assert.doesNotThrow(() => new Function(cabinet));
});
