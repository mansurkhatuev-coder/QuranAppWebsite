(function () {
  const A = window.AcademyLive;
  const Types = window.AcademyQuestionTypes;

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

  let accessToken = '';
  let questionDrafts = [];

  function showError(el, message) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  }

  function setLoggedIn(on) {
    loginView.hidden = on;
    appView.hidden = !on;
  }

  async function requireTeacher(client, user) {
    // First login: register admin Auth user as academy teacher (signup is closed).
    try {
      const ensured = await A.callLive(
        'ensure_teacher',
        { display_name: user.email || user.user_metadata?.full_name || 'Учитель' },
        { accessToken }
      );
      if (ensured?.teacher) return ensured.teacher;
    } catch (err) {
      console.warn('ensure_teacher', err);
    }

    const { data, error } = await client
      .from('academy_teachers')
      .select('user_id, display_name, is_active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.is_active) {
      throw new Error(
        'Не удалось зарегистрировать учителя. Проверьте, что Edge Function academy-live задеплоена.'
      );
    }
    return data;
  }

  async function loadLessons(client) {
    const { data, error } = await client
      .from('academy_lessons')
      .select('id, title, subject, level, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function loadActiveSessions(client) {
    const { data, error } = await client
      .from('academy_sessions')
      .select('id, code, status, phase, lesson_id, last_activity_at')
      .in('status', ['lobby', 'live', 'paused'])
      .order('last_activity_at', { ascending: false });
    if (error) throw error;
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
            <div class="academy-muted">${A.escapeHtml(l.subject)} · ${A.escapeHtml(l.level)}</div>
          </div>
          <button type="button" class="academy-btn academy-btn--primary" data-start="${A.escapeHtml(l.id)}">Запустить</button>
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
            <div class="academy-pin" style="font-size:1.4rem;letter-spacing:0.12em">${A.escapeHtml(s.code)}</div>
            <div class="academy-muted">${A.escapeHtml(s.status)} / ${A.escapeHtml(s.phase)}</div>
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
            (o, oi) => `<div style="display:grid;grid-template-columns:1fr auto;gap:0.4rem;align-items:end;margin-top:0.4rem">
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
          <div class="academy-actions" style="margin-top:0.6rem">
            <button type="button" class="academy-btn" data-add-opt="${idx}">+ Вариант</button>
          </div>
          <label style="margin-top:0.5rem">Правильный ответ
            <select data-q="${idx}" class="q-correct">
              ${(q.options || [])
                .map(
                  (o) =>
                    `<option value="${A.escapeHtml(o.id)}" ${q.correct === o.id ? 'selected' : ''}>${A.escapeHtml(
                      o.label || o.id
                    )}</option>`
                )
                .join('')}
            </select>
          </label>
          <p class="academy-muted" style="margin-top:0.4rem;font-size:0.85rem">Можно добавить до 8 вариантов.</p>`
            : '';
        return `<div class="academy-card" style="margin-top:0.75rem;padding:1rem">
          <strong>Вопрос ${idx + 1}</strong>
          <label style="margin-top:0.5rem;display:grid;gap:0.35rem">Тип
            <select data-q="${idx}" class="q-type">
              <option value="single_choice" ${q.type === 'single_choice' ? 'selected' : ''}>Один из вариантов</option>
              <option value="true_false" ${q.type === 'true_false' ? 'selected' : ''}>Верно / неверно (только 2)</option>
              <option value="short_text" ${q.type === 'short_text' ? 'selected' : ''}>Короткий ввод</option>
            </select>
          </label>
          <label style="margin-top:0.5rem;display:grid;gap:0.35rem">Текст
            <input data-q="${idx}" class="q-prompt" value="${A.escapeHtml(q.prompt)}" required />
          </label>
          ${singleChoiceBlock}
          ${
            q.type === 'true_false'
              ? `<label style="margin-top:0.5rem">Ответ
            <select data-q="${idx}" class="q-tf">
              <option value="true" ${q.tf ? 'selected' : ''}>Верно</option>
              <option value="false" ${!q.tf ? 'selected' : ''}>Неверно</option>
            </select></label>
            <p class="academy-muted" style="margin-top:0.4rem;font-size:0.85rem">Для 3+ вариантов выберите тип «Один из вариантов».</p>`
              : ''
          }
          ${
            q.type === 'short_text'
              ? `<label style="margin-top:0.5rem">Правильные ответы (через | )
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
    renderQuestionEditor();
    showError(editorError, '');
  }

  async function saveLesson(client, userId) {
    syncDraftsFromDom();
    const title = document.getElementById('lesson-title').value.trim();
    const subject = document.getElementById('lesson-subject').value;
    if (!title) throw new Error('Укажите название');
    if (questionDrafts.length < 1) throw new Error('Добавьте вопрос');

    const rows = questionDrafts.map((q, position) => {
      if (!q.prompt.trim()) throw new Error(`Пустой текст в вопросе ${position + 1}`);
      if (q.type === 'single_choice') {
        const options = (q.options || []).map((o) => ({ id: o.id, label: o.label.trim() }));
        if (options.some((o) => !o.label)) throw new Error(`Заполните варианты в вопросе ${position + 1}`);
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
      if (!accepted.length) throw new Error(`Нужен ответ в вопросе ${position + 1}`);
      return {
        type: 'short_text',
        prompt: q.prompt.trim(),
        payload: { accepted, normalize: ['trim', 'lower', 'yo_to_e'] },
        scoring: { method: 'auto', points: 1 },
        position,
      };
    });

    const { data: lesson, error } = await client
      .from('academy_lessons')
      .insert({
        owner_id: userId,
        title,
        subject,
        level: 'beginner',
        description: '',
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;

    const payload = rows.map((r) => ({ ...r, lesson_id: lesson.id }));
    const { error: qErr } = await client.from('academy_questions').insert(payload);
    if (qErr) throw qErr;
    return lesson.id;
  }

  async function startSession(lessonId) {
    const data = await A.callLive(
      'create',
      {
        lesson_id: lessonId,
        settings: {
          mode: 'learning',
          timer_seconds: 0,
          leaderboard: false,
          allow_late_join: true,
          reveal_answers: 'learning_only',
        },
      },
      { accessToken }
    );
    location.href = `./session/?id=${encodeURIComponent(data.session.id)}`;
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
    showError(appStatus, Types ? `Типы MVP: ${Types.listSupported().join(', ')}` : 'Ок');
    setLoggedIn(true);
  }

  async function init() {
    if (!A.canCreateClient()) {
      showError(loginError, 'Supabase не настроен');
      return;
    }
    const client = A.getClient();
    const { data: authData } = await client.auth.getSession();
    if (authData?.session) {
      try {
        await bootApp(client, authData.session);
      } catch (err) {
        setLoggedIn(false);
        showError(loginError, err.message || String(err));
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
        showError(loginError, err.message || 'Не удалось войти');
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
      } catch (err) {
        showError(appError, err.message || String(err));
      }
    });

    document.getElementById('btn-new-lesson').addEventListener('click', openEditor);
    document.getElementById('btn-cancel-editor').addEventListener('click', () => {
      editorCard.hidden = true;
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

    document.getElementById('lesson-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      showError(editorError, '');
      const { data } = await client.auth.getSession();
      if (!data?.session) return setLoggedIn(false);
      try {
        await saveLesson(client, data.session.user.id);
        editorCard.hidden = true;
        document.getElementById('lesson-title').value = '';
        await bootApp(client, data.session);
        showError(appStatus, 'Урок сохранён');
      } catch (err) {
        showError(editorError, err.message || String(err));
      }
    });

    lessonsList.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-start]');
      if (!btn) return;
      btn.disabled = true;
      showError(appError, '');
      try {
        await startSession(btn.getAttribute('data-start'));
      } catch (err) {
        showError(appError, err.message || String(err));
        btn.disabled = false;
      }
    });
  }

  init();
})();
