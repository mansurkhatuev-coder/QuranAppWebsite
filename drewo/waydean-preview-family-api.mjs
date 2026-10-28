const FAMILY_ACTIONS = new Set(['family-load', 'publish', 'vapid-public', 'subscribe', 'unsubscribe']);

export function canEditFamilyTreeRole(role) {
  return role === 'editor' || role === 'super';
}

export function canPublishFamilyTreeSession({ token, role, locked = false } = {}) {
  return Boolean(String(token || '').trim() && !locked && canEditFamilyTreeRole(role));
}

function familyError(data, status, code) {
  const error = new Error(String(data?.error || `Ошибка ${status || 500}`));
  error.status = status;
  error.code = code;
  error.details = data || {};
  return error;
}

function safeEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw familyError({ error: 'Адрес семейного древа настроен неверно.' }, 0, 'WAYDEAN_FAMILY_AUTH_UNAVAILABLE');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw familyError({ error: 'Семейный доступ требует защищённого соединения.' }, 0, 'WAYDEAN_FAMILY_AUTH_UNAVAILABLE');
  }
  return url.href;
}

export async function callFamilyTreeAction(action, payload = {}, {
  endpoint,
  treeDir = 'drewo',
  sessionToken,
  fetcher = globalThis.fetch
} = {}) {
  if (!FAMILY_ACTIONS.has(action)) {
    throw familyError({ error: 'Действие недоступно в семейном режиме.' }, 0, 'WAYDEAN_ACTION_NOT_ALLOWED');
  }
  if (typeof fetcher !== 'function') {
    throw familyError({ error: 'Браузер не поддерживает сетевые запросы.' }, 0, 'WAYDEAN_FAMILY_AUTH_UNAVAILABLE');
  }
  const expectedTree = String(treeDir || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(expectedTree)) {
    throw familyError({ error: 'Путь семейного древа настроен неверно.' }, 0, 'WAYDEAN_FAMILY_AUTH_REQUIRED');
  }
  const token = String(sessionToken || '').trim();
  if (!token) {
    throw familyError({ error: 'Войдите по семейному логину и паролю.' }, 401, 'WAYDEAN_FAMILY_AUTH_REQUIRED');
  }

  const safePayload = payload && typeof payload === 'object' ? { ...payload } : {};
  delete safePayload.password;
  delete safePayload.treeDir;
  delete safePayload.sessionToken;
  delete safePayload.action;
  delete safePayload.force;

  let response;
  try {
    response = await fetcher(safeEndpoint(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...safePayload,
        treeDir: expectedTree,
        sessionToken: token,
        action,
        ...(action === 'publish' ? { force: false } : {})
      })
    });
  } catch {
    throw familyError({ error: 'Сервис семейного древа не отвечает. Проверьте соединение и повторите попытку.' }, 0, 'WAYDEAN_FAMILY_AUTH_UNAVAILABLE');
  }

  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw familyError(result, 401, 'WAYDEAN_FAMILY_AUTH_REQUIRED');
  }
  if (response.status === 403) {
    throw familyError(result, 403, 'WAYDEAN_FAMILY_ACCESS_DENIED');
  }
  if (response.status === 409 || result?.conflict === true) {
    throw familyError(result, 409, 'WAYDEAN_PUBLISH_CONFLICT');
  }
  if (!response.ok || result?.ok !== true) {
    throw familyError(result, response.status, 'WAYDEAN_FAMILY_REQUEST_FAILED');
  }
  if (String(result.treeDir || '').trim().toLowerCase() !== expectedTree) {
    throw familyError({ error: 'Сервис вернул другое семейное древо.' }, 403, 'WAYDEAN_FAMILY_AUTH_REQUIRED');
  }
  if (action === 'family-load'
    && (typeof result.treeJson !== 'string' || typeof result.fingerprint !== 'string' || !result.fingerprint)) {
    throw familyError({ error: 'Сервис не вернул актуальный снимок семейного древа.' }, 502, 'WAYDEAN_FAMILY_REQUEST_FAILED');
  }
  return result;
}
