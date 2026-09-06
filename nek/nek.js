(function initNek() {
  const RECENT_KEY = 'nek:lastTree';
  const REMEMBER_KEY = 'nek:remember';
  const PWA_DISMISS_KEY = 'nek:pwaDismissed';
  const PUBLISH_URL =
    (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.publishDrewoUrl) ||
    'https://rivjkiksknnesahrvamf.supabase.co/functions/v1/publish-drewo';

  const stage = document.querySelector('.stage');
  const loginOpen = document.getElementById('login-open');
  const loginPanel = document.getElementById('login-panel');
  const loginInput = document.getElementById('login-input');
  const passwordInput = document.getElementById('password-input');
  const passwordToggle = document.getElementById('password-toggle');
  const rememberInput = document.getElementById('login-remember');
  const loginSubmit = document.getElementById('login-submit');
  const loginError = document.getElementById('login-error');
  const loginCancel = document.getElementById('login-cancel');
  const lead = document.getElementById('lead');
  const recent = document.getElementById('recent');
  const recentLink = document.getElementById('recent-link');
  const pwaBanner = document.getElementById('pwa-banner');
  const pwaInstall = document.getElementById('pwa-install');
  const pwaDismiss = document.getElementById('pwa-dismiss');

  const leadDefault =
    'Родственники входят по логину и паролю семьи. Без регистрации.';
  const leadLogin =
    'Логин и пароль семьи — те, что прислал родственник. Доступ откроется сразу.';
  const submitLabel = 'Войти';

  let deferredInstall = null;
  let busy = false;

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Accepts a bare login or a pasted tree link and keeps only the login part. */
  function normalizeLogin(raw) {
    let value = String(raw || '').trim();
    try {
      if (/^https?:\/\//i.test(value) || value.includes('waydean.ru') || value.includes('/t/')) {
        const withProto = /^https?:\/\//i.test(value) ? value : 'https://' + value.replace(/^\/+/, '');
        const url = new URL(withProto, window.location.origin);
        const fromQuery = url.searchParams.get('c') || url.searchParams.get('code');
        if (fromQuery) value = fromQuery;
        else {
          const parts = url.pathname.split('/').filter(Boolean);
          const tIndex = parts.indexOf('t');
          if (tIndex >= 0 && parts[tIndex + 1]) value = parts[tIndex + 1];
        }
      }
    } catch (err) {
      /* keep raw */
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/^\/+|\/+$/g, '');
  }

  function clearError() {
    if (!loginError) return;
    loginError.hidden = true;
    loginError.textContent = '';
    loginPanel?.classList.remove('is-error');
  }

  function showError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.hidden = false;
    if (!loginPanel || reducedMotion()) return;
    loginPanel.classList.remove('is-error');
    // Restart the class-driven keyframes even when the same error repeats.
    void loginPanel.offsetWidth;
    loginPanel.classList.add('is-error');
  }

  function setBusy(on) {
    busy = on;
    if (loginSubmit) {
      loginSubmit.disabled = on;
      loginSubmit.textContent = on ? 'Проверяем…' : submitLabel;
    }
    if (loginInput) loginInput.disabled = on;
    if (passwordInput) passwordInput.disabled = on;
  }

  function showLoginMode(on) {
    if (!stage || !loginPanel) return;
    stage.classList.toggle('is-login', on);
    loginPanel.hidden = !on;
    if (lead) lead.textContent = on ? leadLogin : leadDefault;
    clearError();
    if (!on) return;
    const target = loginInput?.value.trim() ? passwordInput : loginInput;
    target?.focus();
  }

  function readRemembered() {
    try {
      const raw = localStorage.getItem(REMEMBER_KEY);
      if (!raw) return '';
      const data = JSON.parse(raw);
      return normalizeLogin(data?.login || '');
    } catch (err) {
      return '';
    }
  }

  function saveRemembered(login) {
    try {
      if (login) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ login, at: Date.now() }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (err) {
      /* private mode */
    }
  }

  function treePathOf(data) {
    const raw = String(data.path || '').trim() || '/' + String(data.treeDir || '') + '/';
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return '';
      return url.pathname;
    } catch (err) {
      return '';
    }
  }

  /** Returns false when the answer is unusable, so the caller can re-enable the form. */
  function enterTree(data) {
    const path = treePathOf(data);
    const token = String(data.sessionToken || '');
    if (!path || !token) return false;

    saveRemembered(rememberInput?.checked ? normalizeLogin(data.login || loginInput?.value) : '');
    if (typeof window.NekRemember === 'function') {
      window.NekRemember(path, String(data.title || ''));
    }

    const target = path + '?nek=' + encodeURIComponent(token);
    if (reducedMotion()) {
      window.location.assign(target);
      return true;
    }
    loginPanel?.classList.add('is-done');
    stage?.classList.add('is-done');
    window.setTimeout(() => window.location.assign(target), 400);
    return true;
  }

  async function login() {
    if (busy) return;
    const loginValue = normalizeLogin(loginInput?.value);
    const password = String(passwordInput?.value || '');
    if (loginInput) loginInput.value = loginValue;

    if (!loginValue || !password) {
      showError('Введите логин и пароль семьи');
      (!loginValue ? loginInput : passwordInput)?.focus();
      return;
    }

    clearError();
    setBusy(true);

    let session = null;
    let failure = '';
    let wrongCredentials = false;
    try {
      const response = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login-tree', login: loginValue, password }),
      });
      const data = await response.json().catch(() => ({}));
      const apiError = String(data.error || '').trim();

      if (response.status === 429) {
        // Wait time is decided by the server; show its text as is.
        failure = apiError || 'Попробуйте позже';
      } else if (!response.ok || !data.ok) {
        failure = apiError || 'Неверный логин или пароль';
        wrongCredentials = true;
      } else {
        session = data;
      }
    } catch (err) {
      failure = 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
    }

    if (session && enterTree(session)) return;

    setBusy(false);
    showError(failure || 'Не удалось открыть древо. Попробуйте ещё раз.');
    if (wrongCredentials && passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  loginOpen?.addEventListener('click', () => showLoginMode(true));
  loginCancel?.addEventListener('click', () => showLoginMode(false));

  loginPanel?.addEventListener('submit', (event) => {
    event.preventDefault();
    void login();
  });

  loginInput?.addEventListener('input', clearError);
  passwordInput?.addEventListener('input', clearError);

  passwordToggle?.addEventListener('click', () => {
    if (!passwordInput) return;
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    passwordToggle.textContent = show ? 'Скрыть' : 'Показать';
    passwordToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
    passwordInput.focus();
  });

  const remembered = readRemembered();
  if (remembered && loginInput) {
    loginInput.value = remembered;
    if (rememberInput) rememberInput.checked = true;
  }

  const params = new URLSearchParams(window.location.search);

  // Invite links (/t/<code>) land here as ?login=1&u=<code> to prefill the login.
  const invited = normalizeLogin(params.get('u') || params.get('c') || params.get('code'));
  if (invited && loginInput) {
    loginInput.value = invited;
  }

  if (params.get('login') === '1' || invited) {
    showLoginMode(true);
  }

  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw && recent && recentLink) {
      const data = JSON.parse(raw);
      const path = String(data?.path || '').trim();
      const title = String(data?.title || '').trim();
      if (path.startsWith('/') && !path.startsWith('//')) {
        recentLink.href = path;
        recentLink.textContent = title
          ? `Открыть «${title}»`
          : 'Открыть последнее древо';
        recent.hidden = false;
      }
    }
  } catch (err) {
    /* ignore broken storage */
  }

  window.NekRemember = function rememberTree(path, title) {
    try {
      localStorage.setItem(
        RECENT_KEY,
        JSON.stringify({
          path: String(path || ''),
          title: String(title || ''),
          at: Date.now(),
        })
      );
    } catch (err) {
      /* private mode */
    }
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    try {
      if (localStorage.getItem(PWA_DISMISS_KEY) === '1') return;
    } catch (err) {
      /* ignore */
    }
    if (pwaBanner) pwaBanner.hidden = false;
  });

  pwaInstall?.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try {
      await deferredInstall.userChoice;
    } catch (err) {
      /* ignore */
    }
    deferredInstall = null;
    if (pwaBanner) pwaBanner.hidden = true;
  });

  pwaDismiss?.addEventListener('click', () => {
    if (pwaBanner) pwaBanner.hidden = true;
    try {
      localStorage.setItem(PWA_DISMISS_KEY, '1');
    } catch (err) {
      /* ignore */
    }
  });
})();
