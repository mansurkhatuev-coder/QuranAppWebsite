import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { preparePagesArtifact, verifyPublicTree, isPrivateArtifact } from './prepare-pages-artifact.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'drewo-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path, value = 'SYNTHETIC_PRIVATE') => {
    const file = join(root, path); await mkdir(dirname(file), { recursive: true }); await writeFile(file, value);
  };
  return { root, put, out: join(root, 'dist/pages') };
}
const missing = file => assert.rejects(access(file), { code: 'ENOENT' });

test('private snapshots, credentials, registry, photos and backups are omitted, including unregistered trees', async t => {
  const {root,put,out} = await fixture(t);
  const paths = ['_private/vault.json','trees/registry.json','trees/credentials.vault.json','drewo/family-tree.json','drewo-covza/photos/a.jpg','drewo-shahiid-nek/backups/a.html','drewo-reklama/access.json','drewo-reklama/family-tree.json','drewo-adam/push-subscriptions.json','drewo-guzat/activity-log.json','nested/DREWO-X/PHOTOS/a.webp','scripts/legacy-transitions.json','scripts/deploy-private.sh','supabase/functions/private/index.ts','drewo/security.test.mjs','Start-Waydean-Local.cmd','.gitignore','.env.local','db.sqlite3'];
  for (const path of paths) await put(path);
  await preparePagesArtifact(root);
  for (const path of paths) { await missing(join(out,path)); assert.equal(await readFile(join(root,path),'utf8'),'SYNTHETIC_PRIVATE'); }
});

test('public atlas, demos, fixture assets and other project files remain available', async t => {
  const {root,put,out} = await fixture(t);
  const paths = ['atlas/index.html','atlas/data/public-summary.json','CNAME','.nojekyll','drewo-reklama/index.html','docs/design/waydean/fixtures/master-tree.json','docs/design/waydean/assets/demo/person.jpg','other-site/photos/banner.webp'];
  for (const path of paths) await put(path,'PUBLIC');
  await preparePagesArtifact(root);
  for (const path of paths) assert.equal(await readFile(join(out,path),'utf8'),'PUBLIC');
});

test('embedded private script blocks are emptied without changing ordinary scripts', async t => {
  const {root,put,out} = await fixture(t);
  const html = '<main>PUBLIC</main><script id="tree-data" type="application/json">PRIVATE_A</script><SCRIPT ID=activity-log>PRIVATE_B</SCRIPT><script id=\'TREE-DATA\'>PRIVATE_C</script><script data-id="tree-data">PUBLIC_JS</script>';
  await put('drewo/legacy.html',html); await put('nested/page.html',html);
  await preparePagesArtifact(root);
  for (const path of ['drewo/legacy.html','nested/page.html']) {
    const clean = await readFile(join(out,path),'utf8');
    assert.doesNotMatch(clean,/PRIVATE_/); assert.match(clean,/PUBLIC_JS/); assert.match(clean,/<main>PUBLIC<\/main>/);
    assert.equal(await readFile(join(root,path),'utf8'),html);
  }
});

test('malformed private HTML aborts the build and removes partial output', async t => {
  const {root,put,out} = await fixture(t);
  await put('index.html','<script id=tree-data>PRIVATE');
  await assert.rejects(preparePagesArtifact(root),/malformed private script/); await missing(out);
});

test('verification refuses injected private files and private directories', async t => {
  const {root,put,out} = await fixture(t);
  await put('index.html','PUBLIC'); await preparePagesArtifact(root);
  await mkdir(join(out,'drewo/photos'),{recursive:true});
  await assert.rejects(verifyPublicTree(out),/Private file or directory/);
  await rm(join(out,'drewo'),{recursive:true}); await writeFile(join(out,'access.json'),'PRIVATE');
  await assert.rejects(verifyPublicTree(out),/Private file or directory/);
});

test('rejects source and output symlinks without modifying their targets', async t => {
  const {root,put,out} = await fixture(t);
  const target = await mkdtemp(join(tmpdir(),'drewo-target-'));
  t.after(()=>rm(target,{recursive:true,force:true}));
  await writeFile(join(target,'sentinel'),'UNCHANGED');
  await symlink(target,join(root,'link'));
  await assert.rejects(preparePagesArtifact(root),/Refusing symlink/); await missing(out);
  await rm(join(root,'link')); await symlink(target,join(root,'dist/pages'));
  await assert.rejects(preparePagesArtifact(root),/regular directory/);
  assert.equal(await readFile(join(target,'sentinel'),'utf8'),'UNCHANGED');
});

test('only the designated output can be replaced; stale output is removed', async t => {
  const {root,put,out} = await fixture(t);
  await put('index.html','PUBLIC'); await put('dist/pages/stale.json','STALE');
  await assert.rejects(preparePagesArtifact(root,join(root,'index.html')),/output must be/);
  await preparePagesArtifact(root); await missing(join(out,'stale.json'));
  assert.equal(await readFile(join(out,'index.html'),'utf8'),'PUBLIC');
});

test('path rules are case-insensitive and distinguish non-family public photos', () => {
  assert.equal(isPrivateArtifact('DREWO-X\\PHOTOS\\person.jpg'),true);
  assert.equal(isPrivateArtifact('Trees/Registry.JSON'),true);
  assert.equal(isPrivateArtifact('other/photos/person.jpg'),false);
  assert.equal(isPrivateArtifact('atlas/data/public-summary.json'),false);
});
