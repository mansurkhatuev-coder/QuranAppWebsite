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

  let code = '';
  let resumeToken = '';
  let session = null;
  let myAnswer = null;
  let pollTimer = null;
  let selectedAnswer = null;
  let draftText = '';
  let renderedQuestionKey = '';
  let lastSyncKey = '';

  function showError(el, message) {
    el.hidden = !message;
    el.textContent = message || '';
  }

  function softError(message) {
    return A.humanizeError ? A.humanizeError(message) : message;
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
            `<button type="button" class="academy-btn" style="width:100%;margin-top:0.5rem" data-opt="${A.escapeHtml(
              o.id
            )}" ${locked || myAnswer ? 'disabled' : ''}>${A.escapeHtml(o.label)}</button>`
        )
        .join('');
      playBody.innerHTML = options;
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
      playBody.innerHTML = `
        <button type="button" class="academy-btn" style="width:100%;margin-top:0.5rem" data-tf="true" ${
          locked || myAnswer ? 'disabled' : ''
        }>Верно</button>
        <button type="button" class="academy-btn" style="width:100%;margin-top:0.5rem" data-tf="false" ${
          locked || myAnswer ? 'disabled' : ''
        }>Неверно</button>`;
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
      playBody.innerHTML = `<label style="display:grid;gap:0.35rem;margin-top:0.75rem">Ответ
        <input id="short-answer" maxlength="120" value="${A.escapeHtml(draftText)}" ${
          locked || myAnswer ? 'disabled' : ''
        } />
      </label>`;
      const input = document.getElementById('short-answer');
      if (input && !locked && !myAnswer) {
        input.addEventListener('input', () => {
          draftText = input.value;
        });
      }
      return;
    }
    playBody.innerHTML = `<p class="academy-muted">Этот тип вопроса пока недоступен. Подождите следующий.</p>`;
    submitBtn.hidden = true;
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
      showError(
        playFeedback,
        myAnswer ? 'Ответ принят. Учитель показывает разбор.' : 'Приём ответов закрыт.'
      );
      playFeedback.hidden = false;
      setControlsLocked(true);
      return;
    }

    if (myAnswer) {
      showError(playFeedback, 'Ответ принят');
      playFeedback.hidden = false;
      setControlsLocked(true);
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
      return;
    }

    if (session.phase === 'results' || session.status === 'finished') {
      renderedQuestionKey = '';
      playKicker.textContent = 'Итог';
      playTitle.textContent = 'Урок завершён';
      playBody.innerHTML = `<p class="academy-muted">Спасибо! Учитель видит ваши ответы.</p>`;
      submitBtn.hidden = true;
      playFeedback.hidden = true;
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
        } else {
          captureDraft();
        }
        renderedQuestionKey = qKey;
        renderQuestion(q, { locked: session.phase === 'reveal' || session.status === 'paused' });
      }
      updateAnswerChrome();
    }
  }

  async function syncResume() {
    const data = await A.callLive('resume', { code, resume_token: resumeToken });
    session = data.session;
    myAnswer = data.my_answer;
    persist();
    const key = syncKey();
    if (key === lastSyncKey && !playCard.hidden) {
      return;
    }
    lastSyncKey = key;
    render(false);
  }

  async function join(name) {
    const data = await A.callLive('join', { code, display_name: name });
    resumeToken = data.resume_token;
    session = data.session;
    myAnswer = null;
    selectedAnswer = null;
    draftText = '';
    renderedQuestionKey = '';
    lastSyncKey = syncKey();
    persist();
    render(true);
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
    submitBtn.disabled = true;
    try {
      const data = await A.callLive('submit', {
        resume_token: resumeToken,
        question_index: session.current_index,
        answer,
      });
      myAnswer = data.answer;
      lastSyncKey = syncKey();
      if (data.feedback?.is_correct === true) showError(playFeedback, 'Верно');
      else if (data.feedback?.is_correct === false) showError(playFeedback, 'Пока неверно — смотрите разбор у учителя');
      else showError(playFeedback, 'Ответ принят');
      playFeedback.hidden = false;
      setControlsLocked(true);
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
    const url = new URL(location.href);
    url.searchParams.set('c', code);
    history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString());
    try {
      await join(name);
      if (!pollTimer) pollTimer = setInterval(() => syncResume().catch(() => {}), 2000);
    } catch (err) {
      showError(errorEl, softError(err.message || err));
    }
  });

  submitBtn.addEventListener('click', submitAnswer);
  document.getElementById('btn-leave').addEventListener('click', () => {
    if (code) A.clearResume(code);
    clearInterval(pollTimer);
    pollTimer = null;
    resumeToken = '';
    session = null;
    selectedAnswer = null;
    draftText = '';
    renderedQuestionKey = '';
    lastSyncKey = '';
    codeCard.hidden = false;
    playCard.hidden = true;
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
      } catch (_) {
        /* fall back to form */
      }
    }
  }

  boot();
})();
