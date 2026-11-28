export const DREWO_MANAGER_STORAGE_KEY = 'waydean-trees-auth';
export const DREWO_MANAGER_TAB_ID_KEY = 'drewo:manager-tab-id';
export const DREWO_MANAGER_IGNORE_LEGACY_KEY = 'drewo:manager-ignore-legacy';

function browserStorage(name) {
  try { return globalThis[name] || null; } catch { return null; }
}

function hasStoredSession(storage, key) {
  try { return Boolean(storage?.getItem(key)); } catch { return false; }
}

function hasScopedSessionRecord() {
  const local = browserStorage('localStorage');
  const session = browserStorage('sessionStorage');
  let tabKey = '';
  try {
    const tabId = session?.getItem(DREWO_MANAGER_TAB_ID_KEY);
    if (tabId) tabKey = `waydean-trees-tab-auth-${tabId}`;
  } catch { /* The tab session is unavailable. */ }
  return hasStoredSession(local, DREWO_MANAGER_STORAGE_KEY) || hasStoredSession(session, tabKey);
}

function tabStorageKey() {
  const storage = browserStorage('sessionStorage');
  if (!storage) throw new Error('Хранилище текущей вкладки недоступно. Разрешите хранилище сайта и повторите вход.');
  let id = storage.getItem(DREWO_MANAGER_TAB_ID_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(DREWO_MANAGER_TAB_ID_KEY, id);
  }
  return `waydean-trees-tab-auth-${id}`;
}

export function hasDrewoManagerSession() {
  const local = browserStorage('localStorage');
  const session = browserStorage('sessionStorage');
  const keys = [DREWO_MANAGER_STORAGE_KEY];
  try {
    const tabId = session?.getItem(DREWO_MANAGER_TAB_ID_KEY);
    if (tabId) keys.push(`waydean-trees-tab-auth-${tabId}`);
  } catch { /* Storage is optional on the public atlas. */ }
  for (const [storage, key] of [[local, keys[0]], [session, keys[1]]]) {
    try {
      if (!storage || !key) continue;
      const parsed = JSON.parse(storage.getItem(key) || 'null');
      if (Number(parsed?.expires_at) > Date.now() / 1000) return true;
    } catch { /* The editor will validate the session with Supabase. */ }
  }
  return false;
}

export function createDrewoManagerAuth({ legacyAuth = null } = {}) {
  let localClient = null;
  let tabClient = null;
  let activeScope = '';
  let legacyActive = false;
  const config = () => globalThis.window?.SUPABASE_CONFIG || {};

  function isEnabled() {
    const value = config();
    return Boolean(value.url && value.anonKey && globalThis.window?.supabase?.createClient);
  }

  function getClient(scope = '') {
    if (!isEnabled()) return null;
    const storageScope = scope || activeScope || preferredScope();
    if (storageScope === 'local' && !localClient) {
      const storage = browserStorage('localStorage');
      if (!storage) throw new Error('Хранилище устройства недоступно. Разрешите хранилище сайта и повторите вход.');
      localClient = globalThis.window.supabase.createClient(config().url, config().anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage, storageKey: DREWO_MANAGER_STORAGE_KEY },
      });
    }
    if (storageScope === 'tab' && !tabClient) {
      const storage = browserStorage('sessionStorage');
      const storageKey = tabStorageKey();
      tabClient = globalThis.window.supabase.createClient(config().url, config().anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage, storageKey },
      });
    }
    return storageScope === 'local' ? localClient : tabClient;
  }

  function preferredScope() {
    let sessionKey = '';
    try { sessionKey = tabStorageKey(); } catch { /* Checked when the client is created. */ }
    if (hasStoredSession(browserStorage('sessionStorage'), sessionKey)) return 'tab';
    if (hasStoredSession(browserStorage('localStorage'), DREWO_MANAGER_STORAGE_KEY)) return 'local';
    return 'tab';
  }

  function suppressLegacyFallback() {
    let saved = false;
    try {
      browserStorage('localStorage')?.setItem(DREWO_MANAGER_IGNORE_LEGACY_KEY, '1');
      saved = true;
    } catch { /* Fall back to a per-tab marker if local storage is blocked. */ }
    if (!saved) {
      try { browserStorage('sessionStorage')?.setItem(DREWO_MANAGER_IGNORE_LEGACY_KEY, '1'); } catch { /* Storage may be disabled. */ }
    }
  }

  function mayUseLegacyFallback() {
    const configured = typeof legacyAuth === 'function' || Boolean(legacyAuth);
    return configured
      && !hasStoredSession(browserStorage('localStorage'), DREWO_MANAGER_IGNORE_LEGACY_KEY)
      && !hasStoredSession(browserStorage('sessionStorage'), DREWO_MANAGER_IGNORE_LEGACY_KEY);
  }

  function resolveLegacyAuth() {
    return typeof legacyAuth === 'function' ? legacyAuth() : legacyAuth;
  }

  async function clearOtherScope(scope) {
    const otherScope = scope === 'local' ? 'tab' : 'local';
    const storage = browserStorage(otherScope === 'local' ? 'localStorage' : 'sessionStorage');
    let key;
    try { key = otherScope === 'local' ? DREWO_MANAGER_STORAGE_KEY : tabStorageKey(); }
    catch { return; }
    if (!hasStoredSession(storage, key)) return;
    try { await getClient(otherScope).auth.signOut({ scope: 'local' }); }
    catch {
      try { storage?.removeItem(key); } catch { /* Supabase storage remains authoritative when writable. */ }
    }
  }

  async function getSession() {
    const scope = activeScope || preferredScope();
    const hadScopedRecord = hasScopedSessionRecord();
    try {
      const client = getClient(scope);
      if (client) {
        const { data } = await client.auth.getSession();
        if (data?.session) {
          activeScope = scope;
          legacyActive = false;
          return data.session;
        }
      }
    } catch (error) {
      if (!mayUseLegacyFallback() || hadScopedRecord) throw error;
    }
    if (!hadScopedRecord && mayUseLegacyFallback()) {
      try {
        const auth = resolveLegacyAuth();
        const session = await auth?.getSession?.();
        if (session) {
          legacyActive = true;
          activeScope = '';
          return session;
        }
      } catch { /* A legacy session cannot grant access when Supabase rejects it. */ }
    }
    legacyActive = false;
    return null;
  }

  async function signIn(email, password, rememberOnDevice = false) {
    const scope = rememberOnDevice ? 'local' : 'tab';
    const client = getClient(scope);
    if (!client) throw new Error('Вход через Supabase не настроен.');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await clearOtherScope(scope);
    suppressLegacyFallback();
    activeScope = scope;
    legacyActive = false;
  }

  async function signOut() {
    if (legacyActive) {
      const auth = resolveLegacyAuth();
      await auth?.signOut?.();
    } else {
      const client = getClient(activeScope || preferredScope());
      if (client) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
    }
    suppressLegacyFallback();
    activeScope = '';
    legacyActive = false;
  }

  return { isEnabled, getClient, getSession, signIn, signOut };
}
