(function initAdminAcademyFeedback(global) {
  const COURSE_LABELS = {
    tajweed: 'Таджвид',
    names99: '99 имён',
  };

  let allRows = [];
  let courseFilter = 'all';

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('ru-RU');
    } catch {
      return String(value);
    }
  }

  function renderStars(rating) {
    const safe = Math.max(1, Math.min(5, Number(rating) || 0));
    return '★'.repeat(safe) + '☆'.repeat(5 - safe);
  }

  function formatError(error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Ошибка загрузки');
    if (/academy_course_feedback/i.test(message) && /does not exist|relation/i.test(message)) {
      return 'Таблица academy_course_feedback не найдена. Выполните supabase-migration-academy-feedback.sql в Supabase SQL Editor.';
    }
    if (/display_name|updated_at|client_id/i.test(message) && /column/i.test(message)) {
      return 'Нужна миграция v2: выполните supabase-migration-academy-feedback-v2.sql в Supabase SQL Editor.';
    }
    if (/permission denied|row-level security|JWT/i.test(message)) {
      return 'Нет доступа к отзывам. Войдите в админку под пользователем Supabase Authentication.';
    }
    return message;
  }

  function filteredRows() {
    if (courseFilter === 'all') return allRows;
    return allRows.filter((row) => row.course_id === courseFilter);
  }

  function renderStats(container, rows) {
    if (!container) return;
    if (!rows.length) {
      container.textContent = 'Отзывов пока нет';
      return;
    }
    const sum = rows.reduce((acc, row) => acc + (Number(row.rating) || 0), 0);
    const avg = (sum / rows.length).toFixed(1);
    const withComment = rows.filter((row) => row.comment?.trim()).length;
    container.textContent = `${rows.length} отзыв(ов) · средняя ${avg} ★ · с комментарием: ${withComment}`;
  }

  function renderList(container, rows) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<p class="admin-muted admin-empty">Пока нет отзывов по выбранному фильтру.</p>';
      return;
    }

    container.innerHTML = '';
    for (const row of rows) {
      const card = document.createElement('article');
      card.className = 'admin-item admin-feedback-item';

      const main = document.createElement('div');
      main.className = 'admin-feedback-main';

      const title = document.createElement('h3');
      const courseLabel = COURSE_LABELS[row.course_id] ?? row.course_id;
      const namePrefix = row.display_name ? `${row.display_name} · ` : '';
      title.textContent = `${namePrefix}${renderStars(row.rating)} · ${courseLabel}${row.lesson_id ? ` · урок ${row.lesson_id}` : ''}`;
      main.appendChild(title);

      const meta = document.createElement('p');
      meta.className = 'admin-muted';
      const updatedLabel =
        row.updated_at && row.created_at && row.updated_at !== row.created_at ? ' · обновлено' : '';
      meta.textContent = `${formatDate(row.created_at)}${updatedLabel} · ${row.locale ?? '—'} · ${row.platform ?? '—'} · v${row.app_version ?? '—'}`;
      main.appendChild(meta);

      if (row.comment) {
        const body = document.createElement('p');
        body.className = 'admin-feedback-comment';
        body.textContent = row.comment;
        main.appendChild(body);
      }

      card.appendChild(main);
      container.appendChild(card);
    }
  }

  function renderAll() {
    const list = document.querySelector('#academy-feedback-list');
    const stats = document.querySelector('#academy-feedback-stats');
    const rows = filteredRows();
    renderStats(stats, rows);
    renderList(list, rows);
  }

  async function loadAndRender() {
    const container = document.querySelector('#academy-feedback-list');
    const stats = document.querySelector('#academy-feedback-stats');
    if (!container || !global.AdminSupabase?.loadAcademyCourseFeedback) return;

    container.innerHTML = '<p class="admin-muted">Загрузка…</p>';
    if (stats) stats.textContent = 'Загрузка…';

    try {
      allRows = await global.AdminSupabase.loadAcademyCourseFeedback();
      renderAll();
    } catch (error) {
      allRows = [];
      if (stats) stats.textContent = 'Не удалось загрузить';
      container.innerHTML = `<p class="admin-error">${formatError(error)}</p>`;
    }
  }

  function bind({ $ }) {
    const filter = $('#academy-feedback-filter');
    if (filter) {
      filter.addEventListener('change', () => {
        courseFilter = filter.value || 'all';
        renderAll();
      });
    }

    const refresh = $('#academy-feedback-refresh');
    if (refresh) {
      refresh.addEventListener('click', () => {
        void loadAndRender();
      });
    }
  }

  global.AdminAcademyFeedback = {
    bind,
    loadAndRender,
  };
})(window);
