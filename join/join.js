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

  function showError(el, message) {
    el.hidden = !message;
    el.textContent = message || '';
  }

  function persist() {
    if (!code) return;
    A.saveResume(code, {
      display_name: nameInput.value.trim(),
      resume_token: resumeToken,
      participant_id: session?.id ? undefined : null,
    });
  }

  function renderQuestion(q) {
    selectedAnswer = null;
    submitBtn.hidden = false;
    submitBtn.disabled = Boolean(myAnswer);
    if (!q) {
      playBody.innerHTML = '';
      return;
    }
    if (q.type === 'single_choice') {
      const options = (q.payload?.options || [])
        .map(
          (o) => `<button type="button" class="academy-btn" style="width:100%;margin-top:0.5rem" data-opt="${A.escapeHtml(o.id)}">${A.escapeHtml(o.label)}</button>`
        )
        .join('');
      playBody.innerHTML = options;
      playBody.onclick = (event) => {
        const btn = event.target.closest('[data-opt]');
        if (!btn || myAnswer) return;
        selectedAnswer = { option_id: btn.getAttribute('data-opt') };
        [...playBody.querySelectorAll('[data-opt]')].forEach((b) => {
          b.classList.toggle('academy-btn--primary', b === btn);
        });
      };
      return;
    }
    if (q.type === 'true_false') {
      playBody.innerHTML = `
        <button type="button" class="academy-btn" style="width:100%;margin-top:0.5rem" data-tf="true">Верно</button>
        <button type="button" class="academy-btn" style="width:100%;margin-top:0.5rem" data-tf="false">Неверно</button>`;
      playBody.onclick = (event) => {
        const btn = event.target.closest('[data-tf]');
        if (!btn || myAnswer) return;
        selectedAnswer = { value: btn.getAttribute('data-tf') === 'true' };
        [...playBody.querySelectorAll('[data-tf]')].forEach((b) => {
          b.classList.toggle('academy-btn--primary', b === btn);
        });
      };
      return;
    }
    if (q.type === 'short_text') {
      playBody.innerHTML = `<label style="display:grid;gap:0.35rem;margin-top:0.75rem">Ответ
        <input id="short-answer" maxlength="120" ${myAnswer ? 'disabled' : ''} />
      </label>`;
      return;
    }
    playBody.innerHTML = `<p class="academy-muted">Тип вопроса пока не поддерживается на этом устройстве. Обновите страницу позже.</p>`;
    submitBtn.hidden = true;
  }

  function render() {
    if (!session) return;
    codeCard.hidden = true;
    playCard.hidden = false;
    showError(playError, '');

    if (session.phase === 'lobby' || session.status === 'lobby') {
      playKicker.textContent = 'Лобби';
      playTitle.textContent = 'Ожидание учителя…';
      playBody.innerHTML = `<p class="academy-muted">Код ${A.escapeHtml(session.code)}. Не закрывайте вкладку — после F5 вернётесь сюда.</p>`;
      submitBtn.hidden = true;
      return;
    }
    if (session.phase === 'results' || session.status === 'finished') {
      playKicker.textContent = 'Итог';
      playTitle.textContent = 'Урок завершён';
      playBody.innerHTML = `<p class="academy-muted">Спасибо! Учитель видит ваши ответы.</p>`;
      submitBtn.hidden = true;
      return;
    }
    if (session.phase === 'answering' || session.phase === 'reveal') {
      const q = session.current_question;
      playKicker.textContent = `Вопрос ${Number(session.current_index) + 1}/${session.question_count}`;
      playTitle.textContent = q?.prompt || '—';
      renderQuestion(q);
      if (myAnswer) {
        showError(playFeedback, 'Ответ принят');
        playFeedback.hidden = false;
      } else {
        playFeedback.hidden = true;
      }
    }
  }

  async function syncResume() {
    const data = await A.callLive('resume', { code, resume_token: resumeToken });
    session = data.session;
    myAnswer = data.my_answer;
    persist();
    render();
  }

  async function join(name) {
    const data = await A.callLive('join', { code, display_name: name });
    resumeToken = data.resume_token;
    session = data.session;
    myAnswer = null;
    persist();
    render();
  }

  async function submitAnswer() {
    showError(playError, '');
    let answer = selectedAnswer;
    if (session?.current_question?.type === 'short_text') {
      const input = document.getElementById('short-answer');
      answer = { text: input?.value || '' };
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
      if (data.feedback?.is_correct === true) showError(playFeedback, 'Верно');
      else if (data.feedback?.is_correct === false) showError(playFeedback, 'Пока неверно — смотрите объяснение у учителя');
      else showError(playFeedback, 'Ответ принят');
      playFeedback.hidden = false;
    } catch (err) {
      showError(playError, err.message || String(err));
      submitBtn.disabled = false;
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
      showError(errorEl, err.message || String(err));
    }
  });

  submitBtn.addEventListener('click', submitAnswer);
  document.getElementById('btn-leave').addEventListener('click', () => {
    if (code) A.clearResume(code);
    clearInterval(pollTimer);
    pollTimer = null;
    resumeToken = '';
    session = null;
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
