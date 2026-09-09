(function () {
  const A = window.AcademyLive;
  const codeInput = document.getElementById('join-code');
  const nameInput = document.getElementById('join-name');
  const form = document.getElementById('code-form');
  const errorEl = document.getElementById('join-error');
  const codeCard = document.getElementById('code-card');
  const waitingCard = document.getElementById('waiting-card');
  const waitingMeta = document.getElementById('waiting-meta');

  const pendingKey = 'academy_join_pending';

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
  }

  function showWaiting(code, name) {
    codeCard.hidden = true;
    waitingCard.hidden = false;
    waitingMeta.textContent = `${name} · код ${code} · ждём подключение к серверу сессии`;
  }

  function showForm() {
    codeCard.hidden = false;
    waitingCard.hidden = true;
  }

  function prefill() {
    const code = A.resolveJoinCode();
    if (code) codeInput.value = code;

    const savedCode = code || codeInput.value;
    if (savedCode) {
      const resume = A.loadResume(savedCode);
      if (resume?.display_name) nameInput.value = resume.display_name;
    }

    try {
      const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
      if (pending?.code && pending?.display_name) {
        codeInput.value = pending.code;
        nameInput.value = pending.display_name;
        showWaiting(pending.code, pending.display_name);
      }
    } catch (_) {
      /* ignore */
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showError('');
    const code = codeInput.value.trim();
    const name = nameInput.value.trim();
    if (!/^\d{4,8}$/.test(code)) {
      showError('Код — от 4 до 8 цифр');
      return;
    }
    if (name.length < 2) {
      showError('Введите имя');
      return;
    }

    // Phase 0: persist locally so F5 keeps the lobby intent.
    // Phase 2: call academy-session-join → real resume_token.
    A.saveResume(code, {
      display_name: name,
      participant_id: null,
      resume_token: null,
      phase: 'local_pending',
    });
    try {
      localStorage.setItem(pendingKey, JSON.stringify({ code, display_name: name }));
    } catch (_) {
      /* ignore */
    }

    const url = new URL(location.href);
    url.searchParams.set('c', code);
    history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString());

    showWaiting(code, name);
  });

  document.getElementById('btn-leave').addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (code) A.clearResume(code);
    try {
      localStorage.removeItem(pendingKey);
    } catch (_) {
      /* ignore */
    }
    showForm();
  });

  prefill();
})();
