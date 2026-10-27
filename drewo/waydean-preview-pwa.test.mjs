import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaydeanPwaController } from './waydean-preview-pwa.mjs';

function installFakeAccountBrowser({ subscription = null } = {}) {
  const originals = new Map();
  const setGlobal = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  let notificationPermission = 'default';
  class FakeNotification {}
  Object.defineProperty(FakeNotification, 'permission', {
    get: () => notificationPermission,
    set: value => { notificationPermission = value; }
  });
  FakeNotification.requestPermission = async () => {
    notificationPermission = 'granted';
    return notificationPermission;
  };

  const createdSubscription = {
    endpoint: 'https://push.example/new-device',
    toJSON: () => ({ endpoint: 'https://push.example/new-device', keys: { p256dh: 'p256dh', auth: 'auth' } }),
    unsubscribe: async () => { createdSubscription.unsubscribed = true; return true; }
  };
  const pushManager = {
    getSubscription: async () => subscription,
    subscribe: async options => {
      pushManager.lastOptions = options;
      return createdSubscription;
    }
  };
  const registration = { pushManager };
  setGlobal('window', {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    PushManager: class {},
    Notification: FakeNotification
  });
  setGlobal('navigator', {
    onLine: true,
    standalone: false,
    serviceWorker: { addEventListener() {}, getRegistration: async () => registration }
  });
  setGlobal('location', {
    hostname: 'waydean.ru',
    protocol: 'https:',
    href: 'https://waydean.ru/drewo/waydean-preview.html?source=account'
  });
  setGlobal('document', {
    querySelector(selector) {
      if (selector === 'link[rel="manifest"]') return { remove() {} };
      if (selector === 'meta[name="waydean-publish-api"]') return { content: 'https://api.example/publish-drewo' };
      return null;
    }
  });
  setGlobal('Notification', FakeNotification);
  setGlobal('fetch', async () => { throw new Error('account push must use the verified admin action'); });

  return {
    pushManager,
    createdSubscription,
    restore() {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  };
}

test('account Waydean push subscription uses the admin session instead of a family password', async () => {
  const browser = installFakeAccountBrowser();
  const requests = [];
  const accountAdminAction = async (action, payload) => {
    requests.push({ action, payload });
    if (action === 'waydean-admin-push-vapid') return { ok: true, treeDir: 'drewo', publicKey: 'AQID' };
    return { ok: true, treeDir: 'drewo', count: 1 };
  };

  try {
    const controller = createWaydeanPwaController(() => {}, { allowServerPush: true, accountAdminAction });
    await controller.subscribeServerPush('', 'drewo');

    assert.deepEqual(requests, [
      { action: 'waydean-admin-push-vapid', payload: {} },
      { action: 'waydean-admin-push-subscribe', payload: { subscription: {
        endpoint: 'https://push.example/new-device',
        keys: { p256dh: 'p256dh', auth: 'auth' }
      } } }
    ]);
    assert.deepEqual(Array.from(browser.pushManager.lastOptions.applicationServerKey), [1, 2, 3]);
    assert.equal(browser.pushManager.lastOptions.userVisibleOnly, true);
    assert.equal(controller.getState().serverPushSubscribed, true);
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
    browser.restore();
  }
});

test('account Waydean push unsubscribe removes only this device using the admin session', async () => {
  const existingSubscription = {
    endpoint: 'https://push.example/current-device',
    unsubscribe: async () => { existingSubscription.unsubscribed = true; return true; }
  };
  const browser = installFakeAccountBrowser({ subscription: existingSubscription });
  const requests = [];
  const accountAdminAction = async (action, payload) => {
    requests.push({ action, payload });
    return { ok: true, treeDir: 'drewo', count: 0 };
  };

  try {
    const controller = createWaydeanPwaController(() => {}, { allowServerPush: true, accountAdminAction });
    const removed = await controller.unsubscribeServerPush('', 'drewo');

    assert.equal(removed, true);
    assert.deepEqual(requests, [{
      action: 'waydean-admin-push-unsubscribe',
      payload: { endpoint: 'https://push.example/current-device' }
    }]);
    assert.equal(existingSubscription.unsubscribed, true);
    assert.equal(controller.getState().serverPushSubscribed, false);
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
    browser.restore();
  }
});
