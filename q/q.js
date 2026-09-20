(function () {
  const A = window.AcademyLive;
  const Courses = window.AcademyCourses;

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
  const autoNextToggle = document.getElementById('toggle-auto-next');
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
  let progressByLesson = {};

  let activeLessonId = '';
  let resumeToken = '';
  let session = null;
  let myAnswer = null;
  let selectedAnswer = null;
  let draftText = '';
  let pendingNext = null;
  let autoNextTimer = null;
  let letterGridState = null;

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

  function progressStorageKey() {
    return 'academy_hub_progress:' + token;
  }

  function loadLocalProgress() {
    try {
      const raw = localStorage.getItem(progressStorageKey());
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalProgress(map) {
    try {
      localStorage.setItem(progressStorageKey(), JSON.stringify(map || {}));
    } catch (_) {
      /* ignore */
    }
  }

  function rememberProgress(lessonId, summary) {
    if (!lessonId) return;
    const answered = Number(summary?.answered) || 0;
    const correct = Number(summary?.correct_count ?? summary?.correct) || 0;
    if (!answered) return;
    const percent = Math.round((correct / answered) * 100);
    const prev = progressByLesson[lessonId];
    if (prev && Number(prev.percent) > percent) return;
    progressByLesson = {
      ...progressByLesson,
      [lessonId]: {
        correct,
        answered,
        percent,
        at: new Date().toISOString(),
      },
    };
    saveLocalProgress(progressByLesson);
  }

  async function refreshServerProgress() {
    if (!accessToken) return;
    try {
      const hist = await A.callLive('student_history', {}, { accessToken });
      (hist.history || []).forEach((row) => {
        if (String(row.status) !== 'finished' && String(row.status) !== 'abandoned') return;
        const lessonId = row.lesson_id;
        if (!lessonId || !lessons.some((l) => l.lesson_id === lessonId)) return;
        const answered = Number(row.answered) || 0;
        const correct = Number(row.correct) || 0;
        if (!answered) return;
        const percent = Math.round((correct / answered) * 100);
        const prev = progressByLesson[lessonId];
        if (prev && Number(prev.percent) >= percent) return;
        progressByLesson[lessonId] = {
          correct,
          answered,
          percent,
          at: row.finished_at || row.started_at || new Date().toISOString(),
        };
      });
      saveLocalProgress(progressByLesson);
    } catch (_) {
      /* local progress still works */
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

  function autoNextStorageKey() {
    return 'academy_auto_next:' + (token || 'default');
  }

  function loadAutoNextPref() {
    try {
      return localStorage.getItem(autoNextStorageKey()) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveAutoNextPref(on) {
    try {
      localStorage.setItem(autoNextStorageKey(), on ? '1' : '0');
    } catch (_) {
      /* ignore */
    }
  }

  function clearAutoNextTimer() {
    if (autoNextTimer) {
      clearTimeout(autoNextTimer);
      autoNextTimer = null;
    }
  }

  function goToPendingNext() {
    if (!pendingNext) return;
    clearAutoNextTimer();
    session = {
      ...session,
      current_index: pendingNext.next_index,
      current_question: pendingNext.next_question,
    };
    myAnswer = null;
    pendingNext = null;
    selectedAnswer = null;
    draftText = '';
    letterGridState = null;
    showError(playFeedback, '');
    showError(playError, '');
    renderPlay();
  }

  function scheduleAutoNextIfNeeded() {
    clearAutoNextTimer();
    if (!pendingNext || !autoNextToggle?.checked) return;
    autoNextTimer = setTimeout(() => {
      goToPendingNext();
    }, 900);
  }

  function applySubmitResult(data) {
    myAnswer = data.answer;
    letterGridState = null;
    showError(playError, '');
    if (data.finished) {
      clearAutoNextTimer();
      session = { ...session, status: 'finished', phase: 'results' };
      A.clearAsyncResume(token, activeLessonId);
      return showResults();
    }
    pendingNext = {
      next_index: data.next_index,
      next_question: data.next_question,
    };
    // After a dropped response the server already advanced — jump without extra tap.
    if (data.synced) {
      goToPendingNext();
      return null;
    }
    renderPlay();
    return null;
  }

  async function recoverAfterSubmitFailure(submittedIndex, err) {
    const code = String(err?.code || '');
    if (code !== 'abort' && code !== 'wrong_question' && code !== 'not_accepting') {
      return false;
    }
    if (code === 'abort') {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    try {
      const state = await A.callLive(
        'async_state',
        { resume_token: resumeToken },
        { timeoutMs: 25000 }
      );
      session = { ...session, ...(state.session || {}) };
      myAnswer = state.my_answer || null;
      if (String(session.status) === 'finished' || String(session.phase) === 'results') {
        A.clearAsyncResume(token, activeLessonId);
        await showResults();
        return true;
      }
      const cur = Number(session.current_index) || 0;
      if (cur > submittedIndex) {
        pendingNext = null;
        selectedAnswer = null;
        draftText = '';
        letterGridState = null;
        myAnswer = null;
        showError(playError, '');
        renderPlay();
        return true;
      }
      if (myAnswer) {
        const again = await A.callLive(
          'async_submit',
          {
            resume_token: resumeToken,
            question_index: cur,
            answer: {},
          },
          { timeoutMs: 30000 }
        );
        await applySubmitResult(again);
        return true;
      }
      if (code === 'abort') {
        return false;
      }
    } catch (_) {
      /* fall through to original error */
    }
    return false;
  }

  function updateGuestChrome() {
    guestBanner.hidden = !isGuest || !hub?.is_open;
    const authHref = '/q/auth/' + (token ? `?t=${encodeURIComponent(token)}` : '');
    if (isGuest) {
      topAuthLink.textContent = 'Войти';
      topAuthLink.href = authHref;
    } else {
      topAuthLink.textContent = 'Кабинет';
      topAuthLink.href = '/q/cabinet/';
    }
    guestBanner?.querySelectorAll('a[href^="/q/auth"]').forEach((a) => {
      a.setAttribute('href', authHref);
    });
    resultCta?.querySelectorAll('a[href^="/q/auth"]').forEach((a) => {
      a.setAttribute('href', authHref);
    });
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
    const groups = Courses.groupLessonsByCourse(lessons);
    lessonsList.innerHTML = groups
      .map((group) => {
        const items = group.lessons
          .map((lesson) => {
            const count = Number(lesson.question_count) || 0;
            const prog = progressByLesson[lesson.lesson_id];
            const done = Boolean(prog && prog.answered);
            const meta = done
              ? `Пройдено · ${prog.percent}% (${prog.correct}/${prog.answered})`
              : `${count} вопр.`;
            const btnLabel = done ? 'Ещё раз' : 'Начать';
            const btnClass = done ? 'academy-btn' : 'academy-btn academy-btn--primary';
            return `<li class="${done ? 'q-lesson-done' : ''}">
              <div class="q-lesson-row">
                <div class="q-lesson-row__copy">
                  <strong>${A.escapeHtml(Courses.lessonDisplayTitle(lesson, group.key))}</strong>
                  <span class="academy-muted">${A.escapeHtml(meta)}</span>
                </div>
                <button type="button" class="${btnClass}" data-start-lesson="${A.escapeHtml(
                  lesson.lesson_id
                )}">${btnLabel}</button>
              </div>
            </li>`;
          })
          .join('');
        return `<li class="q-course-block">
          <div class="q-course-block__head">
            <strong>${A.escapeHtml(group.label)}</strong>
            <span class="academy-muted">${A.escapeHtml(group.hint)}</span>
          </div>
          <ul class="academy-list q-course-lessons">${items}</ul>
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
    if (q.type === 'letter_grid' && window.AcademyZahetTask1?.renderLetterGrid) {
      const Z = window.AcademyZahetTask1;
      const key = `${session?.current_index}|${q.id || q.prompt || ''}`;
      if (!letterGridState || letterGridState.questionKey !== key) {
        letterGridState = {
          questionKey: key,
          selected: Array.isArray(selectedAnswer?.letters) ? selectedAnswer.letters.slice() : [],
          confirmed: Boolean(selectedAnswer?._confirmed),
        };
      }
      Z.renderLetterGrid(playBody, q, {
        locked,
        selected: letterGridState.selected,
        confirmed: letterGridState.confirmed,
      });
      playBody.onclick = (event) => {
        if (locked || myAnswer) return;
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
        if (event.target.closest('[data-letter-confirm]') && letterGridState.selected.length) {
          letterGridState.confirmed = true;
          selectedAnswer = { letters: letterGridState.selected.slice(), _confirmed: true };
          Z.renderLetterGrid(playBody, q, {
            locked: false,
            selected: letterGridState.selected,
            confirmed: true,
          });
          submitBtn.disabled = false;
          return;
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
      submitBtn.disabled = locked || !letterGridState.confirmed;
      return;
    }
    if (q.type === 'rule_choice' && window.AcademyZahetTask2?.renderRuleChoice) {
      const Z = window.AcademyZahetTask2;
      const selected = Array.isArray(selectedAnswer?.rule_ids)
        ? selectedAnswer.rule_ids.slice()
        : selectedAnswer?.rule_id
          ? [selectedAnswer.rule_id]
          : [];
      Z.renderRuleChoice(playBody, q, {
        locked,
        selected,
      });
      playBody.onclick = (event) => {
        if (locked || myAnswer) return;
        const btn = event.target.closest('[data-rule]');
        if (!btn) return;
        const id = btn.getAttribute('data-rule');
        const current = Array.isArray(selectedAnswer?.rule_ids) ? selectedAnswer.rule_ids : [];
        const set = new Set(current);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        selectedAnswer = { rule_ids: [...set] };
        Z.renderRuleChoice(playBody, q, { locked: false, selected: selectedAnswer.rule_ids });
        submitBtn.disabled = !selectedAnswer.rule_ids.length;
      };
      submitBtn.disabled = locked || !selected.length;
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
    nextBtn.hidden = !pendingNext || Boolean(autoNextToggle?.checked);
    if (myAnswer && myAnswer.is_correct === true) {
      showError(playFeedback, 'Верно');
    } else if (myAnswer && myAnswer.is_correct === false) {
      showError(playFeedback, 'Ошибка — смотрите правильный разбор в итоге');
    } else if (myAnswer) {
      showError(playFeedback, 'Ответ принят');
    } else {
      playFeedback.hidden = true;
    }
    scheduleAutoNextIfNeeded();
  }

  async function showResults() {
    showView('result');
    resultCta.hidden = !isGuest;
    const lesson = lessons.find((l) => l.lesson_id === activeLessonId);
    resultTitle.textContent = lesson
      ? Courses.lessonDisplayTitle(lesson)
      : session?.lesson_title || 'Урок завершён';
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
      rememberProgress(activeLessonId, summary);
      const answers = (data.answers || [])
        .slice()
        .sort((a, b) => (Number(a.question_index) || 0) - (Number(b.question_index) || 0));
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
        // Recover stuck mid-lesson (answered current question but UI has no «Дальше»)
        if (myAnswer) {
          try {
            const again = await A.callLive('async_submit', {
              resume_token: resumeToken,
              question_index: Number(session.current_index) || 0,
              answer: {},
            });
            myAnswer = again.answer || myAnswer;
            if (again.finished) {
              session = { ...session, status: 'finished', phase: 'results' };
              A.clearAsyncResume(token, activeLessonId);
              await showResults();
              return;
            }
            if (again.next_question != null || again.next_index != null) {
              pendingNext = {
                next_index: again.next_index,
                next_question: again.next_question,
              };
            }
          } catch (_) {
            /* keep current screen */
          }
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
    lessons = Courses.sortLessons(data.lessons || []);
    progressByLesson = loadLocalProgress();
    await refreshServerProgress();
    if (token) A.rememberHubToken?.(token);
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
    hubStatus.textContent = 'Проходите уроки по порядку — в своём темпе.';
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
    clearAutoNextTimer();
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

  autoNextToggle?.addEventListener('change', () => {
    saveAutoNextPref(autoNextToggle.checked);
    if (autoNextToggle.checked) {
      scheduleAutoNextIfNeeded();
      if (pendingNext) nextBtn.hidden = true;
    } else {
      clearAutoNextTimer();
      nextBtn.hidden = !pendingNext;
    }
  });

  submitBtn?.addEventListener('click', async () => {
    showError(playError, '');
    let answer = selectedAnswer;
    if (!answer) {
      const input = document.getElementById('short-answer');
      if (input) answer = { text: input.value };
    }
    if (session?.current_question?.type === 'letter_grid') {
      if (!answer?._confirmed || !Array.isArray(answer.letters) || !answer.letters.length) {
        showError(playError, 'Отметьте буквы и нажмите «Готово».');
        return;
      }
      answer = { letters: answer.letters.slice() };
    } else if (session?.current_question?.type === 'rule_choice') {
      const ids = Array.isArray(answer?.rule_ids)
        ? answer.rule_ids
        : answer?.rule_id
          ? [answer.rule_id]
          : [];
      if (!ids.length) {
        showError(playError, 'Отметьте хотя бы одно правило.');
        return;
      }
      answer = { rule_ids: ids.map(String) };
    } else if (
      !answer ||
      (answer.option_id == null && answer.value == null && !String(answer.text || '').trim())
    ) {
      showError(playError, 'Выберите или введите ответ.');
      return;
    }
    const submittedIndex = Number(session.current_index) || 0;
    submitBtn.disabled = true;
    try {
      const data = await A.callLive(
        'async_submit',
        {
          resume_token: resumeToken,
          question_index: submittedIndex,
          answer,
        },
        { timeoutMs: 30000 }
      );
      await applySubmitResult(data);
    } catch (err) {
      const recovered = await recoverAfterSubmitFailure(submittedIndex, err);
      if (!recovered) {
        showError(playError, friendly(err, 'Не удалось отправить ответ.'));
        submitBtn.disabled = false;
      }
    }
  });

  nextBtn?.addEventListener('click', async () => {
    if (pendingNext) {
      goToPendingNext();
      return;
    }
    // Stuck after a dropped submit: answer on screen but no «Дальше» payload.
    if (myAnswer && resumeToken) {
      nextBtn.disabled = true;
      try {
        const again = await A.callLive(
          'async_submit',
          {
            resume_token: resumeToken,
            question_index: Number(session?.current_index) || 0,
            answer: {},
          },
          { timeoutMs: 30000 }
        );
        await applySubmitResult(again);
      } catch (err) {
        const recovered = await recoverAfterSubmitFailure(Number(session?.current_index) || 0, err);
        if (!recovered) showError(playError, friendly(err, 'Не удалось перейти дальше.'));
      } finally {
        nextBtn.disabled = false;
      }
    }
  });

  async function boot() {
    if (!token) {
      showView('gate');
      showError(gateError, 'Откройте ссылку от учителя (параметр t в адресе).');
      return;
    }
    displayName = loadSavedName();
    if (displayName) guestName.value = displayName;
    if (autoNextToggle) autoNextToggle.checked = loadAutoNextPref();
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
