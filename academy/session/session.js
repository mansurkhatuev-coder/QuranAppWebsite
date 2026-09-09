(function () {
  const A = window.AcademyLive;
  const pinEl = document.getElementById('session-pin');
  const metaEl = document.getElementById('session-meta');
  const questionBox = document.getElementById('question-box');
  const optionsBox = document.getElementById('options-box');
  const peopleBox = document.getElementById('people-box');
  const errorEl = document.getElementById('session-error');
  const joinLink = document.getElementById('join-link');
  const btnStart = document.getElementById('btn-start');
  const btnReveal = document.getElementById('btn-reveal');
  const btnNext = document.getElementById('btn-next');
  const btnFinish = document.getElementById('btn-finish');

  let accessToken = '';
  let state = null;
  let pollTimer = null;

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message ? A.humanizeError(message) : '';
  }

  function formatCorrect(q) {
    if (!q) return '';
    const p = q.payload || {};
    if (q.type === 'single_choice' || q.type === 'image_choice') {
      const opt = (p.options || []).find((o) => String(o.id) === String(p.correct_option_id));
      return opt ? `Правильный ответ: ${opt.label}` : '';
    }
    if (q.type === 'true_false') {
      return `Правильный ответ: ${p.correct ? 'Верно' : 'Неверно'}`;
    }
    if (q.type === 'short_text' && Array.isArray(p.accepted)) {
      return `Правильные ответы: ${p.accepted.join(', ')}`;
    }
    return '';
  }

  function renderOptions(q, reveal) {
    if (!optionsBox) return;
    if (!q) {
      optionsBox.hidden = true;
      optionsBox.innerHTML = '';
      return;
    }
    const p = q.payload || {};
    let html = '';
    if ((q.type === 'single_choice' || q.type === 'image_choice') && Array.isArray(p.options)) {
      html = `<ul class="academy-host-options">${p.options
        .map((o) => {
          const mark =
            reveal && String(o.id) === String(p.correct_option_id)
              ? ' <span class="academy-ok">✓</span>'
              : '';
          return `<li>${A.escapeHtml(o.label)}${mark}</li>`;
        })
        .join('')}</ul>`;
    } else if (q.type === 'true_false') {
      html = `<p class="academy-muted">Варианты: Верно / Неверно</p>`;
    } else if (q.type === 'short_text') {
      html = `<p class="academy-muted">Короткий письменный ответ</p>`;
    }
    if (reveal) {
      const correct = formatCorrect(q);
      if (correct) html += `<p class="academy-ok" style="margin-top:0.75rem">${A.escapeHtml(correct)}</p>`;
    }
    optionsBox.innerHTML = html || '';
    optionsBox.hidden = !html;
  }

  function updateButtons() {
    if (!state) return;
    const inLobby = state.status === 'lobby' || state.phase === 'lobby';
    const answering = state.phase === 'answering' && state.status === 'live';
    const revealing = state.phase === 'reveal';
    const finished = state.status === 'finished' || state.phase === 'results';
    btnStart.disabled = finished || (!inLobby && state.status !== 'paused');
    btnReveal.disabled = !answering;
    btnNext.disabled = finished || inLobby;
    btnFinish.disabled = finished;
  }

  function render() {
    if (!state) return;
    pinEl.hidden = false;
    pinEl.textContent = state.code;
    joinLink.innerHTML = `Ссылка для учеников: <a href="${A.escapeHtml(state.join_url)}" target="_blank" rel="noopener">${A.escapeHtml(
      state.join_url
    )}</a>`;
    const statusRu = A.labelStatus(state.status);
    const phaseRu = A.labelPhase(state.phase);
    metaEl.textContent = `${statusRu} · ${phaseRu} · вопрос ${Number(state.current_index) + 1}/${
      state.question_count
    } · ответили ${state.answered || 0} из ${state.participants || 0}`;

    if (state.current_question && (state.phase === 'answering' || state.phase === 'reveal')) {
      questionBox.hidden = false;
      questionBox.textContent = state.current_question.prompt || '—';
      renderOptions(state.current_question, state.phase === 'reveal');
    } else if (state.phase === 'lobby' || state.status === 'lobby') {
      questionBox.hidden = false;
      questionBox.textContent = 'Лобби — ждём учеников, затем «Начать»';
      renderOptions(null, false);
    } else if (state.phase === 'results' || state.status === 'finished') {
      questionBox.hidden = false;
      questionBox.textContent = 'Урок завершён';
      renderOptions(null, false);
    } else {
      questionBox.hidden = true;
      renderOptions(null, false);
    }

    const people = state.people || [];
    peopleBox.textContent = people.length
      ? 'Участники: ' + people.map((p) => p.display_name).join(', ')
      : 'Пока никого';
    updateButtons();
  }

  async function refresh() {
    showError('');
    const sessionId = A.resolveSessionId();
    if (!sessionId) {
      metaEl.textContent = 'Нет id сессии — вернитесь к списку уроков.';
      return;
    }
    const data = await A.callLive('host_state', { session_id: sessionId }, { accessToken });
    state = data.session;
    render();
  }

  async function control(command) {
    if (!state) return;
    showError('');
    try {
      const data = await A.callLive(
        'control',
        {
          session_id: state.id,
          command,
          expected_version: state.version,
        },
        { accessToken }
      );
      state = { ...state, ...data.session };
      render();
    } catch (err) {
      if (err.status === 409 && err.payload?.session) {
        await refresh();
      }
      showError(err.message || String(err));
    }
  }

  async function init() {
    if (!A.canCreateClient()) {
      showError('Supabase не настроен');
      return;
    }
    const client = A.getClient();
    const { data: auth } = await client.auth.getSession();
    if (!auth?.session) {
      location.href = '../';
      return;
    }
    accessToken = auth.session.access_token;
    try {
      await refresh();
    } catch (err) {
      showError(err.message || String(err));
    }
    pollTimer = setInterval(() => {
      refresh().catch(() => {});
    }, 2500);
  }

  document.getElementById('btn-reload').addEventListener('click', () =>
    refresh().catch((e) => showError(e.message))
  );
  btnStart.addEventListener('click', () => control('start'));
  btnReveal.addEventListener('click', () => control('reveal'));
  btnNext.addEventListener('click', () => control('next'));
  btnFinish.addEventListener('click', () => control('finish'));
  window.addEventListener('beforeunload', () => clearInterval(pollTimer));

  init();
})();
