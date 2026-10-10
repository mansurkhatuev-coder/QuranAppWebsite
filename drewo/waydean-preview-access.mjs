export async function requireWaydeanAdminAccess(treeDir = 'drewo') {
  const configuredEndpoint = document.querySelector('meta[name="waydean-publish-api"]')?.content?.trim() || '';
  if (!configuredEndpoint) {
    throw new Error('Проверка доступа Waydean не настроена для этой среды. Вернитесь к текущему древу.');
  }

  let endpoint;
  try {
    endpoint = new URL(configuredEndpoint, window.location.origin);
  } catch {
    throw new Error('Адрес проверки доступа Waydean настроен неверно. Вернитесь к текущему древу.');
  }
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('Проверка доступа Waydean требует защищённого соединения.');
  }

  let sessionToken = '';
  try {
    sessionToken = window.sessionStorage.getItem(`nek-session:${treeDir}`) || '';
  } catch {
    // Private browsing/storage restrictions are handled as a signed-out state.
  }
  if (!sessionToken) {
    throw new Error('Сначала войдите в текущее древо, затем откройте Waydean ещё раз.');
  }

  const response = await fetch(endpoint.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'auth', treeDir, sessionToken }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok || result.treeDir !== treeDir) {
    throw new Error('Не удалось подтвердить вход. Вернитесь в текущее древо и войдите снова.');
  }

  if (result.sessionToken) {
    try {
      window.sessionStorage.setItem(`nek-session:${treeDir}`, result.sessionToken);
    } catch {
      // The current request is still authorized; the next visit may require login again.
    }
  }
  if (result.role !== 'super') {
    throw new Error('Тест Waydean доступен только администратору древа. Вернитесь в текущее древо и войдите как администратор.');
  }
}
