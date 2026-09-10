/**
 * Shared helpers for Academy live (web).
 */
(function (global) {
  const RESUME_PREFIX = 'academy_join:';

  const ERROR_MAP = {
    academyLiveUrl: 'Сервис уроков не настроен. Обновите страницу позже.',
    config: 'Сервис временно недоступен.',
    auth: 'Войдите заново.',
    forbidden: 'Нет доступа.',
    not_teacher: 'Этот аккаунт не может вести уроки. Обратитесь к администратору.',
    title: 'Укажите название урока.',
    no_questions: 'Добавьте хотя бы один вопрос.',
    lesson_create_failed: 'Не удалось сохранить урок. Попробуйте ещё раз.',
    lesson_not_found: 'Урок не найден.',
    lesson_id: 'Не выбран урок.',
    session_id: 'Сессия не найдена.',
    session_not_found: 'Урок с таким кодом не найден.',
    late_join_disabled: 'К этому уроку уже нельзя присоединиться.',
    join_failed: 'Не удалось войти в урок. Попробуйте ещё раз.',
    submit_failed: 'Не удалось отправить ответ. Попробуйте ещё раз.',
    code: 'Введите код из 4–8 цифр.',
    name: 'Введите имя (хотя бы 2 буквы).',
    resume: 'Не удалось восстановить вход. Войдите снова.',
    invalid_token: 'Сессия устарела — войдите заново.',
    session_mismatch: 'Код не совпадает с этой сессией. Войдите снова.',
    params: 'Не хватает данных. Обновите страницу.',
    version_conflict: 'Урок обновился. Нажмите «Обновить».',
    bad_state: 'Сейчас это действие недоступно.',
    unknown_command: 'Неизвестная команда.',
    not_accepting: 'Сейчас нельзя ответить — учитель закрыл приём ответов.',
    wrong_question: 'Вопрос уже сменился. Обновите экран.',
    no_question: 'Вопрос не найден.',
    code_collision: 'Не удалось выдать код. Попробуйте ещё раз.',
    not_found: 'Не найдено.',
    method: 'Неверный запрос.',
    invalid_json: 'Неверный запрос.',
    unknown_action: 'Неизвестное действие.',
    question_invalid: 'Проверьте вопросы: текст, варианты и правильный ответ.',
    abort: 'Нет связи. Проверьте интернет и попробуйте снова.',
    token: 'Ссылка неполная или устарела.',
    hub_not_found: 'Набор уроков не найден.',
    hub_closed: 'Набор закрыт учителем. Новые прохождения недоступны.',
    hub_id: 'Набор не выбран.',
    hub_load_failed: 'Не удалось загрузить набор.',
    hub_save_failed: 'Не удалось сохранить набор.',
    lesson_not_in_hub: 'Этого урока нет в наборе.',
    not_async: 'Это не домашнее задание.',
    not_student: 'Войдите как ученик.',
    student_create_failed: 'Не удалось создать профиль ученика.',
    history_failed: 'Не удалось загрузить историю.',
  };

  function getConfig() {
    return global.SUPABASE_CONFIG || null;
  }

  function canCreateClient() {
    const config = getConfig();
    return Boolean(config?.url && config?.anonKey && global.supabase?.createClient);
  }

  function getClient() {
    if (!canCreateClient()) return null;
    if (!getClient.instance) {
      const config = getConfig();
      getClient.instance = global.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'academy-teacher-auth',
        },
      });
    }
    return getClient.instance;
  }

  /** Separate Auth storage so teacher and student cabinets never share a session. */
  function getStudentClient() {
    if (!canCreateClient()) return null;
    if (!getStudentClient.instance) {
      const config = getConfig();
      getStudentClient.instance = global.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'academy-student-auth',
        },
      });
    }
    return getStudentClient.instance;
  }

  function resolveHubToken() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('t') || params.get('token');
    if (fromQuery && String(fromQuery).trim().length >= 8) return String(fromQuery).trim();
    return '';
  }

  const ASYNC_RESUME_PREFIX = 'academy_async:';

  function saveAsyncResume(token, lessonId, payload) {
    try {
      localStorage.setItem(
        ASYNC_RESUME_PREFIX + String(token) + ':' + String(lessonId),
        JSON.stringify({ ...payload, saved_at: Date.now() })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function loadAsyncResume(token, lessonId) {
    try {
      const raw = localStorage.getItem(ASYNC_RESUME_PREFIX + String(token) + ':' + String(lessonId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function clearAsyncResume(token, lessonId) {
    try {
      localStorage.removeItem(ASYNC_RESUME_PREFIX + String(token) + ':' + String(lessonId));
    } catch (_) {
      /* ignore */
    }
  }

  function academyLiveUrl() {
    const config = getConfig();
    if (config?.academyLiveUrl) return config.academyLiveUrl;
    if (config?.url) return `${String(config.url).replace(/\/$/, '')}/functions/v1/academy-live`;
    return '';
  }

  function looksTechnical(message) {
    const s = String(message || '');
    if (!s) return true;
    if (/row-level security|infinite recursion|PGRST|JWT|postgres|permission denied|violates/i.test(s)) {
      return true;
    }
    if (/^[a-z][a-z0-9_]*$/i.test(s) && s.includes('_')) return true;
    if (/^HTTP\s+\d+/i.test(s)) return true;
    return false;
  }

  function humanizeError(raw, fallback) {
    if (raw == null || raw === '') return fallback || 'Не получилось. Попробуйте ещё раз.';
    if (typeof raw === 'object') {
      const code = raw.code || raw.error || raw.message;
      return humanizeError(code, fallback);
    }
    const text = String(raw).trim();
    if (ERROR_MAP[text]) return ERROR_MAP[text];

    const lower = text.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'Неверный email или пароль.';
    if (lower.includes('email not confirmed')) return 'Подтвердите email и попробуйте снова.';
    if (lower.includes('user already registered')) return 'Этот email уже зарегистрирован. Войдите.';
    if (lower.includes('password should be')) return 'Пароль слишком короткий.';
    if (lower.includes('network') || lower.includes('failed to fetch')) {
      return 'Нет связи. Проверьте интернет.';
    }
    if (lower.includes('abort')) return ERROR_MAP.abort;
    if (looksTechnical(text)) return fallback || 'Не получилось. Попробуйте ещё раз.';
    return text;
  }

  async function callLive(action, body, opts) {
    const url = academyLiveUrl();
    if (!url) throw new Error(ERROR_MAP.academyLiveUrl);
    const headers = {
      'Content-Type': 'application/json',
      apikey: getConfig()?.anonKey || '',
    };
    if (opts?.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
    else if (getConfig()?.anonKey) headers.Authorization = `Bearer ${getConfig().anonKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs || 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...(body || {}) }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.error || data.code || `HTTP ${res.status}`;
        const err = new Error(humanizeError(code));
        err.status = res.status;
        err.code = typeof data.error === 'string' ? data.error : code;
        err.payload = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err?.name === 'AbortError') {
        const e = new Error(ERROR_MAP.abort);
        e.code = 'abort';
        throw e;
      }
      if (err?.payload || err?.code) throw err;
      const e = new Error(humanizeError(err?.message, 'Не получилось. Попробуйте ещё раз.'));
      e.cause = err;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function saveResume(code, payload) {
    try {
      localStorage.setItem(
        RESUME_PREFIX + String(code),
        JSON.stringify({ ...payload, saved_at: Date.now() })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function loadResume(code) {
    try {
      const raw = localStorage.getItem(RESUME_PREFIX + String(code));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function clearResume(code) {
    try {
      localStorage.removeItem(RESUME_PREFIX + String(code));
    } catch (_) {
      /* ignore */
    }
  }

  function resolveJoinCode() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('c') || params.get('code');
    if (fromQuery && /^\d{4,8}$/.test(fromQuery.trim())) return fromQuery.trim();
    const parts = location.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== 'join' && /^\d{4,8}$/.test(last)) return last;
    return '';
  }

  function resolveSessionId() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('id') || params.get('session');
    if (fromQuery) return fromQuery.trim();
    const parts = location.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('session');
    if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    return '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const SUBJECT_LABELS = {
    fiqh: 'Фикх',
    aqida: 'Акыда',
    sira: 'Сира',
    quran: 'Коран',
    hadith: 'Хадисы',
    arabic: 'Арабский',
    other: 'Другое',
  };

  const STATUS_LABELS = {
    lobby: 'Лобби',
    live: 'Идёт урок',
    paused: 'Пауза',
    finished: 'Завершён',
  };

  const PHASE_LABELS = {
    lobby: 'ожидание',
    answering: 'ответы',
    reveal: 'разбор',
    results: 'итог',
  };

  function labelSubject(value) {
    return SUBJECT_LABELS[value] || value || '—';
  }

  function labelStatus(value) {
    return STATUS_LABELS[value] || value || '—';
  }

  function labelPhase(value) {
    return PHASE_LABELS[value] || value || '—';
  }

  function correctnessPill(isCorrect) {
    if (isCorrect === true) return '<span class="academy-pill academy-pill--ok">верно</span>';
    if (isCorrect === false) return '<span class="academy-pill academy-pill--bad">ошибка</span>';
    return '<span class="academy-pill">без оценки</span>';
  }

  function renderAnswerReviewItem(answer, opts) {
    const options = opts || {};
    const idx = Number(answer?.question_index) || 0;
    const prompt = String(answer?.prompt || `Вопрос ${idx + 1}`);
    const given = String(answer?.answer_label || '—');
    const correct = String(answer?.correct_label || '—');
    const wrong = answer?.is_correct === false;
    const showCorrect = options.showCorrectAlways || wrong || answer?.is_correct == null;
    return `<li class="academy-answer-review">
      <div class="academy-answer-review__head">
        ${correctnessPill(answer?.is_correct)}
        <strong>${escapeHtml(`${idx + 1}. ${prompt}`)}</strong>
      </div>
      <div class="academy-muted">Ответ ученика: ${escapeHtml(given)}</div>
      ${
        showCorrect
          ? `<div class="academy-muted">Правильно: ${escapeHtml(correct)}</div>`
          : ''
      }
    </li>`;
  }

  global.AcademyLive = {
    getConfig,
    canCreateClient,
    getClient,
    getStudentClient,
    academyLiveUrl,
    callLive,
    humanizeError,
    saveResume,
    loadResume,
    clearResume,
    resolveJoinCode,
    resolveSessionId,
    resolveHubToken,
    saveAsyncResume,
    loadAsyncResume,
    clearAsyncResume,
    escapeHtml,
    labelSubject,
    labelStatus,
    labelPhase,
    correctnessPill,
    renderAnswerReviewItem,
    RESUME_PREFIX,
    ASYNC_RESUME_PREFIX,
  };
})(window);
