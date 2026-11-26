import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { preparePagesArtifact, verifyPublicTree, isPrivateArtifact, stripEmbeddedFamilyData } from './prepare-pages-artifact.mjs';

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

test('the release build rejects legacy routes the family API does not recognize', async t => {
  const {root, put, out} = await fixture(t);
  const source = await readFile(new URL('../drewo/legacy.html', import.meta.url), 'utf8');
  const reader = stripEmbeddedFamilyData(source);
  const family = { treeDir: 'drewo-example', login: 'example', title: 'Example family' };
  await put('trees/registry.json', JSON.stringify({ trees: [] }));
  await put('drewo/legacy.html', reader);
  await put('drewo-example/index.html', reader.replace("var TREE_DIR = 'drewo';", "var TREE_DIR = 'drewo-example';"));

  await preparePagesArtifact(root);
  assert.match(await readFile(join(out, 'drewo-example/index.html'), 'utf8'), /action: 'family-load'/);
  await assert.rejects(preparePagesArtifact(root, out, { release: true }), /unsupported by the API: \/drewo-example\//);
  await missing(out);

  await put('trees/registry.json', JSON.stringify({ trees: [family] }));
  await preparePagesArtifact(root, out, { release: true });
  await access(join(out, 'drewo-example/index.html'));
  await missing(join(out, 'trees/registry.json'));
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


test('all eight legacy reader templates compile after private data removal', async () => {
  const { secureLegacyReader } = await import('./secure-legacy-reader.mjs');
  const { stripEmbeddedFamilyData } = await import('./prepare-pages-artifact.mjs');
  const paths = ['drewo/legacy.html','drewo-adam/legacy.html','drewo-dada-yurt/legacy.html',
    'drewo-eldarovy/legacy.html','drewo-guzat/legacy.html','drewo-reklama/legacy.html',
    'drewo-covza/index.html','drewo-shahiid-nek/index.html'];
  for (const path of paths) {
    const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    const sanitized = secureLegacyReader(stripEmbeddedFamilyData(source));
    assert.match(sanitized, /action: 'family-load', treeDir: TREE_DIR, sessionToken: token/);
    assert.match(sanitized, /if \(!nekSessionActive\) \{/);
    assert.doesNotMatch(sanitized, /fetch\('(?:family-tree|access)\.json|PHOTO_(?:PUBLIC|FALLBACK)_BASE|photo(?:Thumb|Full)(?:Fallback)?Url\(/);
    for (const match of sanitized.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/\btype\s*=\s*["'](?:application\/json|module)["']/i.test(match[1]) || /\bsrc\s*=/i.test(match[1])) continue;
      if (match[2].trim()) assert.doesNotThrow(() => new Function(match[2]), path);
    }
    assert.throws(() => secureLegacyReader(stripEmbeddedFamilyData(source).replace(
      'var tree = TreeModel.markAllowAdd(JSON.parse(dataEl.textContent), NUTSU_ID);',
      'var tree = null;')), /Legacy reader anchor/);
  }
});

test('legacy access requires verified session and successful tree load before unlock', async () => {
  const { secureLegacyReader } = await import('./secure-legacy-reader.mjs');
  const { stripEmbeddedFamilyData } = await import('./prepare-pages-artifact.mjs');
  const source = await readFile(new URL('../drewo/legacy.html', import.meta.url),'utf8');
  const out = secureLegacyReader(stripEmbeddedFamilyData(source));
  function section(start, end) {
    const i = out.indexOf(start), j = out.indexOf(end,i+start.length);
    assert.ok(i >= 0 && j > i);
    return out.slice(i,j);
  }
  const authCode = section('      function applyNekSession() {','      /**\n       * Вход семьи:');
  const loadCode = section('      function fetchRemoteTree() {','      function applyRemoteTreeData(');
  async function trial({token='original',auth={ok:true,treeDir:'drewo',sessionToken:'refreshed',role:'editor'},
    remote={ok:true,treeDir:'drewo',treeJson:'{"id":"synthetic","sons":[]}',fingerprint:'synthetic'},failure=''} = {}) {
    const calls=[], events=[], locks=[];
    let loaded = false;
    const run = new Function('readNekToken','storeNekToken','clearNekToken','setViewLocked','setGateBusy',
      'callPublishApi','rememberSession','applyRemoteTreeData','rememberFingerprintFromTree','TREE_DIR',
      'var nekSessionActive=false;\n' + authCode + loadCode + '\nreturn async()=>({ok:await applyNekSession(),active:nekSessionActive});')(
        ()=>token, v=>{token=v;}, ()=>{token='';},
        v=>{locks.push(v);events.push(v?'lock':'unlock');}, ()=>{},
        async payload=>{calls.push(payload.action);if(failure===payload.action)throw Error('network');return payload.action==='auth'?auth:remote;},
        ()=>{}, ()=>{loaded=true;events.push('loaded');},async()=>{events.push('fingerprinted');return 'synthetic';},'drewo');
    return {...await run(), calls, events, locks, loaded};
  }
  const noToken = await trial({token:''});
  assert.equal(noToken.ok,false); assert.deepEqual(noToken.calls,[]);
  const invalid = await trial({auth:{ok:false}});
  assert.equal(invalid.ok,false); assert.deepEqual(invalid.calls,['auth']); assert.equal(invalid.loaded,false);
  const wrong = await trial({remote:{ok:true,treeDir:'other',treeJson:'{"id":"synthetic"}',fingerprint:'synthetic'}});
  assert.equal(wrong.ok,false); assert.equal(wrong.loaded,false); assert.equal(wrong.locks.at(-1),true);
  const network = await trial({failure:'family-load'});
  assert.equal(network.ok,false); assert.equal(network.loaded,false); assert.equal(network.locks.at(-1),true);
  const malformed = await trial({remote:{ok:true,treeDir:'drewo',treeJson:'{}',fingerprint:'synthetic'}});
  assert.equal(malformed.ok,false); assert.equal(malformed.loaded,false);
  const valid = await trial();
  assert.equal(valid.ok,true); assert.equal(valid.active,true);
  assert.ok(valid.events.indexOf('loaded') < valid.events.indexOf('unlock'));
});
