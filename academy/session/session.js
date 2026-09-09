(function () {
  const A = window.AcademyLive;
  const pinEl = document.getElementById('session-pin');
  const metaEl = document.getElementById('session-meta');
  const questionBox = document.getElementById('question-box');
  const optionsBox = document.getElementById('options-box');
  const boardBox = document.getElementById('board-box');
  const statsBox = document.getElementById('stats-box');
  const timerBox = document.getElementById('timer-box');
  const timerValue = document.getElementById('timer-value');
  const timerBar = document.getElementById('timer-bar');
  const errorEl = document.getElementById('session-error');
  const joinLink = document.getElementById('join-link');
  const btnStart = document.getElementById('btn-start');
  const btnReveal = document.getElementById('btn-reveal');
  const btnNext = document.getElementById('btn-next');
  const btnFinish = document.getElementById('btn-finish');

  let accessToken = '';
  let state = null;
  let pollTimer = null;
  let tickTimer = null;
  let finalResults = null;
  let finalResultsKey = '';
  let finalResultsLoading = false;

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message ? A.humanizeError(message) : '';
  }

  function formatMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const s = Math.max(0, ms) / 1000;
    if (s < 10) return s.toFixed(1).replace('.', ',') + ' с';
    return Math.round(s) + ' с';
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

  function renderFinalResults() {
    if (!finalResults) {
      boardBox.innerHTML = '<p class="academy-muted">Загружаем итоги по всем вопросам…</p>';
      statsBox.hidden = true;
      return;
    }
    const people = finalResults.participants || [];
    const answers = finalResults.answers || [];
    const questions = finalResults.questions || [];
    const byPerson = {};
    people.forEach((p) => {
      byPerson[p.id] = { name: p.display_name, correct: 0, total: 0, answers: [] };
    });
    answers.forEach((a) => {
      if (!byPerson[a.participant_id]) {
        byPerson[a.participant_id] = { name: 'Ученик', correct: 0, total: 0, answers: [] };
      }
      const person = byPerson[a.participant_id];
      person.total += 1;
      if (a.is_correct === true) person.correct += 1;
      person.answers.push(a);
    });
    Object.values(byPerson).forEach((person) => {
      const answeredIdx = new Set(person.answers.map((a) => Number(a.question_index)));
      questions.forEach((q) => {
        const idx = Number(q.index);
        if (answeredIdx.has(idx)) return;
        person.answers.push({
          question_index: idx,
          prompt: q.prompt,
          is_correct: null,
          answer_label: 'нет ответа',
          correct_label: q.correct_label,
        });
        person.total += 1;
      });
    });
    const rows = Object.values(byPerson).sort(
      (a, b) => b.correct - a.correct || a.name.localeCompare(b.name, 'ru')
    );
    const allCorrect = rows.reduce((s, r) => s + r.correct, 0);
    const allTotal = rows.reduce((s, r) => s + r.total, 0);
    statsBox.hidden = false;
    statsBox.innerHTML = `
      <div><strong>${rows.length}</strong><span>учеников</span></div>
      <div><strong>${questions.length}</strong><span>вопросов</span></div>
      <div><strong>${allCorrect}</strong><span>верно</span></div>
      <div><strong>${Math.max(0, allTotal - allCorrect)}</strong><span>ошибки / пропуск</span></div>
    `;
    boardBox.innerHTML = rows.length
      ? `<ul class="academy-report-list">${rows
          .map((r) => {
            const details = r.answers
              .slice()
              .sort((a, b) => (Number(a.question_index) || 0) - (Number(b.question_index) || 0))
              .map((a) => A.renderAnswerReviewItem(a, { showCorrectAlways: true }))
              .join('');
            return `<li class="academy-report-person">
              <details>
                <summary>
                  <span class="academy-report-person__main">
                    <strong>${A.escapeHtml(r.name)}</strong>
                    <span class="academy-muted">${r.correct} из ${r.total} верно</span>
                  </span>
                  <span class="academy-time">${
                    r.total ? Math.round((r.correct / r.total) * 100) + '%' : '—'
                  }</span>
                </summary>
                <ul class="academy-answer-review-list">${details}</ul>
              </details>
            </li>`;
          })
          .join('')}</ul>`
      : '<p class="academy-muted">В этом занятии не было учеников</p>';
  }

  async function loadFinalResults() {
    if (!state) return;
    const key = `${state.id}|${state.version}|final`;
    if (key === finalResultsKey && finalResults) return;
    if (key === finalResultsKey && finalResultsLoading) return;
    finalResultsKey = key;
    finalResultsLoading = true;
    boardBox.innerHTML = '<p class="academy-muted">Загружаем итоги по всем вопросам…</p>';
    statsBox.hidden = true;
    try {
      finalResults = await A.callLive('results', { session_id: state.id }, { accessToken });
      if (finalResultsKey === key) renderFinalResults();
    } catch (_) {
      if (finalResultsKey === key) {
        boardBox.innerHTML = '<p class="academy-muted">Не удалось загрузить полный разбор ответов</p>';
      }
    } finally {
      if (finalResultsKey === key) finalResultsLoading = false;
    }
  }

  function renderBoard() {
    if (state?.phase === 'results' || state?.status === 'finished') {
      if (finalResults && finalResultsKey === `${state.id}|${state.version}|final`) {
        // Keep existing DOM so open student details stay expanded across polls.
        return;
      }
      loadFinalResults();
      return;
    }
    finalResults = null;
    finalResultsKey = '';
    finalResultsLoading = false;
    const board = state?.board || [];
    const stats = state?.stats || {};
    if (!board.length) {
      statsBox.hidden = true;
      boardBox.innerHTML = '<p class="academy-muted">Пока никого — ждите вход по коду</p>';
      return;
    }

    statsBox.hidden = false;
    statsBox.innerHTML = `
      <div><strong>${stats.answered || 0}</strong><span>ответили</span></div>
      <div><strong>${stats.waiting || 0}</strong><span>ждут</span></div>
      <div><strong>${stats.correct || 0}</strong><span>верно</span></div>
      <div><strong>${stats.wrong || 0}</strong><span>ошибка</span></div>
      <div><strong>${formatMs(stats.avg_ms)}</strong><span>среднее</span></div>
      <div><strong>${formatMs(stats.fastest_ms)}</strong><span>быстрее всех</span></div>
    `;

    const showMark = state.phase === 'reveal' || state.phase === 'results' || state.phase === 'answering';
    boardBox.innerHTML = `<ul class="academy-board-list">${board
      .map((row) => {
        let mark = '';
        if (row.answered && showMark) {
          if (row.is_correct === true) mark = '<span class="academy-pill academy-pill--ok">верно</span>';
          else if (row.is_correct === false) mark = '<span class="academy-pill academy-pill--bad">ошибка</span>';
          else mark = '<span class="academy-pill">принято</span>';
        } else if (!row.answered && state.phase === 'answering') {
          mark = '<span class="academy-pill academy-pill--wait">думает…</span>';
        }
        return `<li>
          <div>
            <strong>${A.escapeHtml(row.display_name)}</strong>
            <div class="academy-muted">${row.answered ? A.escapeHtml(row.answer_label || '—') : 'ещё не ответил'}</div>
          </div>
          <div class="academy-board-meta">
            <span class="academy-time">${row.answered ? formatMs(row.response_ms) : '—'}</span>
            ${mark}
          </div>
        </li>`;
      })
      .join('')}</ul>`;
  }

  function updateTimer() {
    if (!state || state.phase !== 'answering' || state.status !== 'live' || !state.phase_ends_at) {
      timerBox.hidden = true;
      return;
    }
    const ends = new Date(state.phase_ends_at).getTime();
    const total = Math.max(1, Number(state.settings?.timer_seconds || 0) * 1000);
    const left = Math.max(0, ends - Date.now());
    timerBox.hidden = false;
    timerValue.textContent = formatMs(left);
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    timerBar.style.width = pct + '%';
    timerBox.classList.toggle('academy-timer--urgent', left <= 5000);
  }

  function updateButtons() {
    if (!state) return;
    const inLobby = state.status === 'lobby' || state.phase === 'lobby';
    const answering = state.phase === 'answering' && state.status === 'live';
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
    const timerNote =
      state.settings?.timer_seconds > 0
        ? ` · таймер ${state.settings.timer_seconds} с`
        : ' · без таймера';
    const autoNote = state.settings?.auto_advance === false ? '' : ' · автодалее';
    metaEl.textContent = `${statusRu} · ${phaseRu} · вопрос ${Number(state.current_index) + 1}/${
      state.question_count
    } · ответили ${state.answered || 0} из ${state.participants || 0}${timerNote}${autoNote}`;

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
      questionBox.textContent = 'Итог — раскройте ученика, чтобы увидеть верные и ошибочные ответы';
      renderOptions(null, false);
    } else {
      questionBox.hidden = true;
      renderOptions(null, false);
    }

    renderBoard();
    updateTimer();
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
      if (err.status === 409) {
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
    }, 2000);
    tickTimer = setInterval(updateTimer, 200);
  }

  document.getElementById('btn-reload').addEventListener('click', () =>
    refresh().catch((e) => showError(e.message))
  );
  btnStart.addEventListener('click', () => control('start'));
  btnReveal.addEventListener('click', () => control('reveal'));
  btnNext.addEventListener('click', () => control('next'));
  btnFinish.addEventListener('click', () => control('finish'));
  window.addEventListener('beforeunload', () => {
    clearInterval(pollTimer);
    clearInterval(tickTimer);
  });

  init();
})();
