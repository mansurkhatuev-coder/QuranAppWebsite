(function initAdminAnalytics(global) {
  const EVENT_LABELS = {
    app_open: 'Открытия приложения',
    academy_hub_open: 'Академия · хаб',
    academy_lesson_completed: 'Академия · урок завершён',
    azkar_item_completed: 'Азкар · завершён',
    tasbih_milestone: 'Тасбих · веха',
  };

  /** Expected lesson totals for course completion detection. */
  const COURSE_LESSON_TOTALS = {
    names99: 10,
    madina: 23,
    tajweed: 44,
  };

  /** Days without a new lesson completion → count as abandoned. */
  const ABANDON_IDLE_DAYS = 14;

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

  function filteredRows() {
    if (!rangeDays) return allRows.slice();
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return allRows.filter((row) => {
      const t = Date.parse(row.created_at);
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  function hasInstallationRegistry() {
    return installationsAvailable && installations.length > 0;
  }

  function countUniqueInstallationsFromEvents(withinDays) {
    if (!withinDays) {
      return new Set(allRows.map((r) => r.installation_id).filter(Boolean)).size;
    }
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    const ids = new Set();
    for (const row of allRows) {
      const t = Date.parse(row.created_at);
      if (!Number.isFinite(t) || t < cutoff) continue;
      if (row.installation_id) ids.add(row.installation_id);
    }
    return ids.size;
  }

  function countActiveInstalls(withinDays) {
    // Prefer the installations registry when it has rows. If the table exists but
    // is empty (migration without backfill / app not upserting yet), fall back to
    // unique installation_id from events — otherwise "all time" incorrectly shows 0
    // while period cards still show event-based counts.
    if (!withinDays) {
      if (hasInstallationRegistry()) return installations.length;
      return countUniqueInstallationsFromEvents(0);
    }
    if (hasInstallationRegistry()) {
      const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
      return installations.filter((row) => {
        const t = Date.parse(row.last_seen_at);
        return Number.isFinite(t) && t >= cutoff;
      }).length;
    }
    return countUniqueInstallationsFromEvents(withinDays);
  }

  function dayKeyFromTimestamp(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatChartDayLabel(dayKey) {
    const parts = dayKey.split('-');
    if (parts.length !== 3) return dayKey;
    return `${parts[2]}.${parts[1]}`;
  }

  /** First time we saw each installation (registry first_seen_at or earliest event). */
  function getFirstSeenEntries() {
    if (hasInstallationRegistry()) {
      return installations
        .map((row) => ({
          id: row.installation_id,
          at: Date.parse(row.first_seen_at),
        }))
        .filter((entry) => entry.id && Number.isFinite(entry.at));
    }
    const map = new Map();
    for (const row of allRows) {
      if (!row.installation_id) continue;
      const at = Date.parse(row.created_at);
      if (!Number.isFinite(at)) continue;
      const prev = map.get(row.installation_id);
      if (!prev || at < prev) map.set(row.installation_id, at);
    }
    return [...map.entries()].map(([id, at]) => ({ id, at }));
  }

  function countNewInstalls(withinDays) {
    const entries = getFirstSeenEntries();
    if (!withinDays) return entries.length;
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    return entries.filter((entry) => entry.at >= cutoff).length;
  }

  function buildDailyNewInstalls(dayCount) {
    const buckets = new Map();
    for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offset);
      buckets.set(dayKeyFromTimestamp(d.getTime()), 0);
    }
    for (const entry of getFirstSeenEntries()) {
      const key = dayKeyFromTimestamp(entry.at);
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    }
    return [...buckets.entries()];
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

  function courseLabel(courseId) {
    if (courseId === 'names99') return '99 имён';
    if (courseId === 'tajweed') return 'Таджвид';
    if (courseId === 'madina') return 'Медина';
    return courseId || '—';
  }

  function renderMetricCards(container, rows) {
    if (!container) return;
    const activeSelected = countActiveInstalls(rangeDays);
    const active1 = countActiveInstalls(1);
    const active7 = countActiveInstalls(7);
    const active30 = countActiveInstalls(30);
    const active365 = countActiveInstalls(365);
    const totalKnown = countActiveInstalls(0);
    const newSelected = countNewInstalls(rangeDays);
    const new1 = countNewInstalls(1);
    const new7 = countNewInstalls(7);
    const new30 = countNewInstalls(30);
    const byEvent = Object.fromEntries(countBy(rows, (r) => r.event));
    const sourceNote = hasInstallationRegistry()
      ? 'Активные — кто присылал события за период (last_seen). Новые — первый визит (first_seen) за период. Не скачивания из магазинов. Платформа = ОС (android/ios).'
      : installationsAvailable
        ? 'Реестр установок пуст — активные и новые считаем по событиям (первое событие = новая установка).'
        : 'Активные и новые считаются по событиям. Полный учёт установок появится после обновления сервера.';

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
        <article class="admin-analytics-card">
          <p class="admin-muted">Новые · ${rangeLabel(rangeDays)}</p>
          <p class="admin-analytics-value">${newSelected}</p>
        </article>
        <article class="admin-analytics-card"><p class="admin-muted">Новые · 24ч</p><p class="admin-analytics-value">${new1}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Новые · 7 дн.</p><p class="admin-analytics-value">${new7}</p></article>
        <article class="admin-analytics-card"><p class="admin-muted">Новые · 30 дн.</p><p class="admin-analytics-value">${new30}</p></article>
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

  /**
   * Per-course funnel from lesson completions.
   * Started = ≥1 unique lesson. Finished = unique lessons ≥ course total.
   * Abandoned = started, not finished, idle > ABANDON_IDLE_DAYS.
   * Studying = started, not finished, recent activity.
   */
  function buildCourseFunnel(rows) {
    const lessonRows = rows.filter((r) => r.event === 'academy_lesson_completed' && r.installation_id);
    const byCourse = new Map();

    for (const row of lessonRows) {
      const courseId = (row.props && row.props.course_id) || 'unknown';
      const lessonId = String((row.props && row.props.lesson_id) || '?');
      const at = Date.parse(row.created_at);
      if (!Number.isFinite(at)) continue;

      let learners = byCourse.get(courseId);
      if (!learners) {
        learners = new Map();
        byCourse.set(courseId, learners);
      }
      let state = learners.get(row.installation_id);
      if (!state) {
        state = { lessons: new Set(), lastAt: at };
        learners.set(row.installation_id, state);
      }
      state.lessons.add(lessonId);
      if (at > state.lastAt) state.lastAt = at;
    }

    const idleMs = ABANDON_IDLE_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const out = [];

    for (const [courseId, learners] of byCourse.entries()) {
      const total = COURSE_LESSON_TOTALS[courseId] || 0;
      let finished = 0;
      let abandoned = 0;
      let studying = 0;

      for (const state of learners.values()) {
        const unique = state.lessons.size;
        const done = total > 0 ? unique >= total : false;
        if (done) {
          finished += 1;
          continue;
        }
        if (now - state.lastAt > idleMs) abandoned += 1;
        else studying += 1;
      }

      out.push({
        courseId,
        started: learners.size,
        finished,
        abandoned,
        studying,
        totalLessons: total,
      });
    }

    return out.sort((a, b) => b.started - a.started);
  }

  function renderNewInstallsChart(container) {
    if (!container) return;
    const chartDays = rangeDays && rangeDays <= 30 ? rangeDays : 30;
    const daily = buildDailyNewInstalls(chartDays);
    const max = Math.max(1, ...daily.map(([, count]) => count));
    const totalInChart = daily.reduce((sum, [, count]) => sum + count, 0);

    const block = document.createElement('div');
    block.className = 'admin-analytics-chart';
    block.innerHTML = `
      <div class="admin-analytics-social-head">
        <h3>Новые установки по дням</h3>
        <p class="admin-muted">
          Первый визит устройства (first_seen), не скачивание из RuStore/App Store.
          За ${chartDays} дн.: ${totalInChart}.
        </p>
      </div>
    `;

    if (!totalInChart) {
      const empty = document.createElement('p');
      empty.className = 'admin-muted';
      empty.textContent = 'За выбранный период новых установок пока нет (или аналитика отключена).';
      block.appendChild(empty);
      container.replaceChildren(block);
      return;
    }

    const bars = document.createElement('div');
    bars.className = 'admin-analytics-chart-bars';
    bars.setAttribute('role', 'img');
    bars.setAttribute(
      'aria-label',
      `График новых установок за ${chartDays} дней, всего ${totalInChart}`
    );

    for (const [dayKey, count] of daily) {
      const bar = document.createElement('div');
      bar.className = 'admin-analytics-chart-bar';
      const heightPct = Math.max(6, Math.round((count / max) * 100));
      bar.innerHTML = `
        <span class="admin-analytics-chart-bar-value">${count || ''}</span>
        <span class="admin-analytics-chart-bar-fill" style="height:${heightPct}%"></span>
        <span class="admin-analytics-chart-bar-label">${formatChartDayLabel(dayKey)}</span>
      `;
      bars.appendChild(bar);
    }

    block.appendChild(bars);
    container.replaceChildren(block);
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
        <p class="admin-muted">Устройства, завершившие хотя бы один урок за сегодня.</p>
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
      empty.textContent = 'За сегодня пока нет завершённых уроков.';
      list.appendChild(empty);
    } else {
      const sorted = [...byCourse.entries()].sort((a, b) => b[1].learners.size - a[1].learners.size);
      for (const [courseId, entry] of sorted) {
        const line = document.createElement('article');
        line.className = 'admin-analytics-social-row';
        line.innerHTML = `
          <div>
            <strong>${courseLabel(courseId)}</strong>
            <p class="admin-muted">${entry.learners.size} уч. · ${entry.completions} заверш. уроков</p>
          </div>
        `;
        list.appendChild(line);
      }
    }

    container.replaceChildren(cards, list);
  }

  function renderCourseFunnel(container) {
    if (!container) return;
    const rows = filteredRows();
    const funnel = buildCourseFunnel(rows);

    const block = document.createElement('div');
    block.className = 'admin-analytics-block admin-analytics-funnel';
    const head = document.createElement('div');
    head.className = 'admin-analytics-social-head';
    head.innerHTML = `
      <h3>Курсы · прошли и забросили</h3>
      <p class="admin-muted">
        По уникальным устройствам за выбранный период.
        Прошли — набрали все уроки курса.
        Забросили — начали, но не закончили и молчат больше ${ABANDON_IDLE_DAYS} дн.
        Учатся — продолжают.
      </p>
    `;
    block.appendChild(head);

    if (!funnel.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-muted';
      empty.textContent = 'Пока нет данных по урокам Академии за период.';
      block.appendChild(empty);
      container.appendChild(block);
      return;
    }

    const list = document.createElement('div');
    list.className = 'admin-analytics-funnel-list';
    for (const item of funnel) {
      const row = document.createElement('article');
      row.className = 'admin-analytics-funnel-row';
      const finishPct = item.started ? Math.round((item.finished / item.started) * 100) : 0;
      const abandonPct = item.started ? Math.round((item.abandoned / item.started) * 100) : 0;
      const studyingPct = Math.max(0, 100 - finishPct - abandonPct);
      const totalHint = item.totalLessons
        ? `полный курс = ${item.totalLessons} ур.`
        : 'порог завершения неизвестен';
      row.innerHTML = `
        <div class="admin-analytics-funnel-title">
          <strong>${courseLabel(item.courseId)}</strong>
          <span class="admin-muted">${totalHint} · начали: ${item.started}</span>
        </div>
        <div class="admin-analytics-funnel-metrics">
          <div><span class="admin-muted">Прошли</span><strong>${item.finished}</strong><em>${finishPct}%</em></div>
          <div><span class="admin-muted">Забросили</span><strong>${item.abandoned}</strong><em>${abandonPct}%</em></div>
          <div><span class="admin-muted">Учатся</span><strong>${item.studying}</strong></div>
        </div>
        <div class="admin-analytics-funnel-bar" aria-hidden="true">
          <span class="is-finished" style="width:${finishPct}%"></span>
          <span class="is-abandoned" style="width:${abandonPct}%"></span>
          <span class="is-studying" style="width:${studyingPct}%"></span>
        </div>
      `;
      list.appendChild(row);
    }
    block.appendChild(list);
    container.appendChild(block);
  }

  function countUniqueInstallsBy(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
      if (!row.installation_id) continue;
      const key = keyFn(row);
      if (!key) continue;
      let set = map.get(key);
      if (!set) {
        set = new Set();
        map.set(key, set);
      }
      set.add(row.installation_id);
    }
    return [...map.entries()]
      .map(([key, set]) => [key, set.size])
      .sort((a, b) => b[1] - a[1]);
  }

  function renderPlatformBreakdown(container) {
    if (hasInstallationRegistry()) {
      const pairs = countBy(installations, (r) => r.platform || '—');
      renderBreakdown(container, 'Платформы (ОС)', pairs, (key) => String(key));
      return;
    }
    const pairs = countUniqueInstallsBy(allRows, (r) => r.platform || '—');
    renderBreakdown(container, 'Платформы (ОС)', pairs, (key) => String(key));
  }

  function renderVersionBreakdown(container) {
    if (hasInstallationRegistry()) {
      const pairs = countBy(installations, (r) => r.app_version || '—');
      renderBreakdown(container, 'Версии приложения', pairs, (key) => (key === '—' ? '—' : `v${key}`));
      return;
    }
    const pairs = countUniqueInstallsBy(allRows, (r) => r.app_version || '—');
    renderBreakdown(container, 'Версии приложения', pairs, (key) => (key === '—' ? '—' : `v${key}`));
  }

  function renderAll() {
    const metrics = document.querySelector('#analytics-metrics');
    const installsChart = document.querySelector('#analytics-installs-chart');
    const social = document.querySelector('#analytics-social');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    const rows = filteredRows();

    if (stats) {
      const active = countActiveInstalls(rangeDays);
      const fresh = countNewInstalls(rangeDays);
      stats.textContent = `Активных · ${rangeLabel(rangeDays)}: ${active} · новых: ${fresh} · событий: ${rows.length}`;
    }
    renderMetricCards(metrics, rows);
    renderNewInstallsChart(installsChart);
    renderSocialLearning(social);

    if (!breakdown) return;
    breakdown.innerHTML = '';
    renderCourseFunnel(breakdown);
    renderPlatformBreakdown(breakdown);
    renderVersionBreakdown(breakdown);
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
      (key) => courseLabel(key)
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
    const installsChart = document.querySelector('#analytics-installs-chart');
    const social = document.querySelector('#analytics-social');
    if (installsChart) installsChart.innerHTML = '';
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
