/**
 * Shared helpers for Academy live (web).
 * Resume keys and Supabase client bootstrap.
 */
(function (global) {
  const RESUME_PREFIX = 'academy_join:';

  function getConfig() {
    return global.SUPABASE_CONFIG || null;
  }

  function canCreateClient() {
    const config = getConfig();
    return Boolean(config?.url && config?.anonKey && global.supabase?.createClient);
  }

  function getClient() {
    if (!canCreateClient()) return null;
    if (!getClient.instance) {
      const config = getConfig();
      getClient.instance = global.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'academy-teacher-auth',
        },
      });
    }
    return getClient.instance;
  }

  function saveResume(code, payload) {
    try {
      localStorage.setItem(
        RESUME_PREFIX + String(code),
        JSON.stringify({ ...payload, saved_at: Date.now() })
      );
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

  function loadResume(code) {
    try {
      const raw = localStorage.getItem(RESUME_PREFIX + String(code));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function clearResume(code) {
    try {
      localStorage.removeItem(RESUME_PREFIX + String(code));
    } catch (_) {
      /* ignore */
    }
  }

  /** Resolve join code from ?c= / ?code= or trailing /join/123456 path. */
  function resolveJoinCode() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('c') || params.get('code');
    if (fromQuery && /^\d{4,8}$/.test(fromQuery.trim())) return fromQuery.trim();

    const parts = location.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== 'join' && /^\d{4,8}$/.test(last)) return last;
    return '';
  }

  function resolveSessionId() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('id') || params.get('session');
    if (fromQuery) return fromQuery.trim();
    const parts = location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('session');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return '';
  }

  global.AcademyLive = {
    getConfig,
    canCreateClient,
    getClient,
    saveResume,
    loadResume,
    clearResume,
    resolveJoinCode,
    resolveSessionId,
    RESUME_PREFIX,
  };
})(window);
