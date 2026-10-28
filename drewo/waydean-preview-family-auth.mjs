const DEFAULT_TREE_DIR = 'drewo';

function normalizeTreeDir(value) {
  const treeDir = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(treeDir)) {
    throw new TypeError('A valid family tree path is required');
  }
  return treeDir;
}

function familyError(data, status) {
  const error = new Error(String(data?.error || `Ошибка ${status || 500}`));
  error.status = status;
  error.data = data || {};
  return error;
}

function safeEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Адрес семейного входа настроен неверно.');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new TypeError('Семейный вход требует защищённого соединения.');
  }
  return url.href;
}

async function postFamilyAction(endpoint, payload, fetcher) {
  const response = await fetcher(safeEndpoint(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw familyError(data, response.status);
  return data;
}

function safeTreePath(treeDir, path) {
  const expected = `/${normalizeTreeDir(treeDir)}/`;
  if (path != null && path !== expected) {
    throw new Error('Сервер вернул небезопасный адрес семейного древа.');
  }
  return expected;
}

export function familySessionKey(treeDir = DEFAULT_TREE_DIR) {
  return `nek-session:${normalizeTreeDir(treeDir)}`;
}

export function readFamilySession(storage, treeDir = DEFAULT_TREE_DIR) {
  try {
    return String(storage?.getItem(familySessionKey(treeDir)) || '').trim();
  } catch {
    return '';
  }
}

export function storeFamilySession(storage, treeDir = DEFAULT_TREE_DIR, token = '') {
  const key = familySessionKey(treeDir);
  const value = String(token || '').trim();
  try {
    if (!storage) return false;
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function consumeFamilyTokenFromUrl(href) {
  try {
    const url = new URL(href);
    const token = String(url.searchParams.get('nek') || '').trim();
    url.searchParams.delete('nek');
    return {
      token,
      cleanUrl: `${url.pathname}${url.search}${url.hash}`
    };
  } catch {
    return { token: '', cleanUrl: '' };
  }
}

export async function verifyFamilySession({ endpoint, treeDir = DEFAULT_TREE_DIR, token, fetcher = fetch }) {
  const expectedTree = normalizeTreeDir(treeDir);
  const sessionToken = String(token || '').trim();
  if (!sessionToken) {
    const error = familyError({ error: 'Семейная сессия отсутствует.' }, 401);
    error.code = 'WAYDEAN_FAMILY_AUTH_REQUIRED';
    throw error;
  }

  let data;
  try {
    data = await postFamilyAction(endpoint, {
      action: 'auth',
      treeDir: expectedTree,
      sessionToken
    }, fetcher);
  } catch (error) {
    error.code = error.status === 401
      ? 'WAYDEAN_FAMILY_AUTH_REQUIRED'
      : 'WAYDEAN_FAMILY_AUTH_UNAVAILABLE';
    throw error;
  }
  if (normalizeTreeDir(data.treeDir) !== expectedTree) {
    const error = new Error('Эта сессия относится к другому семейному древу.');
    error.code = 'WAYDEAN_FAMILY_AUTH_REQUIRED';
    throw error;
  }
  if (!String(data.role || '').trim() || !String(data.sessionToken || '').trim()) {
    const error = new Error('Сервер не подтвердил семейную сессию.');
    error.code = 'WAYDEAN_FAMILY_AUTH_REQUIRED';
    throw error;
  }
  return data;
}

export async function loginFamilySession({
  endpoint,
  login,
  password,
  treeDir = DEFAULT_TREE_DIR,
  origin = globalThis.location?.origin || 'https://waydean.ru',
  storage,
  fetcher = fetch
}) {
  const expectedTree = normalizeTreeDir(treeDir);
  const normalizedLogin = String(login || '').trim().toLowerCase();
  const familyPassword = String(password || '');
  if (!normalizedLogin || !familyPassword) {
    throw new TypeError('Введите логин и пароль семьи.');
  }

  const loginData = await postFamilyAction(endpoint, {
    action: 'login-tree',
    login: normalizedLogin,
    password: familyPassword
  }, fetcher);
  const token = String(loginData.sessionToken || '').trim();
  if (!token) throw familyError({ error: 'Сервер не выдал семейную сессию.' }, 401);

  const targetTree = normalizeTreeDir(loginData.treeDir || expectedTree);
  if (targetTree !== expectedTree) {
    const targetPath = safeTreePath(targetTree, loginData.path);
    const targetUrl = new URL(targetPath, origin);
    targetUrl.searchParams.set('nek', token);
    storeFamilySession(storage, expectedTree, '');
    return { redirect: true, redirectUrl: `${targetUrl.pathname}${targetUrl.search}` };
  }

  const session = await verifyFamilySession({ endpoint, treeDir: expectedTree, token, fetcher });
  const stored = storeFamilySession(storage, expectedTree, session.sessionToken);
  return { ...session, redirect: false, stored };
}

export async function resolveFamilyInvite({ endpoint, code, fetcher = fetch }) {
  const normalizedCode = String(code || '').trim().toLowerCase();
  if (!normalizedCode) throw new TypeError('Код приглашения пустой.');
  const data = await postFamilyAction(endpoint, {
    action: 'resolve-invite',
    code: normalizedCode
  }, fetcher);
  const treeDir = normalizeTreeDir(data.treeDir);
  const invitePath = String(data.invitePath || '');
  if (!/^\/t\/[a-z0-9][a-z0-9-]{0,63}\/?$/i.test(invitePath)) {
    throw new Error('Сервер вернул неверную ссылку приглашения.');
  }
  return { ...data, treeDir, invitePath };
}
