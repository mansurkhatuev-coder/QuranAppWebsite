const ALLOWED_ACTIONS = new Set([
  'waydean-admin-auth',
  'waydean-admin-load',
  'waydean-admin-publish',
  'waydean-admin-backups',
  'waydean-admin-snapshot',
  'waydean-admin-pin-backup',
  'waydean-admin-restore',
  'waydean-admin-lock',
  'waydean-admin-password',
  'waydean-admin-push-vapid',
  'waydean-admin-push-subscribe',
  'waydean-admin-push-unsubscribe',
]);

function apiError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function validateAccess(access) {
  if (!access?.endpoint || !access?.anonKey || !access?.accessToken) {
    throw apiError('WAYDEAN_AUTH_REQUIRED', 'Войдите в администраторский аккаунт, чтобы продолжить.');
  }

  let endpoint;
  try {
    endpoint = new URL(access.endpoint);
  } catch {
    throw apiError('WAYDEAN_AUTH_UNAVAILABLE', 'Адрес сервиса Waydean настроен неверно.');
  }
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
    throw apiError('WAYDEAN_AUTH_UNAVAILABLE', 'Сервис Waydean требует защищённого соединения.');
  }
  return endpoint.href;
}

export async function callWaydeanAdminAction(action, payload = {}, access, fetcher = globalThis.fetch) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw apiError('WAYDEAN_ACTION_NOT_ALLOWED', 'Действие недоступно в режиме Waydean.');
  }
  if (typeof fetcher !== 'function') {
    throw apiError('WAYDEAN_AUTH_UNAVAILABLE', 'Браузер не поддерживает сетевые запросы.');
  }
  const endpoint = validateAccess(access);
  let response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access.accessToken}`,
        apikey: access.anonKey,
      },
      body: JSON.stringify({ ...(payload && typeof payload === 'object' ? payload : {}), treeDir: 'drewo', action }),
    });
  } catch {
    throw apiError('WAYDEAN_AUTH_UNAVAILABLE', 'Сервис Waydean не отвечает. Проверьте соединение и повторите попытку.');
  }

  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw apiError('WAYDEAN_AUTH_REQUIRED', 'Сессия истекла. Войдите в администраторский аккаунт снова.');
  }
  if (response.status === 403) {
    throw apiError('WAYDEAN_ACCESS_DENIED', 'Эта учётная запись не имеет доступа к Waydean.');
  }
  if (response.status === 409) {
    throw apiError('WAYDEAN_PUBLISH_CONFLICT', result.error || 'На сайте появилась новая версия дерева.', result);
  }
  if (response.status === 503 || result.code === 'allowlist_not_configured') {
    throw apiError('WAYDEAN_AUTH_UNAVAILABLE', result.error || 'Администраторский доступ Waydean ещё не настроен.');
  }
  if (!response.ok || result.ok !== true) {
    throw apiError('WAYDEAN_REQUEST_FAILED', result.error || 'Не удалось выполнить действие Waydean.');
  }
  if (result.treeDir !== 'drewo') {
    throw apiError('WAYDEAN_ACCESS_DENIED', 'Сервис вернул другое семейное дерево.');
  }
  return result;
}
