function accessError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function requireWaydeanAdminAccess(treeDir = 'drewo') {
  const configuredEndpoint = document.querySelector('meta[name="waydean-publish-api"]')?.content?.trim() || '';
  if (!configuredEndpoint) {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Проверка доступа Waydean не настроена.');
  }

  let endpoint;
  try {
    endpoint = new URL(configuredEndpoint, window.location.origin);
  } catch {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Адрес проверки доступа Waydean настроен неверно.');
  }
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Проверка доступа Waydean требует защищённого соединения.');
  }

  const auth = window.AdminSupabase;
  if (!auth?.isEnabled?.() || typeof auth.getSession !== 'function') {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Вход через администраторский аккаунт недоступен.');
  }

  let session;
  try {
    session = await auth.getSession();
  } catch {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Не удалось проверить сессию Supabase.');
  }
  if (!session?.access_token) {
    throw accessError('WAYDEAN_AUTH_REQUIRED', 'Войдите в администраторский аккаунт, чтобы открыть Waydean.');
  }

  const anonKey = window.SUPABASE_CONFIG?.anonKey;
  if (!anonKey) {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Вход через Supabase не настроен для этой страницы.');
  }

  let response;
  try {
    response = await fetch(endpoint.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: 'waydean-admin-auth', treeDir }),
    });
  } catch {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Сервис проверки доступа не отвечает. Попробуйте позже.');
  }

  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw accessError('WAYDEAN_AUTH_REQUIRED', 'Сессия истекла. Войдите в администраторский аккаунт снова.');
  }
  if (response.status === 403 || (response.ok && (result?.ok !== true || result.treeDir !== treeDir))) {
    throw accessError('WAYDEAN_ACCESS_DENIED', 'Эта учётная запись не имеет доступа к Waydean. Войдите в нужный администраторский аккаунт.');
  }
  if (response.status === 503 && result?.code === 'allowlist_not_configured') {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Администраторский доступ Waydean ещё не настроен.');
  }
  if (!response.ok) {
    throw accessError('WAYDEAN_AUTH_UNAVAILABLE', 'Не удалось подтвердить доступ. Проверьте соединение и повторите попытку.');
  }
}
