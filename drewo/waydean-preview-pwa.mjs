const CACHE_NAME = 'waydean-preview-shell-v39';

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function isInstalled() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
}

function installInstructions() {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) {
    return 'На iPhone или iPad откройте Waydean в Safari, нажмите «Поделиться» → «На экран Домой» → «Добавить».';
  }
  if (/android/i.test(ua)) {
    return 'На Android откройте меню Chrome и выберите «Установить приложение» или «Добавить на главный экран».';
  }
  return 'В Chrome или Edge нажмите значок установки в адресной строке либо откройте меню браузера и выберите «Установить Waydean».';
}

export function createWaydeanPwaController(onChange = () => {}, {
  allowServerPush = false,
  accountAdminAction = null,
  familySessionAction = null
} = {}) {
  const state = {
    localPreview: isLoopbackHost(location.hostname),
    serverPushAvailable: Boolean(allowServerPush && !isLoopbackHost(location.hostname)
      && location.protocol === 'https:' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window),
    online: navigator.onLine !== false,
    installed: isInstalled(),
    installPromptAvailable: false,
    installInstructions: installInstructions(),
    serviceWorkerReady: false,
    serviceWorkerError: false,
    offlineReady: false,
    accountPushAvailable: Boolean(allowServerPush && typeof accountAdminAction === 'function'),
    familyPushAvailable: Boolean(allowServerPush && typeof familySessionAction === 'function'),
    serverPushSubscribed: false,
    notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported'
  };

  let deferredInstallPrompt = null;
  let registration = null;
  let registrationPromise = Promise.resolve(null);
  if (!state.localPreview) document.querySelector('link[rel="manifest"]')?.remove();

  const emit = () => {
    state.online = navigator.onLine !== false;
    state.installed = isInstalled();
    state.notificationPermission = 'Notification' in window ? Notification.permission : 'unsupported';
    onChange({ ...state });
  };

  async function refreshOfflineState() {
    if (!state.serviceWorkerReady || !('caches' in window)) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      const page = new URL('./waydean-preview.html?state=all-tree', location.href).href;
      const tree = new URL('./family-tree.json', location.href).href;
      state.offlineReady = Boolean(await cache.match(page, { ignoreSearch: true }) && await cache.match(tree, { ignoreSearch: true }));
    } catch {
      state.offlineReady = false;
    }
    emit();
  }

  async function refreshServerPushState() {
    if (!state.serverPushAvailable) return;
    try {
      const readyRegistration = registration || await registrationPromise;
      const subscription = await readyRegistration?.pushManager?.getSubscription();
      state.serverPushSubscribed = Boolean(subscription);
    } catch {
      state.serverPushSubscribed = false;
    }
    emit();
  }

  async function callPublishApi(payload) {
    const configuredEndpoint = document.querySelector('meta[name="waydean-publish-api"]')?.content?.trim();
    if (!configuredEndpoint) throw new Error('Адрес сервера уведомлений не настроен.');
    const endpoint = new URL(configuredEndpoint, location.href);
    if (endpoint.protocol !== 'https:') throw new Error('Подключение уведомлений требует защищённого соединения.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(endpoint.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Сервер уведомлений не ответил за 12 секунд. Попробуйте ещё раз.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false || result.error) {
      throw new Error(result.error || `Не удалось выполнить запрос уведомлений (${response.status}).`);
    }
    return result;
  }

  function decodeApplicationServerKey(value) {
    const base64 = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }

  const onInstallPrompt = event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    state.installPromptAvailable = true;
    emit();
  };
  const onInstalled = () => {
    deferredInstallPrompt = null;
    state.installPromptAvailable = false;
    state.installed = true;
    emit();
  };
  const onNetworkChange = () => emit();
  const onWorkerMessage = event => {
    if (event.data?.type === 'WAYDEAN_PWA_CACHE_READY') refreshOfflineState();
  };

  window.addEventListener('beforeinstallprompt', onInstallPrompt);
  window.addEventListener('appinstalled', onInstalled);
  window.addEventListener('online', onNetworkChange);
  window.addEventListener('offline', onNetworkChange);
  navigator.serviceWorker?.addEventListener('message', onWorkerMessage);

  if (state.localPreview && 'serviceWorker' in navigator) {
    registrationPromise = navigator.serviceWorker.register('./waydean-preview-sw.js', {
      scope: './waydean-preview.html',
      updateViaCache: 'none'
    }).then(() => navigator.serviceWorker.ready).then(async readyRegistration => {
      registration = readyRegistration;
      state.serviceWorkerReady = Boolean(readyRegistration.active);
      state.serviceWorkerError = false;
      emit();
      await refreshOfflineState();
      return readyRegistration;
    }).catch(error => {
      state.serviceWorkerError = true;
      console.warn('Waydean local service worker is unavailable.', error);
      emit();
      return null;
    });
  } else if (state.serverPushAvailable) {
    registrationPromise = navigator.serviceWorker.getRegistration().then(existingRegistration => {
      if (existingRegistration) return existingRegistration;
      return navigator.serviceWorker.register('./sw.js');
    }).then(() => navigator.serviceWorker.ready).then(async readyRegistration => {
      registration = readyRegistration;
      state.serviceWorkerReady = Boolean(readyRegistration.active);
      if (!state.serviceWorkerReady) throw new Error('Сервис уведомлений ещё активируется. Повторите попытку через несколько секунд.');
      emit();
      await refreshServerPushState();
      return readyRegistration;
    }).catch(error => {
      state.serviceWorkerError = true;
      console.warn('Waydean server push worker is unavailable.', error);
      emit();
      return null;
    });
  } else {
    state.serviceWorkerError = state.localPreview;
  }

  emit();

  return {
    getState: () => ({ ...state }),
    async install() {
      if (state.installed) return 'installed';
      if (!deferredInstallPrompt) return 'instructions';
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      state.installPromptAvailable = false;
      emit();
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') state.installed = true;
      emit();
      return choice?.outcome || 'dismissed';
    },
    async requestNotificationPermission() {
      if (!state.localPreview || !('Notification' in window)) return 'unsupported';
      const permission = await Notification.requestPermission();
      state.notificationPermission = permission;
      emit();
      return permission;
    },
    async sendTestNotification() {
      if (!state.localPreview || !('Notification' in window)) throw new Error('Уведомления не поддерживаются в этом браузере.');
      if (Notification.permission !== 'granted') throw new Error('Сначала разрешите уведомления в браузере.');
      const readyRegistration = registration || await registrationPromise;
      if (!readyRegistration?.showNotification) throw new Error('Локальный сервис уведомлений пока недоступен.');
      const target = new URL('./waydean-preview.html?state=all-tree', location.href).href;
      await readyRegistration.showNotification('Waydean · проверка', {
        body: 'Это локальное тестовое уведомление. Подписка на серверные события древа не создавалась.',
        icon: new URL('./icon-192.png', location.href).href,
        badge: new URL('./icon-192.png', location.href).href,
        tag: 'waydean-local-notification-test',
        data: { url: target },
        lang: 'ru'
      });
      return true;
    },
    async subscribeServerPush(password, treeDir = 'drewo') {
      if (!state.serverPushAvailable) throw new Error('Серверные уведомления доступны только после подтверждённого входа в дерево.');
      const useAccountSession = state.accountPushAvailable;
      const useFamilySession = !useAccountSession && state.familyPushAvailable;
      if (!useAccountSession && !useFamilySession && !password) throw new Error('Введите пароль редактора.');
      const permissionRequest = Notification.permission === 'default'
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission);
      const permission = await permissionRequest;
      state.notificationPermission = permission;
      emit();
      if (permission !== 'granted') throw new Error(permission === 'denied'
        ? 'Разрешите уведомления Waydean в настройках браузера.'
        : 'Разрешение на уведомления не получено.');

      const readyRegistration = registration || await registrationPromise;
      if (!readyRegistration?.pushManager) throw new Error('Push-уведомления не поддерживаются этим браузером.');
      const keyResult = useAccountSession
        ? await accountAdminAction('waydean-admin-push-vapid', {})
        : useFamilySession
          ? await familySessionAction('vapid-public', {})
          : await callPublishApi({ action: 'vapid-public', password, treeDir });
      if (!keyResult.publicKey) throw new Error('Сервер не вернул публичный ключ уведомлений.');
      let subscription = await readyRegistration.pushManager.getSubscription();
      let createdHere = false;
      if (!subscription) {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(keyResult.publicKey)
        });
        createdHere = true;
      }
      const json = subscription.toJSON();
      try {
        const payload = { subscription: { endpoint: json.endpoint, keys: json.keys } };
        if (useAccountSession) {
          await accountAdminAction('waydean-admin-push-subscribe', payload);
        } else if (useFamilySession) {
          await familySessionAction('subscribe', payload);
        } else {
          await callPublishApi({ action: 'subscribe', password, treeDir, ...payload });
        }
      } catch (error) {
        if (createdHere) await subscription.unsubscribe().catch(() => false);
        throw error;
      }
      state.serverPushSubscribed = true;
      emit();
      return true;
    },
    async unsubscribeServerPush(password, treeDir = 'drewo') {
      if (!state.serverPushAvailable) throw new Error('Серверные уведомления доступны только после подтверждённого входа в дерево.');
      const useAccountSession = state.accountPushAvailable;
      const useFamilySession = !useAccountSession && state.familyPushAvailable;
      if (!useAccountSession && !useFamilySession && !password) throw new Error('Введите пароль редактора.');
      const readyRegistration = registration || await registrationPromise;
      const subscription = await readyRegistration?.pushManager?.getSubscription();
      if (!subscription) {
        state.serverPushSubscribed = false;
        emit();
        return false;
      }
      const payload = { endpoint: subscription.endpoint };
      const result = useAccountSession
        ? await accountAdminAction('waydean-admin-push-unsubscribe', payload)
        : useFamilySession
          ? await familySessionAction('unsubscribe', payload)
          : await callPublishApi({ action: 'unsubscribe', password, treeDir, ...payload });
      if (result.ok !== true) throw new Error(result.error || 'Сервер не подтвердил отключение уведомлений.');
      await subscription.unsubscribe();
      state.serverPushSubscribed = false;
      emit();
      return true;
    }
  };
}
