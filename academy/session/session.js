(function () {
  const A = window.AcademyLive;
  const pinEl = document.getElementById('session-pin');
  const metaEl = document.getElementById('session-meta');
  const questionBox = document.getElementById('question-box');
  const peopleBox = document.getElementById('people-box');
  const errorEl = document.getElementById('session-error');
  const joinLink = document.getElementById('join-link');

  let accessToken = '';
  let state = null;
  let pollTimer = null;

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
  }

  function render() {
    if (!state) return;
    pinEl.hidden = false;
    pinEl.textContent = state.code;
    joinLink.innerHTML = `Ссылка для учеников: <a href="${A.escapeHtml(state.join_url)}" target="_blank" rel="noopener">${A.escapeHtml(state.join_url)}</a>`;
    metaEl.textContent = `${state.status} / ${state.phase} · вопрос ${Number(state.current_index) + 1}/${state.question_count} · ответили ${state.answered || 0}/${state.participants || 0} · v${state.version}`;
    if (state.current_question && ['answering', 'reveal', 'live'].includes(state.phase)) {
      questionBox.hidden = false;
      questionBox.textContent = state.current_question.prompt || '—';
    } else if (state.phase === 'lobby') {
      questionBox.hidden = false;
      questionBox.textContent = 'Лобби — ждем учеников, затем «Начать»';
    } else if (state.phase === 'results') {
      questionBox.hidden = false;
      questionBox.textContent = 'Урок завершён';
    } else {
      questionBox.hidden = true;
    }
    const people = state.people || [];
    peopleBox.textContent = people.length
      ? 'Участники: ' + people.map((p) => p.display_name).join(', ')
      : 'Пока никого';
  }

  async function refresh() {
    showError('');
    const sessionId = A.resolveSessionId();
    if (!sessionId) {
      metaEl.textContent = 'Нет id сессии';
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

  document.getElementById('btn-reload').addEventListener('click', () => refresh().catch((e) => showError(e.message)));
  document.getElementById('btn-start').addEventListener('click', () => control('start'));
  document.getElementById('btn-reveal').addEventListener('click', () => control('reveal'));
  document.getElementById('btn-next').addEventListener('click', () => control('next'));
  document.getElementById('btn-finish').addEventListener('click', () => control('finish'));
  window.addEventListener('beforeunload', () => clearInterval(pollTimer));

  init();
})();
