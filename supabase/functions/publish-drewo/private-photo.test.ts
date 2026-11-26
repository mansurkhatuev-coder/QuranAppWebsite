import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { slugifyRootId } from './create-tree.ts';
import { photoFileCandidates, photoMediaType, decodeGithubPhoto, MAX_PHOTO_BYTES } from './private-photo.mjs';

Deno.test('photo names are scoped, compatible and reject path traversal', () => {
  assertEquals(photoFileCandidates('person-1', 'thumbnail'), ['person-1-thumb.jpg','person-1-thumb.webp','person-1.jpg']);
  assertEquals(photoFileCandidates('person.1', 'full'), ['person.1.jpg']);
  for (const id of ['../private','a/b','a%2fb','а\\б','а/б','а%2fб','..','', 'a'.repeat(82)]) {
    assertEquals(photoFileCandidates(id, 'full'), []);
  }
  assertEquals(photoFileCandidates('person','unknown'),[]);
});
Deno.test('accepts the Cyrillic ID assigned by the tree creation wizard', () => {
  const id = slugifyRootId('Фёдор Примеров');
  assertEquals(photoFileCandidates(id, 'full'), ['фёдор-примеров.jpg']);
  assertEquals(photoFileCandidates(id, 'thumbnail')[0], 'фёдор-примеров-thumb.jpg');
});
Deno.test('only bounded JPEG or WebP payloads are recognized', () => {
  const jpg = Uint8Array.of(255,216,255,224,0,0,0,0,0,0,255,217);
  const webp = Uint8Array.of(82,73,70,70,0,0,0,0,87,69,66,80);
  assertEquals(photoMediaType(jpg),'image/jpeg');
  assertEquals(photoMediaType(webp),'image/webp');
  assertEquals(photoMediaType(new Uint8Array(12)),null);
  assertEquals(photoMediaType(new Uint8Array(MAX_PHOTO_BYTES+1)),null);
  const content = btoa(String.fromCharCode(...jpg));
  const file = {type:'file',encoding:'base64',size:jpg.length,content};
  assertEquals(decodeGithubPhoto(file),{contentType:'image/jpeg',contentBase64:content});
  assertEquals(decodeGithubPhoto({...file,size:100}),null);
  assertEquals(decodeGithubPhoto({...file,type:'symlink'}),null);
  assertEquals(decodeGithubPhoto({...file,content:'invalid!'}),null);
});
