(function () {
  const A = window.AcademyLive;

  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const appError = document.getElementById('app-error');
  const appStatus = document.getElementById('app-status');
  const teacherHello = document.getElementById('teacher-hello');
  const lessonsList = document.getElementById('lessons-list');
  const lessonsEmpty = document.getElementById('lessons-empty');
  const sessionsCard = document.getElementById('active-sessions-card');
  const sessionsList = document.getElementById('sessions-list');
  const editorCard = document.getElementById('editor-card');
  const questionsEditor = document.getElementById('questions-editor');
  const editorError = document.getElementById('editor-error');
  const lessonForm = document.getElementById('lesson-form');
  const startCard = document.getElementById('start-card');
  const startForm = document.getElementById('start-form');
  const startError = document.getElementById('start-error');
  const startLessonTitle = document.getElementById('start-lesson-title');

  let accessToken = '';
  let questionDrafts = [];
  let pendingStartLesson = null;

  function showError(el, message) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function friendly(err, fallback) {
    return A.humanizeError(err?.message || err, fallback || 'Не получилось. Попробуйте ещё раз.');
  }

  function setLoggedIn(on) {
    loginView.hidden = on;
    appView.hidden = !on;
  }

  function levelLabel(level) {
    if (level === 'beginner') return 'начальный';
    if (level === 'intermediate') return 'средний';
    if (level === 'advanced') return 'продвинутый';
    return level || '';
  }

  async function requireTeacher(client, user) {
    let ensureErr;
    try {
      const ensured = await A.callLive(
        'ensure_teacher',
        { display_name: user.email || user.user_metadata?.full_name || 'Учитель' },
        { accessToken }
      );
      if (ensured?.teacher) return ensured.teacher;
      if (ensured?.error) ensureErr = new Error(ensured.error);
    } catch (err) {
      ensureErr = err;
    }

    const { data, error } = await client
      .from('academy_teachers')
      .select('user_id, display_name, is_active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.is_active) return data;
    throw new Error(
      friendly(ensureErr || error, 'Не удалось войти как учитель. Проверьте аккаунт или попробуйте позже.')
    );
  }

  async function loadLessons(client) {
    const { data, error } = await client
      .from('academy_lessons')
      .select('id, title, subject, level, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(friendly(error, 'Не удалось загрузить уроки.'));
    return data || [];
  }

  async function loadActiveSessions(client) {
    const { data, error } = await client
      .from('academy_sessions')
      .select('id, code, status, phase, lesson_id, last_activity_at')
      .in('status', ['lobby', 'live', 'paused'])
      .order('last_activity_at', { ascending: false });
    if (error) throw new Error(friendly(error, 'Не удалось загрузить сессии.'));
    return data || [];
  }

  function renderLessons(lessons) {
    if (!lessons.length) {
      lessonsEmpty.hidden = false;
      lessonsList.hidden = true;
      lessonsList.innerHTML = '';
      return;
    }
    lessonsEmpty.hidden = true;
    lessonsList.hidden = false;
    lessonsList.innerHTML = lessons
      .map(
        (l) => `<li>
          <div>
            <strong>${A.escapeHtml(l.title)}</strong>
            <div class="academy-muted">${A.escapeHtml(A.labelSubject(l.subject))}${
          l.level ? ' · ' + A.escapeHtml(levelLabel(l.level)) : ''
        }</div>
          </div>
          <button type="button" class="academy-btn academy-btn--primary" data-start="${A.escapeHtml(l.id)}" data-title="${A.escapeHtml(
          l.title
        )}">Запустить</button>
        </li>`
      )
      .join('');
  }

  function renderSessions(sessions) {
    if (!sessions.length) {
      sessionsCard.hidden = true;
      sessionsList.innerHTML = '';
      return;
    }
    sessionsCard.hidden = false;
    sessionsList.innerHTML = sessions
      .map(
        (s) => `<li>
          <div>
            <div class="academy-pin academy-pin--compact">${A.escapeHtml(s.code)}</div>
            <div class="academy-muted">${A.escapeHtml(A.labelStatus(s.status))} · ${A.escapeHtml(
          A.labelPhase(s.phase)
        )}</div>
          </div>
          <a class="academy-btn academy-btn--primary" href="./session/?id=${encodeURIComponent(s.id)}">Продолжить</a>
        </li>`
      )
      .join('');
  }

  function defaultQuestion() {
    return {
      type: 'single_choice',
      prompt: '',
      options: [
        { id: 'a', label: '' },
        { id: 'b', label: '' },
      ],
      correct: 'a',
      accepted: '',
      tf: true,
    };
  }

  function nextOptionId(options) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < letters.length; i += 1) {
      const id = letters[i];
      if (!(options || []).some((o) => o.id === id)) return id;
    }
    return `o${(options || []).length + 1}`;
  }

  function renderQuestionEditor() {
    questionsEditor.innerHTML = questionDrafts
      .map((q, idx) => {
        const optionsHtml = (q.options || [])
          .map(
            (o, oi) => `<div class="academy-option-row">
              <label>Вариант ${oi + 1}
                <input data-q="${idx}" data-opt="${oi}" class="opt-label" value="${A.escapeHtml(o.label)}" />
              </label>
              <button type="button" class="academy-btn academy-btn--ghost" data-del-opt="${idx}:${oi}" ${
                (q.options || []).length <= 2 ? 'disabled' : ''
              }>−</button>
            </div>`
          )
          .join('');
        const singleChoiceBlock =
          q.type === 'single_choice'
            ? `${optionsHtml}
          <div class="academy-actions">
            <button type="button" class="academy-btn" data-add-opt="${idx}">+ Вариант</button>
          </div>
          <label class="academy-field-gap">Правильный ответ
            <select data-q="${idx}" class="q-correct">
              ${(q.options || [])
                .map(
                  (o) =>
                    `<option value="${A.escapeHtml(o.id)}" ${q.correct === o.id ? 'selected' : ''}>${A.escapeHtml(
                      o.label || 'Вариант ' + o.id
                    )}</option>`
                )
                .join('')}
            </select>
          </label>
          <p class="academy-muted academy-field-gap">Можно добавить до 8 вариантов.</p>`
            : '';
        return `<div class="academy-card academy-editor-block">
          <strong>Вопрос ${idx + 1}</strong>
          <label class="academy-field-gap">Тип
            <select data-q="${idx}" class="q-type">
              <option value="single_choice" ${q.type === 'single_choice' ? 'selected' : ''}>Один из вариантов</option>
              <option value="true_false" ${q.type === 'true_false' ? 'selected' : ''}>Верно / неверно</option>
              <option value="short_text" ${q.type === 'short_text' ? 'selected' : ''}>Короткий ввод</option>
            </select>
          </label>
          <label class="academy-field-gap">Текст вопроса
            <input data-q="${idx}" class="q-prompt" value="${A.escapeHtml(q.prompt)}" required />
          </label>
          ${singleChoiceBlock}
          ${
            q.type === 'true_false'
              ? `<label class="academy-field-gap">Правильный ответ
            <select data-q="${idx}" class="q-tf">
              <option value="true" ${q.tf ? 'selected' : ''}>Верно</option>
              <option value="false" ${!q.tf ? 'selected' : ''}>Неверно</option>
            </select></label>`
              : ''
          }
          ${
            q.type === 'short_text'
              ? `<label class="academy-field-gap">Правильные ответы (через | )
            <input data-q="${idx}" class="q-accepted" value="${A.escapeHtml(q.accepted)}" placeholder="4|четыре" />
          </label>`
              : ''
          }
          <div class="academy-actions">
            <button type="button" class="academy-btn academy-btn--ghost" data-del="${idx}">Удалить вопрос</button>
          </div>
        </div>`;
      })
      .join('');
  }

  function syncDraftsFromDom() {
    questionDrafts.forEach((q, idx) => {
      const typeEl = questionsEditor.querySelector(`.q-type[data-q="${idx}"]`);
      const promptEl = questionsEditor.querySelector(`.q-prompt[data-q="${idx}"]`);
      if (typeEl) q.type = typeEl.value;
      if (promptEl) q.prompt = promptEl.value;
      if (q.type === 'single_choice') {
        questionsEditor.querySelectorAll(`.opt-label[data-q="${idx}"]`).forEach((el) => {
          const oi = Number(el.getAttribute('data-opt'));
          if (q.options[oi]) q.options[oi].label = el.value;
        });
        const correctEl = questionsEditor.querySelector(`.q-correct[data-q="${idx}"]`);
        if (correctEl) q.correct = correctEl.value;
      }
      if (q.type === 'true_false') {
        const tf = questionsEditor.querySelector(`.q-tf[data-q="${idx}"]`);
        if (tf) q.tf = tf.value === 'true';
      }
      if (q.type === 'short_text') {
        const acc = questionsEditor.querySelector(`.q-accepted[data-q="${idx}"]`);
        if (acc) q.accepted = acc.value;
      }
    });
  }

  function openEditor() {
    questionDrafts = [defaultQuestion(), defaultQuestion(), defaultQuestion()];
    editorCard.hidden = false;
    document.getElementById('lesson-title').value = '';
    renderQuestionEditor();
    showError(editorError, '');
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveLesson() {
    syncDraftsFromDom();
    const title = document.getElementById('lesson-title').value.trim();
    const subject = document.getElementById('lesson-subject').value;
    if (!title) throw new Error('Укажите название урока');
    if (questionDrafts.length < 1) throw new Error('Добавьте хотя бы один вопрос');

    const rows = questionDrafts.map((q, position) => {
      if (!q.prompt.trim()) throw new Error(`Заполните текст вопроса ${position + 1}`);
      if (q.type === 'single_choice') {
        const options = (q.options || []).map((o) => ({ id: o.id, label: String(o.label || '').trim() }));
        if (options.length < 2) throw new Error(`В вопросе ${position + 1} нужно минимум 2 варианта`);
        if (options.some((o) => !o.label)) throw new Error(`Заполните все варианты в вопросе ${position + 1}`);
        if (!options.some((o) => o.id === q.correct)) {
          throw new Error(`Выберите правильный ответ в вопросе ${position + 1}`);
        }
        return {
          type: 'single_choice',
          prompt: q.prompt.trim(),
          payload: { options, correct_option_id: q.correct },
          scoring: { method: 'auto', points: 1 },
          position,
        };
      }
      if (q.type === 'true_false') {
        return {
          type: 'true_false',
          prompt: q.prompt.trim(),
          payload: { correct: Boolean(q.tf) },
          scoring: { method: 'auto', points: 1 },
          position,
        };
      }
      const accepted = String(q.accepted || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!accepted.length) throw new Error(`Укажите правильный ответ в вопросе ${position + 1}`);
      return {
        type: 'short_text',
        prompt: q.prompt.trim(),
        payload: { accepted, normalize: ['trim', 'lower', 'yo_to_e'] },
        scoring: { method: 'auto', points: 1 },
        position,
      };
    });

    const data = await A.callLive(
      'save_lesson',
      {
        title,
        subject,
        level: 'beginner',
        description: '',
        questions: rows,
      },
      { accessToken }
    );
    if (!data?.lesson?.id) throw new Error(friendly(data?.error, 'Не удалось сохранить урок'));
    return data.lesson.id;
  }

  async function startSession(lessonId, settings) {
    const data = await A.callLive(
      'create',
      {
        lesson_id: lessonId,
        settings: {
          mode: 'quiz',
          timer_seconds: Number(settings?.timer_seconds || 0),
          auto_advance: settings?.auto_advance !== false,
          auto_advance_on_all: settings?.auto_advance_on_all !== false,
          show_instant_feedback: false,
          leaderboard: false,
          allow_late_join: true,
          reveal_answers: 'never',
        },
      },
      { accessToken }
    );
    if (!data?.session?.id) throw new Error(friendly(data?.error, 'Не удалось запустить урок'));
    location.href = `./session/?id=${encodeURIComponent(data.session.id)}`;
  }

  function openStartSettings(lesson) {
    pendingStartLesson = lesson;
    startLessonTitle.textContent = lesson?.title || 'Урок';
    startCard.hidden = false;
    showError(startError, '');
    startCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function bootApp(client, session) {
    showError(appError, '');
    showError(appStatus, '');
    accessToken = session.access_token;
    const teacher = await requireTeacher(client, session.user);
    teacherHello.textContent = `Вы вошли как ${teacher.display_name || session.user.email || 'Учитель'}`;
    const [lessons, sessions] = await Promise.all([loadLessons(client), loadActiveSessions(client)]);
    renderLessons(lessons);
    renderSessions(sessions);
    setLoggedIn(true);
  }

  async function init() {
    if (!A.canCreateClient()) {
      showError(loginError, 'Сервис входа не настроен. Обновите страницу позже.');
      return;
    }
    const client = A.getClient();
    const { data: authData } = await client.auth.getSession();
    if (authData?.session) {
      try {
        await bootApp(client, authData.session);
      } catch (err) {
        setLoggedIn(false);
        showError(loginError, friendly(err, 'Не удалось войти.'));
      }
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError(loginError, '');
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submit = document.getElementById('login-submit');
      submit.disabled = true;
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await bootApp(client, data.session);
      } catch (err) {
        showError(loginError, friendly(err, 'Не удалось войти'));
        setLoggedIn(false);
      } finally {
        submit.disabled = false;
      }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
      await client.auth.signOut();
      setLoggedIn(false);
    });

    document.getElementById('btn-refresh').addEventListener('click', async () => {
      const { data } = await client.auth.getSession();
      if (!data?.session) return setLoggedIn(false);
      try {
        await bootApp(client, data.session);
        showError(appStatus, 'Список обновлён');
      } catch (err) {
        showError(appError, friendly(err));
      }
    });

    document.getElementById('btn-new-lesson').addEventListener('click', openEditor);
    document.getElementById('btn-cancel-editor').addEventListener('click', () => {
      editorCard.hidden = true;
      showError(editorError, '');
    });
    document.getElementById('btn-cancel-start').addEventListener('click', () => {
      startCard.hidden = true;
      pendingStartLesson = null;
      showError(startError, '');
    });
    document.getElementById('btn-add-question').addEventListener('click', () => {
      syncDraftsFromDom();
      questionDrafts.push(defaultQuestion());
      renderQuestionEditor();
    });

    questionsEditor.addEventListener('change', (event) => {
      const t = event.target;
      if (t.classList.contains('q-type')) {
        syncDraftsFromDom();
        const idx = Number(t.getAttribute('data-q'));
        const q = questionDrafts[idx];
        if (q && q.type === 'single_choice' && (!q.options || q.options.length < 2)) {
          q.options = [
            { id: 'a', label: '' },
            { id: 'b', label: '' },
          ];
          q.correct = 'a';
        }
        renderQuestionEditor();
      }
    });
    questionsEditor.addEventListener('click', (event) => {
      const addOpt = event.target.closest('[data-add-opt]');
      if (addOpt) {
        syncDraftsFromDom();
        const idx = Number(addOpt.getAttribute('data-add-opt'));
        const q = questionDrafts[idx];
        if (!q) return;
        if (!Array.isArray(q.options)) q.options = [];
        if (q.options.length >= 8) return;
        const id = nextOptionId(q.options);
        q.options.push({ id, label: '' });
        renderQuestionEditor();
        return;
      }

      const delOpt = event.target.closest('[data-del-opt]');
      if (delOpt) {
        syncDraftsFromDom();
        const [qi, oi] = String(delOpt.getAttribute('data-del-opt') || '')
          .split(':')
          .map(Number);
        const q = questionDrafts[qi];
        if (!q || !Array.isArray(q.options) || q.options.length <= 2) return;
        const removed = q.options.splice(oi, 1)[0];
        if (removed && q.correct === removed.id) q.correct = q.options[0]?.id || 'a';
        renderQuestionEditor();
        return;
      }

      const btn = event.target.closest('[data-del]');
      if (!btn) return;
      syncDraftsFromDom();
      const idx = Number(btn.getAttribute('data-del'));
      questionDrafts.splice(idx, 1);
      if (!questionDrafts.length) questionDrafts = [defaultQuestion()];
      renderQuestionEditor();
    });

    lessonForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      showError(editorError, '');
      const { data } = await client.auth.getSession();
      if (!data?.session) return setLoggedIn(false);
      accessToken = data.session.access_token;
      const submitBtn = lessonForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Сохранение…';
      }
      try {
        await saveLesson();
        editorCard.hidden = true;
        document.getElementById('lesson-title').value = '';
        await bootApp(client, data.session);
        showError(appStatus, 'Урок сохранён — можно запускать');
      } catch (err) {
        showError(editorError, friendly(err, 'Не удалось сохранить урок'));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Сохранить урок';
        }
      }
    });

    startForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!pendingStartLesson?.id) return;
      showError(startError, '');
      const { data } = await client.auth.getSession();
      if (!data?.session) return setLoggedIn(false);
      accessToken = data.session.access_token;
      const submitBtn = startForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await startSession(pendingStartLesson.id, {
          timer_seconds: Number(document.getElementById('start-timer').value),
          auto_advance: document.getElementById('start-auto').checked,
          auto_advance_on_all: document.getElementById('start-auto-all').checked,
        });
      } catch (err) {
        showError(startError, friendly(err, 'Не удалось запустить урок'));
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    lessonsList.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-start]');
      if (!btn) return;
      showError(appError, '');
      openStartSettings({
        id: btn.getAttribute('data-start'),
        title: btn.getAttribute('data-title') || 'Урок',
      });
    });
  }

  init();
})();
