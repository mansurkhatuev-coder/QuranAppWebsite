(function () {
  const A = window.AcademyLive;
  const statusEl = document.getElementById('session-status');
  const pinEl = document.getElementById('session-pin');
  const metaEl = document.getElementById('session-meta');
  const errorEl = document.getElementById('session-error');

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
  }

  async function load() {
    showError('');
    const sessionId = A.resolveSessionId();
    if (!sessionId) {
      statusEl.textContent = 'Не указан id сессии. Откройте ссылку вида /academy/session/?id=…';
      return;
    }
    if (!A.canCreateClient()) {
      showError('Supabase не настроен');
      return;
    }

    const client = A.getClient();
    const { data: auth } = await client.auth.getSession();
    if (!auth?.session) {
      statusEl.textContent = 'Нужен вход учителя.';
      location.href = '../';
      return;
    }

    statusEl.textContent = 'Синхронизация…';
    const { data, error } = await client
      .from('academy_sessions')
      .select('id, code, status, phase, current_index, version, last_activity_at, lesson_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      showError(
        error.message.includes('does not exist')
          ? 'Выполните supabase-migration-academy-live.sql в Supabase'
          : error.message
      );
      statusEl.textContent = 'Не удалось загрузить сессию';
      return;
    }
    if (!data) {
      statusEl.textContent = 'Сессия не найдена или нет доступа.';
      return;
    }

    statusEl.textContent = 'Состояние из базы (F5 безопасно — тот же id в URL).';
    pinEl.hidden = false;
    pinEl.textContent = data.code;
    metaEl.hidden = false;
    metaEl.textContent = `${data.status} / ${data.phase} · вопрос #${data.current_index + 1} · v${data.version}`;
  }

  document.getElementById('btn-reload').addEventListener('click', load);
  load();
})();
