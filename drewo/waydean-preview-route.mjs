const TREE_MODES = new Set(['path', 'branch', 'all-tree']);
const FAMILY_TREE_DIRS = new Set(['drewo', 'drewo-reklama']);

export function initialPreviewView(state, { mobile = false } = {}) {
  const mode = TREE_MODES.has(state) ? state : 'all';
  return {
    mode,
    fit: TREE_MODES.has(state) || mobile
  };
}

export function previewUrlForMode(href, mode) {
  if (mode !== 'path' && mode !== 'all-tree') return null;
  const url = new URL(href);
  url.searchParams.set('state', mode);
  url.searchParams.delete('person');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildPreviewReloadUrl(href, cacheKey = Date.now()) {
  const url = new URL(href);
  url.searchParams.set('refresh', String(cacheKey));
  return url.href;
}

export function accountPreviewUrl(href) {
  const url = new URL(href);
  url.searchParams.set('source', 'account');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isFamilyPreviewRoute(search) {
  const params = new URLSearchParams(search);
  if (params.get('source') === 'account') return false;
  return params.get('source') === 'family' || params.has('nek') || params.has('invite');
}

export function resolveFamilyPreviewRoute(href, hostname) {
  const url = new URL(href);
  const requestedFamily = isFamilyPreviewRoute(url.search);
  const host = String(hostname || url.hostname).trim().toLowerCase().replace(/\.$/, '');
  const isProductionHost = host === 'waydean.ru' || host === 'www.waydean.ru';
  const loopback = isLoopbackHost(host);
  const isAccountRoute = url.searchParams.get('source') === 'account';
  const requestedTreeDir = String(url.searchParams.get('tree') || '').trim().toLowerCase();
  const maySelectTree = !isAccountRoute && (requestedFamily || loopback);
  let treeDir = 'drewo';

  if (maySelectTree && FAMILY_TREE_DIRS.has(requestedTreeDir)) treeDir = requestedTreeDir;
  else url.searchParams.delete('tree');

  if (!isProductionHost) {
    url.searchParams.delete('nek');
    url.searchParams.delete('invite');
    if (url.searchParams.get('source') === 'family') url.searchParams.delete('source');
    if (!loopback) {
      url.searchParams.delete('tree');
      treeDir = 'drewo';
    }
  }

  return {
    enabled: isProductionHost && requestedFamily,
    href: url.href,
    treeDir,
    demoMode: treeDir === 'drewo-reklama' && (isProductionHost ? requestedFamily : loopback)
  };
}

export function isMasterFixtureQuery(search) {
  const fixtures = new URLSearchParams(search).getAll('fixture');
  return fixtures.length === 1 && fixtures[0] === 'master';
}

export function isLoopbackHost(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
}

export function buildTreeSharePayload({ href, title = 'WAYDEAN', localPreview = false, treeDir = 'drewo' } = {}) {
  const sourceUrl = new URL(href);
  const label = String(title || '').trim() || 'WAYDEAN';
  const url = new URL(sourceUrl.href);
  const isProductionHost = ['waydean.ru', 'www.waydean.ru'].includes(sourceUrl.hostname.toLowerCase());
  if (localPreview || !isProductionHost) {
    for (const key of ['refresh', 'source', 'nek', 'invite']) url.searchParams.delete(key);
    url.hash = '';
  } else {
    url.pathname = treeDir === 'drewo-reklama' ? '/drewo-reklama/' : '/drewo/';
    url.search = '';
    url.hash = '';
  }
  return {
    title: label,
    text: localPreview ? `${label} — локальный просмотр семейного древа` : `${label} — семейное древо`,
    url: url.href
  };
}

export async function shareTreeLink({ payload, share, copy } = {}) {
  if (typeof share === 'function') {
    try {
      await share(payload);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  await copy(`${payload.text}\n${payload.url}`);
  return 'copied';
}

export function canLoadPreviewTree(hostname, syntheticFixture = false) {
  return Boolean(syntheticFixture) || isLoopbackHost(hostname);
}
