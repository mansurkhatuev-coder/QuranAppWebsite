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
  const toggleAuto = document.getElementById('toggle-auto');

  let accessToken = '';
  let state = null;
  let pollTimer = null;
  let tickTimer = null;
  let detailedResults = null;
  let detailedResultsKey = '';
  let detailedResultsLoading = false;
  let lastBoardContentKey = '';
  let syncingAutoToggle = false;
  let controlBusy = false;

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
    if (q.type === 'letter_grid' && Array.isArray(p.correct_letters)) {
      return `Правильные буквы: ${p.correct_letters.join(' · ')}`;
    }
    if (q.type === 'rule_choice') {
      const ids = Array.isArray(p.correct_rule_ids)
        ? p.correct_rule_ids
        : p.correct_rule_id
          ? [p.correct_rule_id]
          : [];
      if (!ids.length) return '';
      const labels = ids.map((id) => {
        const opt = (p.options || []).find((o) => String(o.id) === String(id));
        return opt?.label || id;
      });
      return `Правильные правила: ${labels.join(' · ')}`;
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
    } else if (q.type === 'letter_grid') {
      const title = p.rule_title ? `Сетка букв · ${p.rule_title}` : 'Сетка букв';
      html = `<p class="academy-muted">${A.escapeHtml(title)}</p>`;
    } else if (q.type === 'rule_choice') {
      const word = p.word ? String(p.word) : '';
      html = word
        ? `<p class="academy-rule-word" lang="ar" dir="rtl">${A.escapeHtml(word)}</p>`
        : `<p class="academy-muted">Слово → правило</p>`;
    }
    if (reveal) {
      const correct = formatCorrect(q);
      if (correct) html += `<p class="academy-ok" style="margin-top:0.75rem">${A.escapeHtml(correct)}</p>`;
    }
    optionsBox.innerHTML = html || '';
    optionsBox.hidden = !html;
  }

  function isOpenLesson() {
    return state?.settings?.mode === 'open';
  }

  function isFinishedPhase() {
    return state?.phase === 'results' || state?.status === 'finished';
  }

  function captureBoardUi() {
    const scroller = boardBox.querySelector('.academy-report-list, .academy-board-list');
    const openIds = Array.from(boardBox.querySelectorAll('details[open]'))
      .map((el) => el.getAttribute('data-participant-id'))
      .filter(Boolean);
    return {
      scrollTop: scroller ? scroller.scrollTop : 0,
      openIds,
    };
  }

  function restoreBoardUi(ui) {
    if (!ui) return;
    const apply = () => {
      (ui.openIds || []).forEach((id) => {
        const el = boardBox.querySelector(`details[data-participant-id="${CSS.escape(id)}"]`);
        if (el) el.open = true;
      });
      const scroller = boardBox.querySelector('.academy-report-list, .academy-board-list');
      if (scroller && Number(ui.scrollTop) > 0) scroller.scrollTop = ui.scrollTop;
    };
    apply();
    requestAnimationFrame(apply);
  }

  function setBoardHtml(contentKey, html) {
    if (contentKey && contentKey === lastBoardContentKey) return false;
    const ui = captureBoardUi();
    lastBoardContentKey = contentKey || '';
    boardBox.innerHTML = html;
    restoreBoardUi(ui);
    return true;
  }

  function boardProgressFingerprint(board) {
    return (board || [])
      .map(
        (r) =>
          `${r.participant_id}:${r.progress_answered || 0}:${r.progress_correct || 0}:${
            r.personal_finished ? 1 : 0
          }:${r.answered ? 1 : 0}:${r.is_correct}`
      )
      .join('|');
  }

  function resultsFingerprint(data) {
    const people = data?.participants || [];
    const answers = data?.answers || [];
    const peoplePart = people.map((p) => `${p.id}:${p.display_name}`).join(',');
    const answersPart = answers
      .map(
        (a) =>
          `${a.participant_id}:${a.question_index}:${a.is_correct}:${a.answer_label || ''}:${
            a.score || 0
          }`
      )
      .join('|');
    return `${peoplePart}#${answersPart}`;
  }

  function buildPersonRows(results, unansweredLabel) {
    const people = results?.participants || [];
    const answers = results?.answers || [];
    const questions = results?.questions || [];
    const byPerson = {};
    people.forEach((p) => {
      byPerson[p.id] = { id: p.id, name: p.display_name, correct: 0, answered: 0, total: 0, answers: [] };
    });
    answers.forEach((a) => {
      const pid = a.participant_id;
      if (!pid) return;
      if (!byPerson[pid]) {
        byPerson[pid] = { id: pid, name: 'Ученик', correct: 0, answered: 0, total: 0, answers: [] };
      }
      const person = byPerson[pid];
      person.answered += 1;
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
          word: q.word,
          answer_label: unansweredLabel,
          correct_label: q.correct_label,
        });
        person.total += 1;
      });
    });
    return Object.values(byPerson).sort(
      (a, b) => b.correct - a.correct || a.name.localeCompare(b.name, 'ru')
    );
  }

  function renderDetailedReportBoard(results, opts) {
    const options = opts || {};
    const live = Boolean(options.live);
    const unansweredLabel = live ? 'ещё нет ответа' : 'нет ответа';
    const rows = buildPersonRows(results, unansweredLabel);
    const questions = results?.questions || [];
    const allCorrect = rows.reduce((s, r) => s + r.correct, 0);
    const allAnswered = rows.reduce((s, r) => s + r.answered, 0);
    const allTotal = rows.reduce((s, r) => s + r.total, 0);

    statsBox.hidden = false;
    if (live) {
      statsBox.innerHTML = `
      <div><strong>${rows.length}</strong><span>учеников</span></div>
      <div><strong>${questions.length}</strong><span>вопросов</span></div>
      <div><strong>${allCorrect}</strong><span>верно</span></div>
      <div><strong>${allAnswered}</strong><span>ответов</span></div>
    `;
    } else {
      statsBox.innerHTML = `
      <div><strong>${rows.length}</strong><span>учеников</span></div>
      <div><strong>${questions.length}</strong><span>вопросов</span></div>
      <div><strong>${allCorrect}</strong><span>верно</span></div>
      <div><strong>${Math.max(0, allTotal - allCorrect)}</strong><span>ошибки / пропуск</span></div>
    `;
    }

    const contentKey = `detailed|${live ? 'live' : 'final'}|${resultsFingerprint(results)}`;
    const html = rows.length
      ? `<ul class="academy-report-list">${rows
          .map((r) => {
            const details = r.answers
              .slice()
              .sort((a, b) => (Number(a.question_index) || 0) - (Number(b.question_index) || 0))
              .map((a) => A.renderAnswerReviewItem(a, { showCorrectAlways: true }))
              .join('');
            const summary = live
              ? `${r.correct} верно · ${r.answered}/${questions.length || r.total} ответов`
              : `${r.correct} из ${r.total} верно`;
            const pct =
              live && r.answered
                ? Math.round((r.correct / r.answered) * 100) + '%'
                : r.total
                  ? Math.round((r.correct / r.total) * 100) + '%'
                  : '—';
            return `<li class="academy-report-person">
              <details data-participant-id="${A.escapeHtml(String(r.id || ''))}">
                <summary>
                  <span class="academy-report-person__main">
                    <strong>${A.escapeHtml(r.name)}</strong>
                    <span class="academy-muted">${A.escapeHtml(summary)}</span>
                  </span>
                  <span class="academy-time">${pct}</span>
                </summary>
                <ul class="academy-answer-review-list">${
                  details ||
                  '<li class="academy-muted">Этот ученик ещё не ответил ни на один вопрос</li>'
                }</ul>
              </details>
            </li>`;
          })
          .join('')}</ul>`
      : '<p class="academy-muted">В этом занятии не было учеников</p>';
    setBoardHtml(contentKey, html);
  }

  async function loadDetailedResults(key, { live = false } = {}) {
    if (!state) return;
    if (key === detailedResultsKey && detailedResults) {
      renderDetailedReportBoard(detailedResults, { live });
      return;
    }
    if (key === detailedResultsKey && detailedResultsLoading) return;
    detailedResultsKey = key;
    detailedResultsLoading = true;
    if (!detailedResults) {
      setBoardHtml(`loading|${key}`, '<p class="academy-muted">Загружаем разбор ответов…</p>');
      statsBox.hidden = true;
    }
    try {
      const data = await A.callLive('results', { session_id: state.id }, { accessToken });
      if (detailedResultsKey !== key) return;
      detailedResults = data;
      renderDetailedReportBoard(detailedResults, { live });
    } catch (_) {
      if (detailedResultsKey !== key) return;
      if (!detailedResults) {
        setBoardHtml(
          `error|${key}`,
          '<p class="academy-muted">Не удалось загрузить полный разбор ответов</p>'
        );
      }
    } finally {
      if (detailedResultsKey === key) detailedResultsLoading = false;
    }
  }

  function renderSimpleBoard() {
    const board = state?.board || [];
    const stats = state?.stats || {};
    if (!board.length) {
      statsBox.hidden = true;
      setBoardHtml('empty', '<p class="academy-muted">Пока никого — ждите вход по коду</p>');
      return;
    }

    statsBox.hidden = false;
    if (state?.stats?.open_mode || isOpenLesson()) {
      statsBox.innerHTML = `
      <div><strong>${stats.answered || 0}</strong><span>готовы</span></div>
      <div><strong>${stats.waiting || 0}</strong><span>ещё идут</span></div>
      <div><strong>${stats.participants || 0}</strong><span>всего</span></div>
    `;
    } else {
      statsBox.innerHTML = `
      <div><strong>${stats.answered || 0}</strong><span>ответили</span></div>
      <div><strong>${stats.waiting || 0}</strong><span>ждут</span></div>
      <div><strong>${stats.correct || 0}</strong><span>верно</span></div>
      <div><strong>${stats.wrong || 0}</strong><span>ошибка</span></div>
      <div><strong>${formatMs(stats.avg_ms)}</strong><span>среднее</span></div>
      <div><strong>${formatMs(stats.fastest_ms)}</strong><span>быстрее всех</span></div>
    `;
    }

    const spoil = state.phase === 'reveal' || state.phase === 'results';
    // Exam / reveal_answers=never: do not leak answers or marks on the projector mid-lesson.
    const allowSpoil =
      spoil &&
      (state.settings?.reveal_answers !== 'never' ||
        state.phase === 'results' ||
        state.status === 'finished');
    const open = isOpenLesson() || state?.stats?.open_mode;
    const contentKey = `simple|${open ? 1 : 0}|${allowSpoil ? 1 : 0}|${state.phase}|${boardProgressFingerprint(
      board
    )}`;
    const html = `<ul class="academy-board-list">${board
      .map((row) => {
        let mark = '';
        if (open) {
          if (row.personal_finished) {
            mark = '<span class="academy-pill academy-pill--ok">готово</span>';
          } else if (row.answered) {
            mark = `<span class="academy-pill">${A.escapeHtml(
              String(row.progress_answered || 0)
            )}/${A.escapeHtml(String(row.progress_total || state.question_count || '—'))}</span>`;
          } else {
            mark = '<span class="academy-pill academy-pill--wait">ждёт…</span>';
          }
        } else if (row.answered && allowSpoil) {
          if (row.is_correct === true) mark = '<span class="academy-pill academy-pill--ok">верно</span>';
          else if (row.is_correct === false) mark = '<span class="academy-pill academy-pill--bad">ошибка</span>';
          else mark = '<span class="academy-pill">принято</span>';
        } else if (row.answered && state.phase === 'answering') {
          mark = '<span class="academy-pill">ответил</span>';
        } else if (row.answered && spoil && !allowSpoil) {
          mark = '<span class="academy-pill">ответил</span>';
        } else if (!row.answered && state.phase === 'answering') {
          mark = '<span class="academy-pill academy-pill--wait">думает…</span>';
        }
        const detail = open
          ? A.escapeHtml(row.answer_label || 'ещё не начал')
          : !row.answered
            ? 'ещё не ответил'
            : allowSpoil
              ? A.escapeHtml(row.answer_label || '—')
              : 'ответ принят';
        return `<li>
          <div>
            <strong>${A.escapeHtml(row.display_name)}</strong>
            <div class="academy-muted">${detail}</div>
          </div>
          <div class="academy-board-meta">
            <span class="academy-time">${!open && row.answered ? formatMs(row.response_ms) : '—'}</span>
            ${mark}
          </div>
        </li>`;
      })
      .join('')}</ul>`;
    setBoardHtml(contentKey, html);
  }

  function renderBoard() {
    if (isFinishedPhase()) {
      const key = `${state.id}|${state.version}|final`;
      loadDetailedResults(key, { live: false });
      return;
    }

    const open = isOpenLesson() || state?.stats?.open_mode;
    if (open) {
      // Live open lesson: host can see per-question review without finishing the session.
      const board = state?.board || [];
      if (!board.length && !detailedResults) {
        renderSimpleBoard();
        return;
      }
      const key = `${state.id}|open|${boardProgressFingerprint(board)}`;
      if (key === detailedResultsKey && detailedResults) {
        renderDetailedReportBoard(detailedResults, { live: true });
        return;
      }
      // Keep the last detailed snapshot on screen while a newer one loads.
      if (detailedResults) renderDetailedReportBoard(detailedResults, { live: true });
      else renderSimpleBoard();
      loadDetailedResults(key, { live: true });
      return;
    }

    detailedResults = null;
    detailedResultsKey = '';
    detailedResultsLoading = false;
    renderSimpleBoard();
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
    const open = isOpenLesson();
    const inLobby = state.status === 'lobby' || state.phase === 'lobby';
    const answering = state.phase === 'answering' && state.status === 'live';
    const finished = state.status === 'finished' || state.phase === 'results';
    const autoOn = state.settings?.auto_advance !== false;
    const examSafe = state.settings?.reveal_answers === 'never';
    btnStart.disabled = finished || open || (!inLobby && state.status !== 'paused');
    btnReveal.disabled = open || !answering;
    btnReveal.textContent = examSafe ? 'Закрыть приём' : 'Показать ответ';
    btnNext.disabled = open || finished || inLobby || (autoOn && answering);
    btnFinish.disabled = finished;
    if (toggleAuto && !syncingAutoToggle) {
      toggleAuto.checked = open ? false : autoOn;
      toggleAuto.disabled = finished || open;
    }
    const autoWrap = document.getElementById('auto-toggle-wrap');
    if (autoWrap) autoWrap.hidden = open;
    btnReveal.hidden = open;
    btnNext.hidden = open;
    btnStart.hidden = open;
  }

  function render() {
    if (!state) return;
    const open = isOpenLesson();
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
    const autoNote = open || state.settings?.auto_advance === false ? '' : ' · автодалее';
    const examNote = state.settings?.reveal_answers === 'never' ? ' · зачёт' : '';
    const openNote = open ? ' · открытый урок' : '';
    const lateNote = state.settings?.allow_late_join === false ? ' · без опоздавших' : '';
    if (open) {
      metaEl.textContent = `${statusRu}${openNote} · учеников ${state.participants || 0} · готовы ${
        state.answered || 0
      } · ещё идут ${state.stats?.waiting ?? Math.max(0, (state.participants || 0) - (state.answered || 0))}${lateNote}`;
    } else {
      metaEl.textContent = `${statusRu} · ${phaseRu} · вопрос ${Number(state.current_index) + 1}/${
        state.question_count
      } · ответили ${state.answered || 0} из ${state.participants || 0}${timerNote}${autoNote}${examNote}${lateNote}`;
    }

    const showKeys =
      state.phase === 'reveal' && state.settings?.reveal_answers !== 'never';
    if (open) {
      questionBox.hidden = false;
      questionBox.textContent =
        'Открытый урок: ученики проходят сами. Раскройте ученика — видно каждый вопрос, верно/ошибка и ответы.';
      renderOptions(null, false);
    } else if (state.current_question && (state.phase === 'answering' || state.phase === 'reveal')) {
      questionBox.hidden = false;
      questionBox.textContent = state.current_question.prompt || '—';
      renderOptions(state.current_question, showKeys);
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

  async function control(command, extra) {
    if (!state || controlBusy) return;
    showError('');
    controlBusy = true;
    btnStart.disabled = true;
    btnReveal.disabled = true;
    btnNext.disabled = true;
    btnFinish.disabled = true;
    try {
      const data = await A.callLive(
        'control',
        {
          session_id: state.id,
          command,
          expected_version: state.version,
          ...(extra || {}),
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
    } finally {
      controlBusy = false;
      updateButtons();
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
  toggleAuto?.addEventListener('change', async () => {
    if (!state || syncingAutoToggle) return;
    const enabled = toggleAuto.checked;
    syncingAutoToggle = true;
    try {
      await control('set_auto', {
        auto_advance: enabled,
        auto_advance_on_all: enabled,
      });
    } finally {
      syncingAutoToggle = false;
      updateButtons();
    }
  });
  window.addEventListener('beforeunload', () => {
    clearInterval(pollTimer);
    clearInterval(tickTimer);
  });

  init();
})();
