(function () {
  const A = window.AcademyLive;
  const codeInput = document.getElementById('join-code');
  const nameInput = document.getElementById('join-name');
  const form = document.getElementById('code-form');
  const errorEl = document.getElementById('join-error');
  const codeCard = document.getElementById('code-card');
  const playCard = document.getElementById('play-card');
  const playKicker = document.getElementById('play-kicker');
  const playTitle = document.getElementById('play-title');
  const playBody = document.getElementById('play-body');
  const playFeedback = document.getElementById('play-feedback');
  const playError = document.getElementById('play-error');
  const submitBtn = document.getElementById('btn-submit-answer');
  const playTimer = document.getElementById('play-timer');
  const playTimerValue = document.getElementById('play-timer-value');
  const playTimerBar = document.getElementById('play-timer-bar');

  let code = '';
  let resumeToken = '';
  let session = null;
  let myAnswer = null;
  let pollTimer = null;
  let tickTimer = null;
  let selectedAnswer = null;
  let draftText = '';
  let renderedQuestionKey = '';
  let lastSyncKey = '';
  let letterGridState = null;

  let lastResultsKey = '';
  let resultsHtml = '';
  let syncFailStreak = 0;

  function showError(el, message) {
    el.hidden = !message;
    el.textContent = message || '';
  }

  function softError(message) {
    return A.humanizeError ? A.humanizeError(message) : message;
  }

  function formatMs(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const s = Math.max(0, ms) / 1000;
    if (s < 10) return s.toFixed(1).replace('.', ',') + ' с';
    return Math.round(s) + ' с';
  }

  function updatePlayTimer() {
    if (
      !session ||
      session.phase !== 'answering' ||
      session.status !== 'live' ||
      !session.phase_ends_at ||
      myAnswer
    ) {
      playTimer.hidden = true;
      return;
    }
    const ends = new Date(session.phase_ends_at).getTime();
    const total = Math.max(1, Number(session.settings?.timer_seconds || 0) * 1000);
    const left = Math.max(0, ends - Date.now());
    playTimer.hidden = false;
    playTimerValue.textContent = formatMs(left);
    playTimerBar.style.width = Math.max(0, Math.min(100, (left / total) * 100)) + '%';
    playTimer.classList.toggle('academy-timer--urgent', left <= 5000);
  }

  function persist() {
    if (!code) return;
    A.saveResume(code, {
      display_name: nameInput.value.trim(),
      resume_token: resumeToken,
    });
  }

  function captureDraft() {
    const input = document.getElementById('short-answer');
    if (input && !input.disabled) draftText = input.value;
  }

  function questionDomKey() {
    const q = session?.current_question;
    return `${session?.phase}|${session?.current_index}|${q?.id || q?.prompt || ''}`;
  }

  function syncKey() {
    return [
      session?.status,
      session?.phase,
      session?.current_index,
      session?.question_count,
      session?.phase_ends_at || '',
      myAnswer ? '1' : '0',
    ].join('|');
  }

  function applySelectionHighlight() {
    if (!selectedAnswer) return;
    if (selectedAnswer.option_id) {
      [...playBody.querySelectorAll('[data-opt]')].forEach((b) => {
        b.classList.toggle('academy-btn--primary', b.getAttribute('data-opt') === selectedAnswer.option_id);
      });
    }
    if (typeof selectedAnswer.value === 'boolean') {
      [...playBody.querySelectorAll('[data-tf]')].forEach((b) => {
        const val = b.getAttribute('data-tf') === 'true';
        b.classList.toggle('academy-btn--primary', val === selectedAnswer.value);
      });
    }
  }

  function setControlsLocked(locked) {
    [...playBody.querySelectorAll('button, input')].forEach((el) => {
      el.disabled = locked;
    });
  }

  function renderQuestion(q, { locked }) {
    submitBtn.hidden = locked;
    submitBtn.disabled = locked || Boolean(myAnswer);
    if (!q) {
      playBody.innerHTML = '';
      return;
    }
    if (q.type === 'single_choice') {
      const options = (q.payload?.options || [])
        .map(
          (o) =>
            `<button type="button" class="academy-btn" data-opt="${A.escapeHtml(o.id)}" ${
              locked || myAnswer ? 'disabled' : ''
            }>${A.escapeHtml(o.label)}</button>`
        )
        .join('');
      playBody.innerHTML = `<div class="academy-play-options">${options}</div>`;
      playBody.onclick = (event) => {
        const btn = event.target.closest('[data-opt]');
        if (!btn || myAnswer || locked || session?.status === 'paused') return;
        selectedAnswer = { option_id: btn.getAttribute('data-opt') };
        applySelectionHighlight();
      };
      applySelectionHighlight();
      return;
    }
    if (q.type === 'true_false') {
      playBody.innerHTML = `<div class="academy-play-options">
        <button type="button" class="academy-btn" data-tf="true" ${
          locked || myAnswer ? 'disabled' : ''
        }>Верно</button>
        <button type="button" class="academy-btn" data-tf="false" ${
          locked || myAnswer ? 'disabled' : ''
        }>Неверно</button>
      </div>`;
      playBody.onclick = (event) => {
        const btn = event.target.closest('[data-tf]');
        if (!btn || myAnswer || locked || session?.status === 'paused') return;
        selectedAnswer = { value: btn.getAttribute('data-tf') === 'true' };
        applySelectionHighlight();
      };
      applySelectionHighlight();
      return;
    }
    if (q.type === 'short_text') {
      playBody.innerHTML = `<label class="academy-field" style="margin-top:0.85rem">Ответ
        <input id="short-answer" name="short-answer" autocomplete="off" enterkeyhint="done" maxlength="120" value="${A.escapeHtml(
          draftText
        )}" ${locked || myAnswer ? 'disabled' : ''} />
      </label>`;
      const input = document.getElementById('short-answer');
      if (input && !locked && !myAnswer) {
        input.addEventListener('input', () => {
          draftText = input.value;
        });
      }
      return;
    }
    if (q.type === 'letter_grid' && window.AcademyZahetTask1?.renderLetterGrid) {
      const Z = window.AcademyZahetTask1;
      if (!letterGridState || letterGridState.questionKey !== questionDomKey()) {
        letterGridState = {
          questionKey: questionDomKey(),
          selected: Array.isArray(selectedAnswer?.letters) ? selectedAnswer.letters.slice() : [],
          confirmed: Boolean(selectedAnswer?.letters?.length && selectedAnswer._confirmed),
        };
      }
      Z.renderLetterGrid(playBody, q, {
        locked: locked || Boolean(myAnswer),
        selected: letterGridState.selected,
        confirmed: letterGridState.confirmed,
      });
      playBody.onclick = (event) => {
        if (myAnswer || locked || session?.status === 'paused') return;
        const cell = event.target.closest('[data-letter]');
        if (cell && !letterGridState.confirmed) {
          const L = cell.getAttribute('data-letter');
          const set = new Set(letterGridState.selected);
          if (set.has(L)) set.delete(L);
          else set.add(L);
          letterGridState.selected = [...set];
          selectedAnswer = null;
          Z.renderLetterGrid(playBody, q, {
            locked: false,
            selected: letterGridState.selected,
            confirmed: false,
          });
          submitBtn.disabled = true;
          return;
        }
        if (event.target.closest('[data-letter-clear]') && !letterGridState.confirmed) {
          letterGridState.selected = [];
          selectedAnswer = null;
          Z.renderLetterGrid(playBody, q, { locked: false, selected: [], confirmed: false });
          submitBtn.disabled = true;
          return;
        }
        if (event.target.closest('[data-letter-confirm]')) {
          if (!letterGridState.selected.length) return;
          letterGridState.confirmed = true;
          selectedAnswer = { letters: letterGridState.selected.slice(), _confirmed: true };
          Z.renderLetterGrid(playBody, q, {
            locked: false,
            selected: letterGridState.selected,
            confirmed: true,
          });
          submitBtn.disabled = false;
          submitBtn.hidden = false;
        }
        if (event.target.closest('[data-letter-edit]')) {
          letterGridState.confirmed = false;
          selectedAnswer = null;
          Z.renderLetterGrid(playBody, q, {
            locked: false,
            selected: letterGridState.selected,
            confirmed: false,
          });
          submitBtn.disabled = true;
        }
      };
      submitBtn.hidden = locked;
      submitBtn.disabled = locked || Boolean(myAnswer) || !letterGridState.confirmed;
      return;
    }
    playBody.innerHTML = `<p class="academy-muted">Этот тип вопроса пока недоступен. Подождите следующий.</p>`;
    submitBtn.hidden = true;
  }

  function formatCorrectHint(q) {
    if (!q?.payload) return '';
    const p = q.payload;
    if (q.type === 'single_choice' || q.type === 'image_choice') {
      const opt = (p.options || []).find((o) => String(o.id) === String(p.correct_option_id));
      return opt ? `Правильный ответ: ${opt.label}` : '';
    }
    if (q.type === 'true_false' && typeof p.correct === 'boolean') {
      return `Правильный ответ: ${p.correct ? 'Верно' : 'Неверно'}`;
    }
    if (q.type === 'short_text' && Array.isArray(p.accepted) && p.accepted.length) {
      return `Правильные ответы: ${p.accepted.join(', ')}`;
    }
    if (q.type === 'letter_grid' && Array.isArray(p.correct_letters)) {
      return `Правильные буквы: ${p.correct_letters.join(' · ')}`;
    }
    return '';
  }

  function updateAnswerChrome() {
    const locked =
      session.phase !== 'answering' || session.status === 'paused' || session.status === 'finished';
    submitBtn.hidden = session.phase !== 'answering' || session.status === 'paused';
    submitBtn.disabled = locked || Boolean(myAnswer);

    if (session.status === 'paused') {
      showError(playFeedback, 'Пауза — подождите учителя');
      playFeedback.hidden = false;
      setControlsLocked(true);
      return;
    }

    if (session.phase === 'reveal') {
      const hint = formatCorrectHint(session.current_question);
      const head = myAnswer ? 'Ответ принят.' : 'Приём ответов закрыт.';
      showError(playFeedback, hint ? `${head} ${hint}` : head);
      playFeedback.hidden = false;
      setControlsLocked(true);
      playTimer.hidden = true;
      // Mark correct option visually when keys are revealed
      const q = session.current_question;
      if (q?.type === 'single_choice' && q.payload?.correct_option_id) {
        [...playBody.querySelectorAll('[data-opt]')].forEach((b) => {
          if (b.getAttribute('data-opt') === String(q.payload.correct_option_id)) {
            b.classList.add('academy-btn--primary');
          }
        });
      }
      if (q?.type === 'true_false' && typeof q.payload?.correct === 'boolean') {
        [...playBody.querySelectorAll('[data-tf]')].forEach((b) => {
          const val = b.getAttribute('data-tf') === 'true';
          if (val === q.payload.correct) b.classList.add('academy-btn--primary');
        });
      }
      if (q?.type === 'letter_grid' && Array.isArray(q.payload?.correct_letters)) {
        const correct = new Set(q.payload.correct_letters.map(String));
        [...playBody.querySelectorAll('[data-letter]')].forEach((b) => {
          if (correct.has(b.getAttribute('data-letter'))) {
            b.classList.add('is-selected', 'academy-letter-cell--ok');
          }
        });
      }
      return;
    }

    if (myAnswer) {
      showError(playFeedback, 'Ответ принят');
      playFeedback.hidden = false;
      setControlsLocked(true);
      playTimer.hidden = true;
    } else {
      playFeedback.hidden = true;
      setControlsLocked(false);
      applySelectionHighlight();
    }
  }

  function render(force) {
    if (!session) return;
    codeCard.hidden = true;
    playCard.hidden = false;
    showError(playError, '');

    if (session.phase === 'lobby' || session.status === 'lobby') {
      renderedQuestionKey = '';
      playKicker.textContent = 'Лобби';
      playTitle.textContent = 'Ожидание учителя…';
      playBody.innerHTML = `<p class="academy-muted">Код ${A.escapeHtml(
        session.code
      )}. Не закрывайте вкладку — после обновления страницы вернётесь сюда.</p>`;
      submitBtn.hidden = true;
      playFeedback.hidden = true;
      playTimer.hidden = true;
      return;
    }

    if (session.phase === 'results' || session.status === 'finished') {
      renderedQuestionKey = '';
      playKicker.textContent = 'Итог';
      playTitle.textContent = 'Урок завершён';
      submitBtn.hidden = true;
      playFeedback.hidden = true;
      playTimer.hidden = true;
      const resultsKey = `${session.id}|${session.version || ''}|results`;
      if (resultsKey !== lastResultsKey) {
        lastResultsKey = resultsKey;
        resultsHtml = '<p class="academy-muted">Загружаем разбор ответов…</p>';
        playBody.innerHTML = resultsHtml;
        A.callLive('results', { session_id: session.id, resume_token: resumeToken })
          .then((data) => {
            if (lastResultsKey !== resultsKey) return;
            const answers = (data.answers || []).slice().sort(
              (a, b) => (Number(a.question_index) || 0) - (Number(b.question_index) || 0)
            );
            const summary = data.summary || {};
            const correct = Number(summary.correct_count) || 0;
            const answered = Number(summary.answered) || answers.length;
            const head = `<p class="academy-muted" style="margin-bottom:0.75rem">Верно ${correct} из ${answered}. Разбор ваших ответов:</p>`;
            const list = answers.length
              ? `<ul class="academy-answer-review-list academy-answer-review-list--plain">${answers
                  .map((a) => A.renderAnswerReviewItem(a, { showCorrectAlways: true }))
                  .join('')}</ul>`
              : '<p class="academy-muted">Вы не отправили ни одного ответа.</p>';
            resultsHtml = head + list;
            playBody.innerHTML = resultsHtml;
          })
          .catch(() => {
            if (lastResultsKey !== resultsKey) return;
            resultsHtml =
              '<p class="academy-muted">Спасибо! Учитель видит ваши ответы. Разбор сейчас недоступен.</p>';
            playBody.innerHTML = resultsHtml;
          });
      } else {
        playBody.innerHTML = resultsHtml;
      }
      return;
    }

    if (session.phase === 'answering' || session.phase === 'reveal') {
      const q = session.current_question;
      playKicker.textContent = `Вопрос ${Number(session.current_index) + 1}/${session.question_count}`;
      playTitle.textContent = q?.prompt || '—';

      const qKey = questionDomKey();
      if (force || renderedQuestionKey !== qKey) {
        const prevIndex = renderedQuestionKey.split('|')[1];
        if (String(session.current_index) !== prevIndex) {
          selectedAnswer = null;
          draftText = '';
          letterGridState = null;
        } else {
          captureDraft();
        }
        renderedQuestionKey = qKey;
        renderQuestion(q, { locked: session.phase === 'reveal' || session.status === 'paused' });
      }
      updateAnswerChrome();
      updatePlayTimer();
    }
  }

  async function syncResume() {
    try {
      const data = await A.callLive('resume', { code, resume_token: resumeToken });
      session = data.session;
      myAnswer = data.my_answer;
      persist();
      syncFailStreak = 0;
      const key = syncKey();
      if (key === lastSyncKey && !playCard.hidden) {
        return;
      }
      lastSyncKey = key;
      render(false);
    } catch (err) {
      syncFailStreak += 1;
      const raw = String(err.message || err || '');
      const fatal = /invalid_token|session_mismatch|forbidden|kicked|не найден/i.test(raw);
      if (fatal || syncFailStreak >= 5) {
        clearInterval(pollTimer);
        clearInterval(tickTimer);
        pollTimer = null;
        tickTimer = null;
        if (fatal && code) A.clearResume(code);
        if (fatal) resumeToken = '';
        session = null;
        codeCard.hidden = false;
        playCard.hidden = true;
        const submit = document.getElementById('join-submit');
        if (submit) submit.disabled = false;
        showError(
          errorEl,
          softError(raw) || (fatal ? 'Сессия прервана — войдите снова.' : 'Нет связи с уроком. Проверьте интернет и войдите снова.')
        );
      }
      throw err;
    }
  }

  function getDeviceFingerprint() {
    try {
      const key = 'academy_device_fp';
      let fp = localStorage.getItem(key);
      if (!fp) {
        fp = 'fp_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(key, fp);
      }
      return fp;
    } catch (_) {
      return '';
    }
  }

  async function join(name) {
    const saved = code ? A.loadResume(code) : null;
    if (saved?.resume_token) {
      resumeToken = saved.resume_token;
      try {
        await syncResume();
        return;
      } catch (_) {
        /* fall through — token expired or kicked */
      }
    }

    const data = await A.callLive('join', {
      code,
      display_name: name,
      client_fingerprint: getDeviceFingerprint(),
    });
    resumeToken = data.resume_token;
    persist();
    // Always sync after join so rejoined students keep prior answers/state.
    await syncResume();
  }

  async function submitAnswer() {
    showError(playError, '');
    if (!session || session.phase !== 'answering' || session.status === 'paused') {
      showError(playError, 'Сейчас нельзя ответить — подождите учителя.');
      return;
    }
    let answer = selectedAnswer;
    if (session?.current_question?.type === 'short_text') {
      const input = document.getElementById('short-answer');
      draftText = input?.value || draftText;
      answer = { text: draftText || '' };
      if (!String(answer.text).trim()) {
        showError(playError, 'Введите ответ');
        return;
      }
    }
    if (!answer) {
      showError(playError, 'Выберите ответ');
      return;
    }
    if (session?.current_question?.type === 'letter_grid') {
      if (!answer._confirmed || !Array.isArray(answer.letters) || !answer.letters.length) {
        showError(playError, 'Отметьте буквы и нажмите «Готово».');
        return;
      }
      answer = { letters: answer.letters.slice() };
    }
    submitBtn.disabled = true;
    try {
      const data = await A.callLive('submit', {
        resume_token: resumeToken,
        question_index: session.current_index,
        answer,
      });
      myAnswer = data.answer;
      lastSyncKey = syncKey();
      showError(playFeedback, 'Ответ принят');
      playFeedback.hidden = false;
      setControlsLocked(true);
      updatePlayTimer();
    } catch (err) {
      showError(playError, softError(err.message || err));
      submitBtn.disabled = Boolean(myAnswer);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError(errorEl, '');
    code = codeInput.value.trim();
    const name = nameInput.value.trim();
    if (!/^\d{4,8}$/.test(code)) return showError(errorEl, 'Код — от 4 до 8 цифр');
    if (name.length < 2) return showError(errorEl, 'Введите имя');
    const submit = document.getElementById('join-submit');
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    const url = new URL(location.href);
    url.searchParams.set('c', code);
    history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString());
    try {
      await join(name);
      if (!pollTimer) pollTimer = setInterval(() => syncResume().catch(() => {}), 2000);
      if (!tickTimer) tickTimer = setInterval(updatePlayTimer, 200);
    } catch (err) {
      showError(errorEl, softError(err.message || err));
      if (submit) submit.disabled = false;
    }
  });

  submitBtn.addEventListener('click', submitAnswer);
  document.getElementById('btn-leave').addEventListener('click', () => {
    if (code) A.clearResume(code);
    clearInterval(pollTimer);
    clearInterval(tickTimer);
    pollTimer = null;
    tickTimer = null;
    resumeToken = '';
    session = null;
    selectedAnswer = null;
    draftText = '';
    renderedQuestionKey = '';
    lastSyncKey = '';
    codeCard.hidden = false;
    playCard.hidden = true;
    const submit = document.getElementById('join-submit');
    if (submit) submit.disabled = false;
  });

  async function boot() {
    const fromUrl = A.resolveJoinCode();
    if (fromUrl) codeInput.value = fromUrl;
    code = codeInput.value.trim() || fromUrl;
    const saved = code ? A.loadResume(code) : null;
    if (saved?.display_name) nameInput.value = saved.display_name;
    if (saved?.resume_token && code) {
      resumeToken = saved.resume_token;
      try {
        await syncResume();
        if (!pollTimer) pollTimer = setInterval(() => syncResume().catch(() => {}), 2000);
        if (!tickTimer) tickTimer = setInterval(updatePlayTimer, 200);
      } catch (_) {
        /* fall back to form */
      }
    }
  }

  boot();
})();
