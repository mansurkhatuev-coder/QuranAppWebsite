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
  await mkdir(join(source, 'drewo-reklama', 'photos'), { recursive: true });
  await writeFile(join(source, 'drewo', 'index.html'), '<main>family</main><script id="tree-data" type="application/json">PRIVATE_FIXTURE</script><script id="activity-log">PRIVATE_ACTIVITY</script>');
  await writeFile(join(source, 'drewo', 'profile.html'), '<script id=tree-data type=application/json>UNQUOTED_PRIVATE</script>');
  await writeFile(join(source, 'drewo', 'family-tree.json'), '{"fixture":"private"}');
  await writeFile(join(source, 'drewo', 'access.json'), '{"passwordHash":"fixture"}');
  await writeFile(join(source, 'drewo', 'backups', 'old.html'), 'PRIVATE_BACKUP');
  await writeFile(join(source, 'drewo', 'photos', 'person.jpg'), 'PRIVATE_PHOTO');
  await writeFile(join(source, 'drewo-reklama', 'index.html'), '<script id=tree-data>SYNTHETIC_DEMO</script>');
  await writeFile(join(source, 'drewo-reklama', 'family-tree.json'), '{"fixture":"demo"}');
  await writeFile(join(source, 'drewo-reklama', 'photos', 'person.jpg'), 'DEMO_PHOTO');
  await writeFile(join(source, 'atlas.json'), '{"public":true}');

  await preparePagesArtifact(source, output);

  const privatePage = await readFile(join(output, 'drewo', 'index.html'), 'utf8');
  assert.match(privatePage, /<main>family<\/main>/);
  assert.doesNotMatch(privatePage, /PRIVATE_FIXTURE|PRIVATE_ACTIVITY/);
  assert.doesNotMatch(await readFile(join(output, 'drewo', 'profile.html'), 'utf8'), /UNQUOTED_PRIVATE/);
  await assert.rejects(readFile(join(output, 'drewo', 'family-tree.json')));
  await assert.rejects(readFile(join(output, 'drewo', 'access.json')));
  await assert.rejects(readFile(join(output, 'drewo', 'backups', 'old.html')));
  await assert.rejects(readFile(join(output, 'drewo', 'photos', 'person.jpg')));
  await assert.rejects(readFile(join(output, 'drewo-reklama', 'family-tree.json')));
  await assert.rejects(readFile(join(output, 'drewo-reklama', 'photos', 'person.jpg')));
  assert.doesNotMatch(await readFile(join(output, 'drewo-reklama', 'index.html'), 'utf8'), /SYNTHETIC_DEMO/);
  assert.equal(await readFile(join(output, 'atlas.json'), 'utf8'), '{"public":true}');
});

test('family entry points use authenticated loading and the PWA does not cache private snapshots', async () => {
  const root = new URL('../', import.meta.url);
  const directories = ['drewo', 'drewo-adam', 'drewo-covza', 'drewo-dada-yurt', 'drewo-eldarovy', 'drewo-guzat', 'drewo-shahiid-nek'];
  const preview = await readFile(new URL('../drewo/waydean-preview.js', import.meta.url), 'utf8');
  assert.match(preview, /callFamilyTreeAction\('family-load'/);
  assert.doesNotMatch(preview, /`\.\.\/\$\{activeTreeDir\}\/family-tree\.json`/);
  assert.doesNotMatch(preview, /drewo-reklama\/family-tree\.json/);
  assert.match(preview, /demoMode && !familyPreview\)\s*\? '\.\.\/docs\/design\/waydean\/fixtures\/master-tree\.json'/);
  for (const directory of directories) {
    const html = await readFile(new URL(`${directory}/index.html`, root), 'utf8');
    assert.doesNotMatch(html, /fetch\(['"](?:family-tree|access)\.json/);
    if (html.includes(`tree=${directory}`)) assert.match(html, /waydean-preview\.js\?v=private-pages-1/);
    else assert.match(html, /action: 'family-load', treeDir: TREE_DIR/);
  }
  const worker = await readFile(new URL('../drewo/waydean-preview-sw.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../drewo/waydean-preview-pwa.mjs', import.meta.url), 'utf8');
  const version = /const CACHE_NAME = '(waydean-preview-shell-v\d+)'/;
  assert.doesNotMatch(worker, /family-tree\.json|\/photos\//);
  assert.match(worker, version);
  assert.equal(controller.match(version)?.[1], worker.match(version)?.[1]);
  assert.match(controller, /if \(familyApp \|\| !state\.serviceWorkerReady/);
  assert.match(worker, /waydean-preview\.js\?v=private-pages-1/);
});

test('cabinet operations require an authorized operator and public status uses the public projection', async () => {
  const api = await readFile(new URL('../supabase/functions/publish-drewo/index.ts', import.meta.url), 'utf8');
  for (const action of ['hub-overview', 'create-tree', 'hub-credentials', 'hub-credentials-upsert', 'set-billing']) {
    const branch = api.slice(api.indexOf(`if (action === '${action}'`));
    assert.match(branch, /^[^\n]+\n\s*const denied = await hubUserGuard\(request\);\s*if \(denied\) return denied;/);
  }
  assert.match(api, /hubOperatorDenial\(user, Deno\.env\.get\('DREWO_HUB_USER_IDS'\)\)/);
  assert.match(api, /if \(action === 'status'\) \{\s*return jsonResponse\(publicTreeStatus\(treeDir, lockPresentation\(access\)\)\);/);
});

test('the legacy trees cabinet reads only server-generated aggregates', async () => {
  const cabinet = await readFile(new URL('../trees/trees.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cabinet, /family-tree\.json|backups\/manifest\.json/);
  assert.match(cabinet, /overview\?\.personCount/);
  assert.doesNotThrow(() => new Function(cabinet));
});

test('every GitHub Pages publisher builds and uploads the same sanitized artifact', async () => {
  const workflows = await import('node:fs/promises').then(({ readdir }) => readdir(new URL('../.github/workflows/', import.meta.url)));
  assert.ok(workflows.includes('deploy.yml'));
  assert.ok(workflows.includes('deploy-pages-keepalive.yml'));
  for (const workflow of workflows.filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))) {
    const source = await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
    if (!source.includes('actions/upload-pages-artifact')) continue;
    assert.match(source, /node scripts\/prepare-pages-artifact\.mjs/);
    assert.match(source, /path: dist\/pages/);
    assert.match(source, /scripts\/legacy-route-transitions\.test\.mjs/);
    assert.doesNotMatch(source, /path: \.\s*$/m);
  }
});

test('Edge Function deploy workflow only publishes code and never changes auth or project secrets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-supabase-publish-drewo.yml', import.meta.url), 'utf8');
  assert.match(workflow, /supabase functions deploy publish-drewo/);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(workflow, /supabase secrets (?:set|unset)/i);
  assert.doesNotMatch(workflow, /DREWO_PASSWORD|WEBSITE_PUBLISH_TOKEN|DREWO_HUB_EMAILS|GITHUB_TOKEN/);
});
