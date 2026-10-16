const TREE_MODES = new Set(['path', 'branch', 'all-tree']);

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

export function accountPreviewUrl(href) {
  const url = new URL(href);
  url.searchParams.set('source', 'account');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isMasterFixtureQuery(search) {
  const fixtures = new URLSearchParams(search).getAll('fixture');
  return fixtures.length === 1 && fixtures[0] === 'master';
}

export function isLoopbackHost(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
}

export function canLoadPreviewTree(hostname, syntheticFixture = false) {
  return Boolean(syntheticFixture) || isLoopbackHost(hostname);
}
