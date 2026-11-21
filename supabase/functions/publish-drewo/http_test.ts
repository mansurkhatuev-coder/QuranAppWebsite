import { corsHeaders, jsonResponse } from './http.ts';

Deno.test('private API JSON responses cannot be cached', async () => {
  const response = jsonResponse({ treeJson: 'synthetic' });
  if (response.headers.get('Cache-Control') !== 'no-store') {
    throw new Error('API JSON response must disable caching');
  }
  if (response.headers.get('Content-Type') !== 'application/json') {
    throw new Error('API JSON response must keep its content type');
  }
  if (response.headers.get('Access-Control-Allow-Origin') !== corsHeaders['Access-Control-Allow-Origin']) {
    throw new Error('API JSON response must preserve the configured CORS headers');
  }
  if (await response.text() !== JSON.stringify({ treeJson: 'synthetic' })) {
    throw new Error('API JSON response body changed unexpectedly');
  }
});
