(function initAdminAcademyFeedback(global) {
  const COURSE_LABELS = {
    tajweed: 'Таджвид',
    names99: '99 имён',
  };

  let allRows = [];
  let rawCount = 0;
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
      return 'Раздел отзывов ещё не подключён на сервере. Обратитесь к разработчику.';
    }
    if (/display_name|updated_at|client_id/i.test(message) && /column/i.test(message)) {
      return 'Нужно обновить схему отзывов на сервере. Обратитесь к разработчику.';
    }
    if (/permission denied|row-level security|JWT/i.test(message)) {
      return 'Нет доступа. Войдите снова под своим аккаунтом.';
    }
    return message;
  }

  /**
   * App should upsert by (course_id, client_id). Older builds / empty client_id
   * insert a new row each time — collapse to the newest per device+course.
   */
  function dedupeFeedbackRows(rows) {
    const byClient = new Map();
    const noClient = [];
    for (const row of rows) {
      const clientId = typeof row.client_id === 'string' ? row.client_id.trim() : '';
      if (!clientId) {
        noClient.push(row);
        continue;
      }
      const key = `${row.course_id || ''}::${clientId}`;
      const prev = byClient.get(key);
      if (!prev) {
        byClient.set(key, row);
        continue;
      }
      const prevTs = Date.parse(prev.updated_at || prev.created_at || 0) || 0;
      const nextTs = Date.parse(row.updated_at || row.created_at || 0) || 0;
      if (nextTs >= prevTs) byClient.set(key, row);
    }

    // Rows without client_id: keep one per course + rating + comment + name.
    const byFingerprint = new Map();
    for (const row of noClient) {
      const fp = [
        row.course_id || '',
        String(row.rating || ''),
        String(row.comment || '').trim().toLowerCase(),
        String(row.display_name || '').trim().toLowerCase(),
      ].join('::');
      const prev = byFingerprint.get(fp);
      if (!prev) {
        byFingerprint.set(fp, row);
        continue;
      }
      const prevTs = Date.parse(prev.created_at || 0) || 0;
      const nextTs = Date.parse(row.created_at || 0) || 0;
      if (nextTs >= prevTs) byFingerprint.set(fp, row);
    }

    return [...byClient.values(), ...byFingerprint.values()].sort((a, b) => {
      const ta = Date.parse(a.created_at || 0) || 0;
      const tb = Date.parse(b.created_at || 0) || 0;
      return tb - ta;
    });
  }

  function filteredRows() {
    if (courseFilter === 'all') return allRows;
    return allRows.filter((row) => row.course_id === courseFilter);
  }

  function renderStats(container, rows, rawCount) {
    if (!container) return;
    if (!rows.length) {
      container.textContent = 'Отзывов пока нет';
      return;
    }
    const sum = rows.reduce((acc, row) => acc + (Number(row.rating) || 0), 0);
    const avg = (sum / rows.length).toFixed(1);
    const withComment = rows.filter((row) => row.comment?.trim()).length;
    const hidden = Math.max(0, (Number(rawCount) || rows.length) - rows.length);
    const dupNote = hidden > 0 ? ` · скрыто дублей: ${hidden}` : '';
    container.textContent = `${rows.length} отзыв(ов) · средняя ${avg} ★ · с комментарием: ${withComment}${dupNote}`;
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
    renderStats(stats, rows, courseFilter === 'all' ? rawCount : undefined);
    renderList(list, rows);
  }

  async function loadAndRender() {
    const container = document.querySelector('#academy-feedback-list');
    const stats = document.querySelector('#academy-feedback-stats');
    if (!container || !global.AdminSupabase?.loadAcademyCourseFeedback) return;

    container.innerHTML = '<p class="admin-muted">Загрузка…</p>';
    if (stats) stats.textContent = 'Загрузка…';

    try {
      const loaded = await global.AdminSupabase.loadAcademyCourseFeedback();
      rawCount = loaded.length;
      allRows = dedupeFeedbackRows(loaded);
      renderAll();
    } catch (error) {
      allRows = [];
      rawCount = 0;
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
