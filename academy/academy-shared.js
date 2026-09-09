/**
 * Shared helpers for Academy live (web).
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

  function academyLiveUrl() {
    const config = getConfig();
    if (config?.academyLiveUrl) return config.academyLiveUrl;
    if (config?.url) return `${String(config.url).replace(/\/$/, '')}/functions/v1/academy-live`;
    return '';
  }

  async function callLive(action, body, opts) {
    const url = academyLiveUrl();
    if (!url) throw new Error('academyLiveUrl не задан');
    const headers = {
      'Content-Type': 'application/json',
      apikey: getConfig()?.anonKey || '',
    };
    if (opts?.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
    else if (getConfig()?.anonKey) headers.Authorization = `Bearer ${getConfig().anonKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs || 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...(body || {}) }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.payload = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function saveResume(code, payload) {
    try {
      localStorage.setItem(
        RESUME_PREFIX + String(code),
        JSON.stringify({ ...payload, saved_at: Date.now() })
      );
    } catch (_) {
      /* ignore */
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.AcademyLive = {
    getConfig,
    canCreateClient,
    getClient,
    academyLiveUrl,
    callLive,
    saveResume,
    loadResume,
    clearResume,
    resolveJoinCode,
    resolveSessionId,
    escapeHtml,
    RESUME_PREFIX,
  };
})(window);
