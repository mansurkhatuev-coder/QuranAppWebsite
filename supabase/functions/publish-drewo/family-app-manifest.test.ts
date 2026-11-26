import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildManifest } from './create-tree.ts';
import { familyAppManifestResponse } from './family-app-manifest.ts';

function request(tree: string, origin = 'https://waydean.ru') {
  const url = new URL('https://example.test/publish-drewo');
  url.search = new URLSearchParams({ action: 'family-manifest', tree, origin, nek: 'synthetic.token' }).toString();
  return familyAppManifestResponse(url);
}

Deno.test('the shared editor uses the same family app ID and a start URL without session data', async () => {
  const response = request('drewo-sample');
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('access-control-allow-origin'), '*');
  assertEquals(response.headers.get('content-type'), 'application/manifest+json; charset=utf-8');
  assertEquals(response.headers.get('cache-control'), 'no-store');
  const manifest = await response.json();
  const previous = JSON.parse(buildManifest('Synthetic family'));
  assertEquals(manifest.id, new URL(previous.start_url, 'https://waydean.ru/drewo-sample/manifest.webmanifest').href);
  assertEquals(manifest.name, 'Древо — семейная родословная');
  const start = new URL(manifest.start_url);
  assertEquals(start.pathname, '/drewo/waydean-preview.html');
  assertEquals(Object.fromEntries(start.searchParams), { source: 'family', familyPath: '/drewo-sample/' });
  assertEquals(start.hash, '');
  assertEquals(manifest.scope, 'https://waydean.ru/drewo/waydean-preview.html');
  assertEquals((await request('drewo-other', 'https://www.waydean.ru').json()).id, 'https://www.waydean.ru/drewo-other/');
});

Deno.test('the manifest rejects external origins and malformed tree paths', () => {
  for (const tree of ['../private', '/drewo-sample/', 'drewo-x/y', 'drewo-a', 'drewo-sample?token=value']) {
    assertEquals(request(tree).status, 400);
  }
  for (const origin of ['', 'https://waydean.ru.example.test', 'https://waydean.ru/path', 'http://waydean.ru']) {
    assertEquals(request('drewo-sample', origin).status, 400);
  }
});
