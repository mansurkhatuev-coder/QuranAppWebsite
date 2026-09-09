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
  const typesSupported = document.getElementById('types-supported');

  function showError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function setLoggedIn(on) {
    loginView.hidden = on;
    appView.hidden = !on;
  }

  async function requireTeacher(client, user) {
    const { data, error } = await client
      .from('academy_teachers')
      .select('user_id, display_name, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(
        error.message.includes('does not exist')
          ? 'Таблица academy_teachers не найдена. Выполните supabase-migration-academy-live.sql'
          : error.message
      );
    }
    if (!data || !data.is_active) {
      throw new Error(
        'Этот аккаунт не в списке учителей Академии. Добавьте строку в academy_teachers.'
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
            <strong>${escapeHtml(l.title)}</strong>
            <div class="academy-muted">${escapeHtml(l.subject)} · ${escapeHtml(l.level)}</div>
          </div>
          <span class="academy-badge">черновик</span>
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
            <div class="academy-pin" style="font-size:1.4rem;letter-spacing:0.12em">${escapeHtml(s.code)}</div>
            <div class="academy-muted">${escapeHtml(s.status)} / ${escapeHtml(s.phase)}</div>
          </div>
          <a class="academy-btn academy-btn--primary" href="./session/?id=${encodeURIComponent(s.id)}">Продолжить</a>
        </li>`
      )
      .join('');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function bootApp(client, session) {
    showError(appError, '');
    showError(appStatus, '');
    const teacher = await requireTeacher(client, session.user);
    const name = teacher.display_name || session.user.email || 'Учитель';
    teacherHello.textContent = `Вы вошли как ${name}`;
    if (typesSupported && Types) {
      typesSupported.textContent =
        'Типы вопросов в реестре (MVP): ' + Types.listSupported().join(', ');
    }
    const [lessons, sessions] = await Promise.all([
      loadLessons(client),
      loadActiveSessions(client),
    ]);
    renderLessons(lessons);
    renderSessions(sessions);
    showError(appStatus, 'Синхронизация ок');
    setLoggedIn(true);
  }

  async function init() {
    if (!A.canCreateClient()) {
      showError(loginError, 'Supabase не настроен. Проверьте admin/supabase-config.js');
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
      if (!data?.session) {
        setLoggedIn(false);
        return;
      }
      try {
        await bootApp(client, data.session);
      } catch (err) {
        showError(appError, err.message || String(err));
      }
    });
  }

  init();
})();
