import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivatePhotoCache, photoResponseBlob } from './waydean-preview-private-photo.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
const payload = {personId:'synthetic',variant:'thumbnail'};
const data = {...payload,contentType:'image/jpeg',contentBase64:'AQIDBA=='};

test('validates the response identity and media type', () => {
  const blob = photoResponseBlob(data,payload);
  assert.equal(blob.type,'image/jpeg');
  assert.equal(blob.size,4);
  for (const change of [{personId:'other'},{variant:'full'},{contentType:'text/html'},{contentBase64:'invalid!'},{contentBase64:''}]) {
    assert.equal(photoResponseBlob({...data,...change},payload),null);
  }
});

test('deduplicates requests and reuses an in-memory result', async () => {
  let calls=0;
  const cache=createPrivatePhotoCache({request:async()=>{calls++;return {};},makeUrl:()=> 'blob:test',revokeUrl:()=>{}});
  const a=cache.load('key',payload), b=cache.load('key',payload);
  assert.equal(a,b);
  assert.equal(await a,'blob:test');
  assert.equal(await cache.load('key',payload),'blob:test');
  assert.equal(calls,1);
});

test('limits concurrent requests and drains the queue', async () => {
  let active=0, max=0, calls=0;
  const finishes=[];
  const cache=createPrivatePhotoCache({limit:2,request:()=>{calls++;active++;max=Math.max(max,active);return new Promise(resolve=>finishes.push(()=>{active--;resolve({});}));},makeUrl:()=> 'blob:'+calls,revokeUrl:()=>{}});
  const requests=Array.from({length:5},(_,i)=>cache.load('key'+i,payload));
  await turn(); assert.equal(calls,2);
  while(finishes.length){finishes.shift()();await turn();}
  await Promise.all(requests);
  assert.equal(max,2);assert.equal(calls,5);
});

test('clear revokes stored URLs and discards pending responses and queued requests', async () => {
  let finish, calls=0;const revoked=[];
  const cache=createPrivatePhotoCache({limit:1,request:()=>{calls++;return calls===1?Promise.resolve({}):new Promise(resolve=>finish=resolve);},makeUrl:()=> 'blob:private',revokeUrl:url=>revoked.push(url)});
  await cache.load('stored',payload);await turn();
  const running=cache.load('running',payload),queued=cache.load('queued',payload);
  await turn();cache.clear();finish({});await turn();
  assert.equal(await running,null);assert.equal(await queued,null);
  assert.equal(cache.get('stored'),null);assert.deepEqual(revoked,['blob:private']);assert.equal(calls,2);
});

test('errors do not persist in the cache and may be retried', async () => {
  let calls=0;
  const cache=createPrivatePhotoCache({request:async()=>{if(++calls===1)throw Error('offline');return {};},makeUrl:()=> 'blob:retry',revokeUrl:()=>{}});
  assert.equal(await cache.load('key',payload),null);await turn();
  assert.equal(await cache.load('key',payload),'blob:retry');assert.equal(calls,2);
});
