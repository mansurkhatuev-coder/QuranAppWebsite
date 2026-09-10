(function () {
  const A = window.AcademyLive;

  const gateView = document.getElementById('gate-view');
  const catalogView = document.getElementById('catalog-view');
  const playView = document.getElementById('play-view');
  const resultView = document.getElementById('result-view');
  const guestBanner = document.getElementById('guest-banner');
  const topAuthLink = document.getElementById('top-auth-link');
  const hubTitle = document.getElementById('hub-title');
  const hubStatus = document.getElementById('hub-status');
  const nameCard = document.getElementById('name-card');
  const nameForm = document.getElementById('name-form');
  const guestName = document.getElementById('guest-name');
  const nameError = document.getElementById('name-error');
  const lessonsCard = document.getElementById('lessons-card');
  const lessonsList = document.getElementById('lessons-list');
  const lessonsEmpty = document.getElementById('lessons-empty');
  const catalogError = document.getElementById('catalog-error');
  const gateError = document.getElementById('gate-error');
  const playKicker = document.getElementById('play-kicker');
  const playTitle = document.getElementById('play-title');
  const playBody = document.getElementById('play-body');
  const playFeedback = document.getElementById('play-feedback');
  const playError = document.getElementById('play-error');
  const submitBtn = document.getElementById('btn-submit-answer');
  const nextBtn = document.getElementById('btn-next-question');
  const resultTitle = document.getElementById('result-title');
  const resultSummary = document.getElementById('result-summary');
  const resultBody = document.getElementById('result-body');
  const resultCta = document.getElementById('result-cta');

  const token = A.resolveHubToken();
  let hub = null;
  let lessons = [];
  let displayName = '';
  let studentSession = null;
  let accessToken = '';
  let isGuest = true;

  let activeLessonId = '';
  let resumeToken = '';
  let session = null;
  let myAnswer = null;
  let selectedAnswer = null;
  let draftText = '';
  let pendingNext = null;

  function showError(el, message) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function friendly(err, fallback) {
    return A.humanizeError(err?.message || err?.code || err, fallback || 'Не получилось. Попробуйте ещё раз.');
  }

  function showView(name) {
    gateView.hidden = name !== 'gate';
    catalogView.hidden = name !== 'catalog';
    playView.hidden = name !== 'play';
    resultView.hidden = name !== 'result';
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

  function persistName() {
    try {
      localStorage.setItem('academy_guest_name:' + token, displayName);
    } catch (_) {
      /* ignore */
    }
  }

  function loadSavedName() {
    try {
      return localStorage.getItem('academy_guest_name:' + token) || '';
    } catch (_) {
      return '';
    }
  }

  function updateGuestChrome() {
    guestBanner.hidden = !isGuest || !hub?.is_open;
    if (isGuest) {
      topAuthLink.textContent = 'Войти';
      topAuthLink.href = '/q/auth/' + (token ? `?t=${encodeURIComponent(token)}` : '');
    } else {
      topAuthLink.textContent = 'Кабинет';
      topAuthLink.href = '/q/cabinet/';
    }
  }

  async function refreshStudentAuth() {
    if (!A.canCreateClient()) return;
    const client = A.getStudentClient();
    const { data } = await client.auth.getSession();
    studentSession = data?.session || null;
    accessToken = studentSession?.access_token || '';
    if (studentSession?.user) {
      isGuest = false;
      try {
        const ensured = await A.callLive(
          'ensure_student',
          { display_name: studentSession.user.user_metadata?.display_name || guestName.value || '' },
          { accessToken }
        );
        if (ensured?.student?.display_name) {
          displayName = ensured.student.display_name;
          guestName.value = displayName;
        }
      } catch (_) {
        /* guest path still works */
        isGuest = true;
        accessToken = '';
      }
    } else {
      isGuest = true;
      accessToken = '';
    }
    updateGuestChrome();
  }

  function renderLessons() {
    if (!lessons.length) {
      lessonsEmpty.hidden = false;
      lessonsList.innerHTML = '';
      return;
    }
    lessonsEmpty.hidden = true;
    lessonsList.innerHTML = lessons
      .map((lesson) => {
        const count = Number(lesson.question_count) || 0;
        return `<li>
          <div class="q-lesson-row">
            <div class="q-lesson-row__copy">
              <strong>${A.escapeHtml(lesson.title)}</strong>
              <span class="academy-muted">${A.escapeHtml(A.labelSubject(lesson.subject))} · ${count} вопр.</span>
            </div>
            <button type="button" class="academy-btn academy-btn--primary" data-start-lesson="${A.escapeHtml(
              lesson.lesson_id
            )}">Начать</button>
          </div>
        </li>`;
      })
      .join('');
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

  function renderQuestion(q, locked) {
    if (!q) {
      playBody.innerHTML = '';
      return;
    }
    if (q.type === 'single_choice') {
      const options = (q.payload?.options || [])
        .map(
          (o) =>
            `<button type="button" class="academy-btn" data-opt="${A.escapeHtml(o.id)}" ${
              locked ? 'disabled' : ''
            }>${A.escapeHtml(o.label)}</button>`
        )
        .join('');
      playBody.innerHTML = `<div class="academy-play-options">${options}</div>`;
      playBody.onclick = (event) => {
        const btn = event.target.closest('[data-opt]');
        if (!btn || locked || myAnswer) return;
        selectedAnswer = { option_id: btn.getAttribute('data-opt') };
        applySelectionHighlight();
      };
      applySelectionHighlight();
      return;
    }
    if (q.type === 'true_false') {
      playBody.innerHTML = `<div class="academy-play-options">
        <button type="button" class="academy-btn" data-tf="true" ${locked ? 'disabled' : ''}>Верно</button>
        <button type="button" class="academy-btn" data-tf="false" ${locked ? 'disabled' : ''}>Неверно</button>
      </div>`;
      playBody.onclick = (event) => {
        const btn = event.target.closest('[data-tf]');
        if (!btn || locked || myAnswer) return;
        selectedAnswer = { value: btn.getAttribute('data-tf') === 'true' };
        applySelectionHighlight();
      };
      applySelectionHighlight();
      return;
    }
    if (q.type === 'short_text') {
      playBody.innerHTML = `<label class="academy-field" style="margin-top:0.85rem">Ответ
        <input id="short-answer" maxlength="120" value="${A.escapeHtml(draftText)}" ${locked ? 'disabled' : ''} />
      </label>`;
      const input = document.getElementById('short-answer');
      if (input && !locked) {
        input.addEventListener('input', () => {
          draftText = input.value;
        });
      }
      return;
    }
    playBody.innerHTML = `<p class="academy-muted">Этот тип вопроса пока недоступен.</p>`;
  }

  function renderPlay() {
    showView('play');
    const q = session?.current_question;
    const idx = Number(session?.current_index) || 0;
    const total = Number(session?.question_count) || 0;
    playKicker.textContent = `Вопрос ${idx + 1}/${total}`;
    playTitle.textContent = q?.prompt || '—';
    const locked = Boolean(myAnswer);
    renderQuestion(q, locked);
    submitBtn.hidden = locked;
    submitBtn.disabled = locked;
    nextBtn.hidden = !pendingNext;
    if (myAnswer && myAnswer.is_correct === true) {
      showError(playFeedback, 'Верно');
    } else if (myAnswer && myAnswer.is_correct === false) {
      showError(playFeedback, 'Ошибка — смотрите правильный разбор в итоге');
    } else if (myAnswer) {
      showError(playFeedback, 'Ответ принят');
    } else {
      playFeedback.hidden = true;
    }
  }

  async function showResults() {
    showView('result');
    resultCta.hidden = !isGuest;
    resultTitle.textContent = session?.lesson_title || 'Урок завершён';
    resultBody.innerHTML = '<p class="academy-muted">Загружаем разбор…</p>';
    try {
      const data = await A.callLive('results', {
        session_id: session.id,
        resume_token: resumeToken,
      });
      const summary = data.summary || {};
      const correct = Number(summary.correct_count) || 0;
      const answered = Number(summary.answered) || 0;
      resultSummary.textContent = `Верно ${correct} из ${answered}`;
      const answers = (data.answers || []).slice().sort(
        (a, b) => (Number(a.question_index) || 0) - (Number(b.question_index) || 0)
      );
      resultBody.innerHTML = answers.length
        ? `<ul class="academy-answer-review-list academy-answer-review-list--plain">${answers
            .map((a) => A.renderAnswerReviewItem(a, { showCorrectAlways: true }))
            .join('')}</ul>`
        : '<p class="academy-muted">Ответов нет.</p>';
    } catch (err) {
      resultSummary.textContent = 'Спасибо! Разбор сейчас недоступен.';
      resultBody.innerHTML = `<p class="academy-error">${A.escapeHtml(friendly(err))}</p>`;
    }
  }

  async function startLesson(lessonId) {
    showError(catalogError, '');
    if (!displayName || displayName.length < 2) {
      showError(nameError, 'Введите имя (хотя бы 2 буквы).');
      nameCard.hidden = false;
      return;
    }
    persistName();
    activeLessonId = lessonId;
    const saved = A.loadAsyncResume(token, lessonId);
    if (saved?.resume_token) {
      resumeToken = saved.resume_token;
      try {
        const data = await A.callLive('async_state', { resume_token: resumeToken });
        session = data.session;
        session.lesson_title = lessons.find((l) => l.lesson_id === lessonId)?.title || 'Урок';
        myAnswer = data.my_answer;
        pendingNext = null;
        if (String(session.status) === 'finished' || String(session.phase) === 'results') {
          await showResults();
          return;
        }
        selectedAnswer = null;
        draftText = '';
        renderPlay();
        return;
      } catch (_) {
        A.clearAsyncResume(token, lessonId);
      }
    }

    const data = await A.callLive(
      'async_start',
      {
        token,
        lesson_id: lessonId,
        display_name: displayName,
        client_fingerprint: getDeviceFingerprint(),
      },
      accessToken ? { accessToken } : undefined
    );
    resumeToken = data.resume_token;
    session = data.session;
    myAnswer = null;
    pendingNext = null;
    selectedAnswer = null;
    draftText = '';
    A.saveAsyncResume(token, lessonId, {
      resume_token: resumeToken,
      display_name: displayName,
      session_id: session.id,
    });
    renderPlay();
  }

  async function loadCatalog() {
    const data = await A.callLive('public_catalog', { token });
    hub = data.hub;
    lessons = data.lessons || [];
    hubTitle.textContent = hub?.title || 'Набор';
    if (data.closed || hub?.is_open === false) {
      hubStatus.textContent = 'Набор закрыт — новые прохождения недоступны.';
      nameCard.hidden = true;
      lessonsCard.hidden = true;
      showView('catalog');
      updateGuestChrome();
      guestBanner.hidden = true;
      return;
    }
    hubStatus.textContent = 'Проходите в своём темпе. Регистрация необязательна.';
    showView('catalog');
    if (displayName.length >= 2) {
      nameCard.hidden = true;
      lessonsCard.hidden = false;
      renderLessons();
    } else {
      nameCard.hidden = false;
      lessonsCard.hidden = true;
    }
    updateGuestChrome();
  }

  nameForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    displayName = guestName.value.trim();
    if (displayName.length < 2) {
      showError(nameError, 'Введите имя (хотя бы 2 буквы).');
      return;
    }
    showError(nameError, '');
    persistName();
    nameCard.hidden = true;
    lessonsCard.hidden = false;
    renderLessons();
  });

  lessonsList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-start-lesson]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await startLesson(btn.getAttribute('data-start-lesson'));
    } catch (err) {
      showError(catalogError, friendly(err, 'Не удалось начать урок.'));
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('btn-back-catalog')?.addEventListener('click', () => {
    pendingNext = null;
    myAnswer = null;
    showView('catalog');
    lessonsCard.hidden = false;
    renderLessons();
  });

  document.getElementById('btn-next-lesson')?.addEventListener('click', () => {
    showView('catalog');
    lessonsCard.hidden = false;
    renderLessons();
  });

  submitBtn?.addEventListener('click', async () => {
    showError(playError, '');
    let answer = selectedAnswer;
    if (!answer) {
      const input = document.getElementById('short-answer');
      if (input) answer = { text: input.value };
    }
    if (!answer || (answer.option_id == null && answer.value == null && !String(answer.text || '').trim())) {
      showError(playError, 'Выберите или введите ответ.');
      return;
    }
    submitBtn.disabled = true;
    try {
      const data = await A.callLive('async_submit', {
        resume_token: resumeToken,
        question_index: Number(session.current_index) || 0,
        answer,
      });
      myAnswer = data.answer;
      if (data.finished) {
        session = { ...session, status: 'finished', phase: 'results' };
        A.clearAsyncResume(token, activeLessonId);
        await showResults();
        return;
      }
      pendingNext = {
        next_index: data.next_index,
        next_question: data.next_question,
      };
      renderPlay();
    } catch (err) {
      showError(playError, friendly(err, 'Не удалось отправить ответ.'));
      submitBtn.disabled = false;
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (!pendingNext) return;
    session = {
      ...session,
      current_index: pendingNext.next_index,
      current_question: pendingNext.next_question,
    };
    myAnswer = null;
    pendingNext = null;
    selectedAnswer = null;
    draftText = '';
    showError(playFeedback, '');
    showError(playError, '');
    renderPlay();
  });

  async function boot() {
    if (!token) {
      showView('gate');
      showError(gateError, 'Откройте ссылку от учителя (параметр t в адресе).');
      return;
    }
    displayName = loadSavedName();
    if (displayName) guestName.value = displayName;
    try {
      await refreshStudentAuth();
      await loadCatalog();
    } catch (err) {
      showView('gate');
      showError(gateError, friendly(err, 'Не удалось открыть набор.'));
    }
  }

  boot();
})();
