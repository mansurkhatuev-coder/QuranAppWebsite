(function initNek() {
  const RECENT_KEY = 'nek:lastTree';
  const stage = document.querySelector('.stage');
  const haveCodeBtn = document.getElementById('have-code-btn');
  const codePanel = document.getElementById('code-panel');
  const codeInput = document.getElementById('code-input');
  const codeError = document.getElementById('code-error');
  const codeCancel = document.getElementById('code-cancel');
  const lead = document.getElementById('lead');
  const recent = document.getElementById('recent');
  const recentLink = document.getElementById('recent-link');

  const leadDefault =
    'Родственники входят по ссылке и паролю семьи. Без регистрации.';
  const leadCode = 'Введите короткий код — откроется вход в нужное древо.';

  function normalizeCode(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/^\/+|\/+$/g, '');
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

  function openInvite(code) {
    const normalized = normalizeCode(code);
    if (!/^[a-z][a-z0-9-]{1,24}$/.test(normalized)) {
      if (codeError) {
        codeError.hidden = false;
        codeError.textContent = 'Проверьте код';
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
})();
