import { clearFamilyAccess } from '../assets/drewo-auth-preferences.mjs';
import { createDrewoManagerAuth, hasDrewoManagerSession } from '../assets/drewo-manager-auth.mjs?v=1';
import { FAMILY_LOGOUT_UNCONFIRMED, revokeFamilySession } from '../drewo/waydean-preview-family-auth.mjs?v=family-logout-1';

(() => {
  const login = document.querySelector('#family-access');
  const create = document.querySelector('#create-access');
  const managerAccount = document.querySelector('#atlas-manager-account');
  const managerAuth = createDrewoManagerAuth();
  const enterButton = document.querySelector('#atlas-login');
  const createButton = document.querySelector('#create-tree');
  const theme = document.querySelector('#theme-toggle');
  function syncTheme() {
    const light = document.documentElement.dataset.colorScheme === 'light';
    theme.setAttribute('aria-pressed', String(light));
    document.querySelector('meta[name="theme-color"]').content = light ? '#eef0e7' : '#102b29';
  }
  theme.addEventListener('click', () => {
    const next = theme.getAttribute('aria-pressed') === 'true' ? 'dark' : 'light';
    document.documentElement.dataset.colorScheme = next;
    try { localStorage.setItem('drewo-color-scheme-v2',next); } catch {}
    syncTheme();
  });
  syncTheme();
  const params = new URLSearchParams(location.search);
  const familyInvite = ['u', 'c', 'code'].some(key => params.has(key));
  const oldRoute = location.hash;
  function fitDialog() {
    const view = window.visualViewport;
    if (!view) return;
    document.documentElement.style.setProperty("--access-height", view.height + "px");
    document.documentElement.style.setProperty("--access-top", view.offsetTop + "px");
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  fitDialog();
  window.visualViewport?.addEventListener("resize", fitDialog);
  window.visualViewport?.addEventListener("scroll", fitDialog);
  function openLogin() {
    login.showModal();
    const field = document.querySelector('#login-input');
    (field.value ? document.querySelector('#password-input') : field).focus();
  }
  // A local session is only a shortcut. The editor revalidates it on arrival.
  let familyPath = '';
  let familyToken = '';
  let managerSession = false;
  try {
    const recent = JSON.parse(localStorage.getItem('nek:lastTree') || 'null');
    if (/^\/drewo(?:-[a-z0-9-]+)?\/$/.test(recent?.path)) {
      const dir = recent.path.split('/')[1];
      familyToken = sessionStorage.getItem('nek-session:' + dir) || '';
      if (familyToken) familyPath = recent.path;
    }
    managerSession = hasDrewoManagerSession();
  } catch {}
  if (familyPath || managerSession) {
    enterButton.textContent = familyPath ? 'Моё древо' : 'Мои древа';
    const switcher = document.createElement('button');
    switcher.className = 'top-action';
    const accountLabel = familyPath ? 'Аккаунт' : 'Кабинет';
    switcher.innerHTML = '<svg aria-hidden="true"><use href="/assets/drewo-icons.svg#people"/></svg><span></span>';
    switcher.querySelector('span').textContent = accountLabel;
    switcher.setAttribute('aria-label', accountLabel);
    switcher.addEventListener('click', () => {
      if (familyPath) document.querySelector('#atlas-account').showModal();
      else managerAccount.showModal();
    });
    document.querySelector('.top-actions').append(switcher);
    if (familyPath && managerSession) {
      const managerSwitcher = document.createElement('button');
      managerSwitcher.className = 'top-action';
      managerSwitcher.innerHTML = '<svg aria-hidden="true"><use href="/assets/drewo-icons.svg#people"/></svg><span></span>';
      managerSwitcher.querySelector('span').textContent = 'Кабинет';
      managerSwitcher.setAttribute('aria-label', 'Кабинет управляющего');
      managerSwitcher.addEventListener('click', () => managerAccount.showModal());
      document.querySelector('.top-actions').append(managerSwitcher);
    }
  }
  let leavingFamily = false;
  for (const [id, switchAccount] of [['atlas-sign-out', false], ['atlas-switch-account', true]]) {
    document.querySelector('#' + id).addEventListener('click', async () => {
      if (!familyPath || leavingFamily) return;
      leavingFamily = true;
      const treeDir = familyPath.split('/')[1];
      clearFamilyAccess(treeDir);
      const revoked = await revokeFamilySession({
        endpoint: window.SUPABASE_CONFIG?.publishDrewoUrl, treeDir, token: familyToken
      });
      familyToken = '';
      if (!revoked) window.alert(FAMILY_LOGOUT_UNCONFIRMED);
      location.replace(switchAccount ? '/atlas/?login=1&switch=1' : '/atlas/');
    });
  }
  let leavingManager = false;
  function ensureSupabaseClient() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (window.drewoSupabaseClientPromise) return window.drewoSupabaseClientPromise;
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => window.supabase?.createClient
        ? resolve()
        : reject(new Error('Не удалось загрузить модуль входа.'));
      script.onerror = () => reject(new Error('Не удалось подключиться к службе входа.'));
      document.head.append(script);
    });
    window.drewoSupabaseClientPromise = pending.catch(error => {
      delete window.drewoSupabaseClientPromise;
      throw error;
    });
    return window.drewoSupabaseClientPromise;
  }
  for (const [id, switchAccount] of [['atlas-manager-sign-out', false], ['atlas-manager-switch-account', true]]) {
    document.querySelector('#' + id).addEventListener('click', async event => {
      if (!managerSession || leavingManager) return;
      leavingManager = true;
      const button = event.currentTarget;
      const error = document.querySelector('#atlas-manager-account-error');
      button.disabled = true;
      error.hidden = true;
      try {
        await ensureSupabaseClient();
        if (!managerAuth.isEnabled()) throw new Error('Вход управляющего не настроен.');
        await managerAuth.signOut();
        location.replace(switchAccount ? '/trees/?switch=1' : '/atlas/');
      } catch (reason) {
        error.textContent = reason?.message || 'Не удалось выйти. Проверьте подключение и повторите попытку.';
        error.hidden = false;
        leavingManager = false;
        button.disabled = false;
      }
    });
  }
  enterButton.addEventListener('click', () => {
    if (leavingFamily) return;
    if (familyPath || managerSession) location.assign(familyPath || '/trees/');
    else openLogin();
  });
  createButton.addEventListener('click', () => managerSession ? location.assign('/trees/#create') : create.showModal());
  if (familyInvite || params.get('login') === '1' || oldRoute === '#/nek/login') openLogin();
  if (oldRoute === '#/nek/register') create.showModal();
})();
