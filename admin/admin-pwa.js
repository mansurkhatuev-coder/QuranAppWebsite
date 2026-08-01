(function initAdminPwa() {
  const DISMISS_KEY = 'waydean_admin_pwa_dismiss_v1';
  const EMAIL_KEY = 'waydean_admin_email_v1';

  function $(selector) {
    return document.querySelector(selector);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
        // ignore — PWA install still works on some browsers without SW success toast
      });
    });
  }

  function restoreEmail() {
    const input = $('#login-email');
    if (!input) return;
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) input.value = saved;
    } catch {
      // ignore
    }
  }

  function rememberEmailOnSubmit() {
    const form = $('#login-form');
    const input = $('#login-email');
    if (!form || !input) return;
    form.addEventListener('submit', () => {
      try {
        const value = input.value.trim();
        if (value) localStorage.setItem(EMAIL_KEY, value);
      } catch {
        // ignore
      }
    });
  }

  function setupInstallBanner() {
    const banner = $('#admin-pwa-banner');
    const installBtn = $('#admin-pwa-install');
    const dismissBtn = $('#admin-pwa-dismiss');
    if (!banner || !installBtn || !dismissBtn) return;

    let deferredPrompt = null;

    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // continue
    }

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      banner.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        // ignore
      }
      deferredPrompt = null;
      banner.hidden = true;
    });

    dismissBtn.addEventListener('click', () => {
      banner.hidden = true;
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // ignore
      }
    });
  }

  registerServiceWorker();
  restoreEmail();
  rememberEmailOnSubmit();
  setupInstallBanner();
})();
