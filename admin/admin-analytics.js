(function initAdminAnalytics(global) {
  const EVENT_LABELS = {
    app_open: 'Открытия приложения',
    academy_hub_open: 'Академия · хаб',
    academy_lesson_completed: 'Академия · урок завершён',
    azkar_item_completed: 'Азкар · завершён',
    tasbih_milestone: 'Тасбих · веха',
  };

  let allRows = [];
  let installations = [];
  let rangeDays = 7;
  let installationsAvailable = false;

  function formatError(error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Ошибка загрузки');
    if (/analytics_events/i.test(message) && /does not exist|relation/i.test(message)) {
      return 'Раздел аналитики ещё не подключён на сервере. Обратитесь к разработчику.';
    }
    if (/permission denied|row-level security|JWT/i.test(message)) {
      return 'Нет доступа. Войдите снова под своим аккаунтом.';
    }
    return message;
  }

  function rangeLabel(days) {
    if (!days) return 'всё время';
    if (days === 1) return '1 день';
    if (days === 365) return '1 год';
    return `${days} дн.`;
  }

  function dayKey(iso) {
    try {
      return new Date(iso).toISOString().slice(0, 10);
    } catch {
      return '—';
    }
  }

  function filteredRows() {
    if (!rangeDays) return allRows.slice();
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return allRows.filter((row) => {
      const t = Date.parse(row.created_at);
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  function countActiveInstalls(withinDays) {
    if (!withinDays) {
      if (installationsAvailable) return installations.length;
      return new Set(allRows.map((r) => r.installation_id).filter(Boolean)).size;
    }
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    if (installationsAvailable && installations.length) {
      return installations.filter((row) => {
        const t = Date.parse(row.last_seen_at);
        return Number.isFinite(t) && t >= cutoff;
      }).length;
    }
    const ids = new Set();
    for (const row of allRows) {
      const t = Date.parse(row.created_at);
      if (!Number.isFinite(t) || t < cutoff) continue;
      if (row.installation_id) ids.add(row.installation_id);
    }
    return ids.size;
  }

  function countBy(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
      const key = keyFn(row);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderMetricCards(container, rows) {
    if (!container) return;
    const activeSelected = countActiveInstalls(rangeDays);
    const active1 = countActiveInstalls(1);
    const active7 = countActiveInstalls(7);
    const active30 = countActiveInstalls(30);
    const active365 = countActiveInstalls(365);
    const totalKnown = countActiveInstalls(0);
    const byEvent = Object.fromEntries(countBy(rows, (r) => r.event));
    const sourceNote = installationsAvailable
      ? 'Активные — устройства, которые открывали приложение за период. Отключённая аналитика и офлайн не учитываются.'
      : 'Активные считаются по событиям. Полный учёт установок появится после обновления сервера.';

    container.innerHTML = `
      <div class="admin-analytics-grid">
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">Активные · ${rangeLabel(rangeDays)}</p>
          <p class="admin-analytics-value">${activeSelected}</p>
        </article>
        <article class="admin-analytics-card"><p class="admin-muted">Активные · 24ч</p><p class="admin-analytics-value">${active1}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Активные · 7 дн.</p><p class="admin-analytics-value">${active7}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Активные · 30 дн.</p><p class="admin-analytics-value">${active30}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Активные · 1 год</p><p class="admin-analytics-value">${active365}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Всего за всё время</p><p class="admin-analytics-value">${totalKnown}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Событий · период</p><p class="admin-analytics-value">${rows.length}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Азкары</p><p class="admin-analytics-value">${byEvent.azkar_item_completed || 0}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Уроки</p><p class="admin-analytics-value">${byEvent.academy_lesson_completed || 0}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Тасбих</p><p class="admin-analytics-value">${byEvent.tasbih_milestone || 0}</p></article>
      </div>
      <p class="admin-muted admin-analytics-note">${sourceNote}</p>
    `;
  }

  function renderBreakdown(container, title, pairs, labelFn) {
    const block = document.createElement('div');
    block.className = 'admin-analytics-block';
    const h = document.createElement('h3');
    h.textContent = title;
    block.appendChild(h);
    if (!pairs.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-muted';
      empty.textContent = 'Пока нет данных';
      block.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'admin-analytics-list';
      for (const [key, count] of pairs.slice(0, 12)) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${labelFn(key)}</span><strong>${count}</strong>`;
        list.appendChild(li);
      }
      block.appendChild(list);
    }
    container.appendChild(block);
  }

  function courseLabel(courseId) {
    if (courseId === 'names99') return '99 имён';
    if (courseId === 'tajweed') return 'Таджвид';
    if (courseId === 'madina') return 'Медина';
    return courseId || '—';
  }

  function rowsForDayOffset(dayOffset) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + dayOffset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const from = start.getTime();
    const to = end.getTime();
    return allRows.filter((row) => {
      const t = Date.parse(row.created_at);
      return Number.isFinite(t) && t >= from && t < to;
    });
  }

  function buildSocialCourseStats(rows) {
    const lessonRows = rows.filter((r) => r.event === 'academy_lesson_completed');
    const byCourse = new Map();
    for (const row of lessonRows) {
      const courseId = (row.props && row.props.course_id) || 'unknown';
      let entry = byCourse.get(courseId);
      if (!entry) {
        entry = { completions: 0, learners: new Set(), lessons: new Map() };
        byCourse.set(courseId, entry);
      }
      entry.completions += 1;
      if (row.installation_id) entry.learners.add(row.installation_id);
      const lessonId = (row.props && row.props.lesson_id) || '?';
      const lessonKey = `${courseId}/${lessonId}`;
      const lesson = entry.lessons.get(lessonKey) || { learners: new Set(), completions: 0 };
      lesson.completions += 1;
      if (row.installation_id) lesson.learners.add(row.installation_id);
      entry.lessons.set(lessonKey, lesson);
    }
    return byCourse;
  }

  function renderSocialLearning(container) {
    if (!container) return;
    const todayRows = rowsForDayOffset(0);
    const byCourse = buildSocialCourseStats(todayRows);
    const totalLearners = new Set();
    let totalCompletions = 0;
    for (const entry of byCourse.values()) {
      totalCompletions += entry.completions;
      for (const id of entry.learners) totalLearners.add(id);
    }

    const cards = document.createElement('div');
    cards.className = 'admin-analytics-social-card';
    cards.innerHTML = `
      <div class="admin-analytics-social-head">
        <h3>Сегодня в Академии</h3>
        <p class="admin-muted">Как в Sajda: сколько людей уже прошли уроки сегодня (уникальные устройства).</p>
      </div>
      <div class="admin-analytics-grid">
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">Учились сегодня</p>
          <p class="admin-analytics-value">${totalLearners.size}</p>
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">Уроков завершено</p>
          <p class="admin-analytics-value">${totalCompletions}</p>
        </article>
      </div>
    `;

    const list = document.createElement('div');
    list.className = 'admin-analytics-social-list';
    if (!byCourse.size) {
      const empty = document.createElement('p');
      empty.className = 'admin-muted';
      empty.textContent = 'Пока нет завершённых уроков за сегодня. Данные появятся, когда пользователи с включённой аналитикой пройдут уроки.';
      list.appendChild(empty);
    } else {
      const sorted = [...byCourse.entries()].sort((a, b) => b[1].learners.size - a[1].learners.size);
      for (const [courseId, entry] of sorted) {
        const line = document.createElement('article');
        line.className = 'admin-analytics-social-row';
        const topLesson = [...entry.lessons.entries()].sort(
          (a, b) => b[1].learners.size - a[1].learners.size
        )[0];
        const topLessonId = topLesson ? topLesson[0].split('/')[1] : '—';
        const topLearners = topLesson ? topLesson[1].learners.size : 0;
        line.innerHTML = `
          <div>
            <strong>${courseLabel(courseId)}</strong>
            <p class="admin-muted">Сегодня ${entry.learners.size} чел. завершили уроки · ${entry.completions} завершений</p>
            <p class="admin-analytics-social-quote">«Сегодня уже ${topLearners} ${pluralPeople(topLearners)} прошли урок ${topLessonId}»</p>
          </div>
        `;
        list.appendChild(line);
      }
    }

    container.replaceChildren(cards, list);
  }

  function pluralPeople(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'человек';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'человека';
    return 'человек';
  }

  function renderPlatformBreakdown(container) {
    const source = installationsAvailable ? installations : allRows;
    const pairs = countBy(source, (r) => r.platform || '—');
    renderBreakdown(container, 'Платформы', pairs, (key) => String(key));
  }

  function renderAll() {
    const metrics = document.querySelector('#analytics-metrics');
    const social = document.querySelector('#analytics-social');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    const rows = filteredRows();

    if (stats) {
      const active = countActiveInstalls(rangeDays);
      stats.textContent = `Активных · ${rangeLabel(rangeDays)}: ${active} · событий: ${rows.length}`;
    }
    renderMetricCards(metrics, rows);
    renderSocialLearning(social);

    if (!breakdown) return;
    breakdown.innerHTML = '';
    renderPlatformBreakdown(breakdown);
    renderBreakdown(
      breakdown,
      'По типу события',
      countBy(rows, (r) => r.event),
      (key) => EVENT_LABELS[key] || key
    );
    renderBreakdown(
      breakdown,
      'Азкары · категории',
      countBy(
        rows.filter((r) => r.event === 'azkar_item_completed'),
        (r) => (r.props && r.props.category) || '—'
      ),
      (key) => String(key)
    );
    renderBreakdown(
      breakdown,
      'Академия · курсы',
      countBy(
        rows.filter((r) => r.event === 'academy_lesson_completed'),
        (r) => (r.props && r.props.course_id) || '—'
      ),
      (key) => String(key)
    );
    renderBreakdown(
      breakdown,
      'Академия · уроки (топ)',
      countBy(
        rows.filter((r) => r.event === 'academy_lesson_completed'),
        (r) => {
          const course = (r.props && r.props.course_id) || '?';
          const lesson = (r.props && r.props.lesson_id) || '?';
          return `${course} / ${lesson}`;
        }
      ),
      (key) => String(key)
    );
  }

  async function loadAndRender() {
    const metrics = document.querySelector('#analytics-metrics');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    if (!metrics || !global.AdminSupabase?.loadAnalyticsEvents) return;

    metrics.innerHTML = '<p class="admin-muted">Загрузка…</p>';
    const social = document.querySelector('#analytics-social');
    if (social) social.innerHTML = '';
    if (breakdown) breakdown.innerHTML = '';
    if (stats) stats.textContent = 'Загрузка…';

    try {
      allRows = await global.AdminSupabase.loadAnalyticsEvents();
      installations = [];
      installationsAvailable = false;
      if (typeof global.AdminSupabase.loadAnalyticsInstallations === 'function') {
        try {
          installations = await global.AdminSupabase.loadAnalyticsInstallations();
          installationsAvailable = true;
        } catch (installError) {
          const msg = installError instanceof Error ? installError.message : String(installError);
          if (!/does not exist|relation|analytics_installations/i.test(msg)) {
            throw installError;
          }
        }
      }
      renderAll();
    } catch (error) {
      allRows = [];
      installations = [];
      installationsAvailable = false;
      if (stats) stats.textContent = 'Не удалось загрузить';
      metrics.innerHTML = `<p class="admin-error">${formatError(error)}</p>`;
    }
  }

  function bind({ $ }) {
    const range = $('#analytics-range');
    if (range) {
      range.addEventListener('change', () => {
        rangeDays = Number(range.value) || 0;
        renderAll();
      });
    }
    const refresh = $('#analytics-refresh');
    if (refresh) {
      refresh.addEventListener('click', () => {
        void loadAndRender();
      });
    }
  }

  global.AdminAnalytics = {
    bind,
    loadAndRender,
  };
})(window);
