import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('./sw.js',import.meta.url),'utf8');
function worker() {
  const handlers={},stored=new Map(),deleted=[],precache=[];
  let response=new Response('shell'),offline=false;
  const cache={addAll:async urls=>precache.push(...urls),put:async(k,r)=>stored.set(k,r),match:async k=>stored.get(k)};
  vm.runInNewContext(source,{URL,Set,Response,self:{
    location:new URL('https://example.test/trees/sw.js'),addEventListener:(e,f)=>handlers[e]=f,
    skipWaiting:async()=>{},clients:{claim:async()=>{}}
  },caches:{open:async()=>cache,keys:async()=>['waydean-trees-v10','waydean-trees-v11','other-app'],delete:async k=>deleted.push(k)},
  fetch:async()=>{if(offline)throw Error('offline');return response.clone()}});
  return{stored,deleted,precache,setResponse:r=>response=r,setOffline:()=>offline=true,
    fetch(path,mode='cors',method='GET'){let p;handlers.fetch({request:{url:new URL(path,'https://example.test/').href,mode,method},respondWith:x=>p=x});return p},
    event(name){let p;handlers[name]({waitUntil:x=>p=x});return p}};
}
test('allowlisted shell is cached',async()=>{const w=worker();assert.equal((await w.fetch('/trees/trees.js?v=15')).status,200);assert.equal(w.stored.size,1)});
test('private resources and POST bypass cache',()=>{const w=worker();for(const p of ['/trees/registry.json','/drewo/family-tree.json','/drewo/photos/a.jpg','/drewo/backups/manifest.json','/trees/secret.json','/functions/v1/publish-drewo','https://other.test/trees/trees.js?v=15'])assert.equal(w.fetch(p),undefined,p);assert.equal(w.fetch('/trees/trees.js?v=15','cors','POST'),undefined)});
test('private and no-store responses never cached',async()=>{const w=worker();for(const h of ['private, max-age=60','no-store']){w.setResponse(new Response('private',{headers:{'Cache-Control':h}}));await w.fetch('/trees/trees.js?v=15');assert.equal(w.stored.size,0)}});
test('offline shell fallback works',async()=>{const w=worker();await w.fetch('/trees/?login=1','navigate');assert.equal(w.stored.has('https://example.test/trees/index.html'),true);w.setOffline();assert.equal((await w.fetch('/trees/','navigate')).status,200)});
test('activation removes only outdated cabinet caches',async()=>{const w=worker();await w.event('activate');assert.deepEqual(w.deleted,['waydean-trees-v10'])});
test('precache excludes private data',async()=>{const w=worker();await w.event('install');assert.equal(w.precache.length,13);assert.equal(w.precache.some(p=>/registry|family-tree|backups|photos/.test(p)),false)});
