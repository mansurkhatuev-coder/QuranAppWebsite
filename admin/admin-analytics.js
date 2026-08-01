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

  function renderPlatformBreakdown(container) {
    const source = installationsAvailable ? installations : allRows;
    const pairs = countBy(source, (r) => r.platform || '—');
    renderBreakdown(container, 'Платформы', pairs, (key) => String(key));
  }

  function renderAll() {
    const metrics = document.querySelector('#analytics-metrics');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    const rows = filteredRows();

    if (stats) {
      const active = countActiveInstalls(rangeDays);
      stats.textContent = `Активных · ${rangeLabel(rangeDays)}: ${active} · событий: ${rows.length}`;
    }
    renderMetricCards(metrics, rows);

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
