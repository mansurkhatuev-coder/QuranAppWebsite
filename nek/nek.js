(function initNek() {
  const RECENT_KEY = 'nek:lastTree';
  const PWA_DISMISS_KEY = 'nek:pwaDismissed';
  const stage = document.querySelector('.stage');
  const haveCodeBtn = document.getElementById('have-code-btn');
  const codePanel = document.getElementById('code-panel');
  const codeInput = document.getElementById('code-input');
  const codeError = document.getElementById('code-error');
  const codeCancel = document.getElementById('code-cancel');
  const lead = document.getElementById('lead');
  const recent = document.getElementById('recent');
  const recentLink = document.getElementById('recent-link');
  const pwaBanner = document.getElementById('pwa-banner');
  const pwaInstall = document.getElementById('pwa-install');
  const pwaDismiss = document.getElementById('pwa-dismiss');

  const leadDefault =
    'Родственники входят по ссылке и паролю семьи. Без регистрации.';
  const leadCode =
    'Код — из ссылки родственника. Пароль семьи вводите уже на экране входа.';

  let deferredInstall = null;

  function normalizeCode(raw) {
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

  function looksLikeFamilyPassword(raw) {
    const value = String(raw || '').trim();
    if (!value) return false;
    // Cyrillic / mixed family passwords are not invite codes
    return /[а-яёА-ЯЁ]/.test(value);
  }

  function showCodeMode(on) {
    if (!stage || !codePanel) return;
    stage.classList.toggle('is-code', on);
    codePanel.hidden = !on;
    if (lead) lead.textContent = on ? leadCode : leadDefault;
    if (codeError) codeError.hidden = true;
    if (on && codeInput) {
      codeInput.focus();
      codeInput.select();
    }
  }

  function openInvite(raw) {
    if (looksLikeFamilyPassword(raw)) {
      if (codeError) {
        codeError.hidden = false;
        codeError.textContent =
          'Это похоже на пароль семьи, а не на код. Для Хоты код hoti, для Дади — dada. Пароль введёте на следующем экране.';
      }
      return;
    }

    const normalized = normalizeCode(raw);
    if (!/^[a-z][a-z0-9-]{1,24}$/.test(normalized)) {
      if (codeError) {
        codeError.hidden = false;
        codeError.textContent = 'Проверьте код из ссылки (например hoti, dada или demo)';
      }
      return;
    }
    window.location.assign('/t/?c=' + encodeURIComponent(normalized));
  }

  haveCodeBtn?.addEventListener('click', () => showCodeMode(true));
  codeCancel?.addEventListener('click', () => showCodeMode(false));

  codePanel?.addEventListener('submit', (event) => {
    event.preventDefault();
    openInvite(codeInput?.value || '');
  });

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
