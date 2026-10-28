(function (global) {
  const PASSWORD = 'гуно';
  const SESSION_KEY = 'ce_workbench_gate_v1';
  const SCOPE = 'ce-workbench';

  function normalize(value) {
    return String(value ?? '').trim();
  }

  function isUnlocked() {
    try {
      return global.sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  function unlock() {
    try {
      global.sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function hasAdminSession() {
    try {
      const session = await global.AdminSupabase?.getSession?.();
      return Boolean(session?.access_token);
    } catch {
      return false;
    }
  }

  function mountGate(onSuccess) {
    const gate = global.document.getElementById('ce-gate');
    const app = global.document.getElementById('ce-app');
    const form = global.document.getElementById('ce-gate-form');
    const input = global.document.getElementById('ce-gate-password');
    const error = global.document.getElementById('ce-gate-error');

    function showApp() {
      if (gate) gate.hidden = true;
      if (app) app.hidden = false;
      if (typeof onSuccess === 'function') onSuccess();
    }

    if (!gate || !app) {
      if (typeof onSuccess === 'function') onSuccess();
      return;
    }

    void (async () => {
      if (isUnlocked()) {
        showApp();
        return;
      }

      if (await hasAdminSession()) {
        unlock();
        showApp();
        return;
      }

      app.hidden = true;
      gate.hidden = false;

      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        if (error) error.hidden = true;

        try {
          global.AuthLock?.assertAllowed?.(SCOPE);
        } catch (lockError) {
          if (error) {
            error.hidden = false;
            error.textContent =
              lockError instanceof Error ? lockError.message : 'Слишком много попыток';
          }
          return;
        }

        if (normalize(input?.value) === PASSWORD) {
          global.AuthLock?.clear?.(SCOPE);
          unlock();
          showApp();
          return;
        }

        const snap = global.AuthLock?.recordFailure?.(SCOPE);
        if (error) {
          error.hidden = false;
          error.textContent = snap?.locked ? snap.message : 'Неверный пароль';
        }
        input?.select();
        input?.focus();
      });

      input?.focus();
    })();
  }

  global.CeWorkbenchGate = { mountGate };
})(window);
