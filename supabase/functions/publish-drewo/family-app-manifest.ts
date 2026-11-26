const SITE_ORIGINS = new Set(['https://waydean.ru', 'https://www.waydean.ru']);
const FAMILY_DIR = /^drewo(?:-[a-z][a-z0-9-]{1,24})?$/;

export function buildFamilyAppManifest(treeDir: string, origin: string) {
  if (!FAMILY_DIR.test(treeDir)) return null;
  const editor = new URL('/drewo/waydean-preview.html', origin);
  const scope = editor.href;
  editor.searchParams.set('source', 'family');
  editor.searchParams.set('familyPath', `/${treeDir}/`);
  return {
    // A previously published family manifest used its directory as its implicit ID.
    id: new URL(`/${treeDir}/`, origin).href,
    name: 'Древо — семейная родословная',
    short_name: 'Древо',
    start_url: editor.href,
    scope,
    display: 'standalone',
    background_color: '#12262f',
    theme_color: '#12262f',
    lang: 'ru',
    icons: [192, 512].map(size => ({
      src: new URL(`/drewo/icon-${size}.png`, origin).href,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
  };
}

export function familyAppManifestResponse(url: URL): Response {
  const origin = url.searchParams.get('origin') || '';
  const manifest = SITE_ORIGINS.has(origin)
    ? buildFamilyAppManifest(url.searchParams.get('tree') || '', origin)
    : null;
  return new Response(manifest ? JSON.stringify(manifest) : null, {
    status: manifest ? 200 : 400,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
