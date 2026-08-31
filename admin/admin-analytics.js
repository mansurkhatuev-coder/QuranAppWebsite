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
  const RUSTORE_APP_URL = 'https://www.rustore.ru/catalog/app/com.sheyhmansur.quranapp';
  const RUSTORE_CONSOLE_URL = 'https://console.rustore.ru/apps/2063710429/statistics';

  let allRows = [];
  let installations = [];
  let rangeDays = 7;
  let installationsAvailable = false;
  let installationsTotal = null;
  let allTimeInstallCount = null;
  let eventsWindowLimited = false;
  let dashboard = null;
  let dashboardError = '';
  let storeSnapshot = null;
  let storeError = '';
  let storeOk = '';
  let storeBusy = false;
  let storeBusyKind = '';
  let storeBusyHint = '';
  let rustoreFileInput = null;

  function formatError(error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Ошибка загрузки');
    if (/analytics_dashboard/i.test(message) && /function|schema|does not exist/i.test(message)) {
      return 'Нужна SQL-миграция analytics-dashboard на сервере. Пока показаны приблизительные цифры.';
    }
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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDelta(curr, prev) {
    if (prev == null || !Number.isFinite(Number(prev))) return '';
    const d = (Number(curr) || 0) - (Number(prev) || 0);
    if (!d) return '';
    const cls = d > 0 ? 'is-up' : 'is-down';
    const text = d > 0 ? `+${d}` : String(d);
    return `<span class="admin-store-delta ${cls}" title="к прошлому периоду">${text}</span>`;
  }

  function metricCard(label, value, opts = {}) {
    const hero = opts.hero ? ' admin-analytics-card--hero' : '';
    const delta = opts.prev != null ? formatDelta(value, opts.prev) : '';
    const sub = opts.sub ? `<span class="admin-analytics-sub">${escapeHtml(opts.sub)}</span>` : '';
    return `
      <article class="admin-analytics-card${hero}">
        <p class="admin-muted">${escapeHtml(label)}</p>
        <p class="admin-analytics-value admin-store-value">
          <span>${Number(value) || 0}</span>
          ${sub}
          ${delta}
        </p>
      </article>`;
  }

  function countEventUsers(rows, event) {
    const ids = new Set();
    for (const row of rows) {
      if (row.event !== event || !row.installation_id) continue;
      ids.add(row.installation_id);
    }
    return ids.size;
  }

  function storePeriodDownloads() {
    if (!storeSnapshot) return null;
    const deltaDays = storeDeltaDays();
    const rustore = storeSnapshot.rustore?.rows || [];
    const apple = storeSnapshot.apple?.rows || [];
    return sumStoreRows(rustore, deltaDays) + sumStoreRows(apple, deltaDays);
  }

  function renderSparkline(series, key) {
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) return '';
    const values = rows.map((row) => Number(row[key]) || 0);
    const max = Math.max(...values, 1);
    const bars = rows
      .map((row) => {
        const v = Number(row[key]) || 0;
        const h = Math.max(4, Math.round((v / max) * 100));
        return `<span style="height:${h}%" title="${escapeHtml(row.day)}: ${v}"></span>`;
      })
      .join('');
    return `<div class="admin-analytics-spark" aria-hidden="true">${bars}</div>`;
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
      if (typeof allTimeInstallCount === 'number' && allTimeInstallCount >= 0) {
        return allTimeInstallCount;
      }
      if (hasInstallationRegistry()) {
        if (typeof installationsTotal === 'number' && installationsTotal >= installations.length) {
          return installationsTotal;
        }
        return installations.length;
      }
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
    const period = dashboard?.period || null;
    const previous = dashboard?.previous || null;
    const series = dashboard?.series || [];
    const platforms = dashboard?.platforms || [];
    const reliable = Boolean(period);
    const byEvent = Object.fromEntries(countBy(rows, (r) => r.event));

    const active = reliable ? period.active : countActiveInstalls(rangeDays);
    const allTime = reliable
      ? Number(dashboard.all_time_installs) || 0
      : countActiveInstalls(0);
    const events = reliable ? period.events : rows.length;
    const azkar = reliable ? period.azkar : byEvent.azkar_item_completed || 0;
    const lessons = reliable ? period.lessons : byEvent.academy_lesson_completed || 0;
    const opens = reliable ? period.app_open : byEvent.app_open || 0;
    const tasbih = reliable ? period.tasbih : byEvent.tasbih_milestone || 0;
    const newInstalls = reliable ? period.new_installs : 0;
    const azkarUsers = reliable ? period.azkar_users : countEventUsers(rows, 'azkar_item_completed');
    const lessonUsers = reliable ? period.lesson_users : countEventUsers(rows, 'academy_lesson_completed');
    const label = rangeLabel(rangeDays);
    const storeNew = storePeriodDownloads();

    const activeSpark = renderSparkline(series, 'active_installs');
    const newSpark = renderSparkline(series, 'new_installs');
    const azkarSpark = renderSparkline(series, 'azkar');
    const trendBlock = activeSpark || newSpark || azkarSpark
      ? `
      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>За 30 дней</h3></div>
        ${newSpark ? `<p class="admin-analytics-spark-legend">Новые установки</p>${newSpark}` : ''}
        ${activeSpark ? `<p class="admin-analytics-spark-legend">Кто заходил</p>${activeSpark}` : ''}
        ${azkarSpark ? `<p class="admin-analytics-spark-legend">Азкары</p>${azkarSpark}` : ''}
      </section>`
      : '';

    const compareBlock =
      rangeDays > 0 && (newInstalls > 0 || (storeNew != null && storeNew > 0))
        ? `<p class="admin-analytics-compare">За период: в приложении <strong>${newInstalls}</strong> новых${
            storeNew != null ? ` · в сторах <strong>${storeNew}</strong>` : ''
          }</p>`
        : '';

    const platformList = platforms.length
      ? `<ul class="admin-analytics-list">${platforms
          .map((p) => {
            const name = String(p.platform || '—')
              .replace(/^android$/i, 'Android')
              .replace(/^ios$/i, 'iOS');
            return `<li><span>${escapeHtml(name)}</span><strong>${Number(p.count) || 0}</strong></li>`;
          })
          .join('')}</ul>`
      : '';

    container.innerHTML = `
      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>Установки · ${escapeHtml(label)}</h3></div>
        <div class="admin-analytics-grid">
          ${metricCard('Сейчас активны', active, { hero: true, prev: previous?.active })}
          ${metricCard('Новые', newInstalls, { hero: true, prev: previous?.new_installs })}
          ${metricCard('Всего', allTime)}
          ${metricCard('События', events, { prev: previous?.events })}
        </div>
        ${compareBlock}
      </section>

      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>В приложении · ${escapeHtml(label)}</h3></div>
        <div class="admin-analytics-grid">
          ${metricCard('Азкары', azkar, {
            hero: true,
            prev: previous?.azkar,
            sub: azkarUsers ? `${azkarUsers} чел.` : '',
          })}
          ${metricCard('Уроки', lessons, {
            hero: true,
            prev: previous?.lessons,
            sub: lessonUsers ? `${lessonUsers} чел.` : '',
          })}
          ${metricCard('Открытия', opens, { prev: previous?.app_open })}
          ${metricCard('Тасбих', tasbih, { prev: previous?.tasbih })}
        </div>
      </section>

      ${trendBlock}

      ${platformList ? `
      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>Телефоны</h3></div>
        ${platformList}
      </section>` : ''}
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
      <h3>Курсы</h3>
    `;
    block.appendChild(head);

    if (!funnel.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-muted';
      empty.textContent = 'Пока нет уроков за период.';
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
      row.innerHTML = `
        <div class="admin-analytics-funnel-title">
          <strong>${courseLabel(item.courseId)}</strong>
          <span class="admin-muted">начали ${item.started}</span>
        </div>
        <div class="admin-analytics-funnel-metrics">
          <div><span class="admin-muted">Прошли</span><strong>${item.finished}</strong><em>${finishPct}%</em></div>
          <div><span class="admin-muted">Бросили</span><strong>${item.abandoned}</strong><em>${abandonPct}%</em></div>
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

  function sumStoreRows(rows, withinDays) {
    const list = Array.isArray(rows) ? rows : [];
    if (!withinDays) {
      return list.reduce((sum, row) => sum + (Number(row.downloads) || 0), 0);
    }
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    return list.reduce((sum, row) => {
      const t = Date.parse(`${row.day}T00:00:00.000Z`);
      if (!Number.isFinite(t) || t < cutoff) return sum;
      return sum + (Number(row.downloads) || 0);
    }, 0);
  }

  function defaultAppleSteps() {
    return [
      { label: 'Ключ App Store Connect', done: false, detail: 'Сначала секреты в Supabase, потом эта кнопка.' },
      { label: 'Заказ отчётов Apple', done: false, detail: 'Ещё не заказывали.' },
      { label: 'Файлы скачиваний', done: false, detail: 'Apple отдаёт файлы через 24–48 часов после заказа. История может прийти позже.' },
      { label: 'Цифры в админке', done: false, detail: 'Появятся, когда файлы разберём.' },
    ];
  }

  function renderAppleProgress(apple) {
    const appleBusy = storeBusyKind === 'apple';
    const progress = apple && apple.progress;
    const percent = Number(progress && progress.percent) || 0;
    const status = String(apple?.status || '');
    const numbersDone = percent >= 100 || (apple && Number(apple.days) > 0);
    const button = appleBusy
      ? 'Обновляю…'
      : numbersDone
        ? 'Обновить App Store'
        : 'Проверить App Store';
    const statusLine = appleBusy
      ? `<p class="admin-store-status">${escapeHtml(storeBusyHint || 'Спрашиваю Apple…')}</p>`
      : status === 'waiting'
        ? '<p class="admin-store-status">Apple ещё готовит файлы. Цифры появятся позже — нажмите снова через сутки.</p>'
        : status === 'needs_secrets'
          ? '<p class="admin-store-status admin-error">Нужны секреты App Store Connect в Supabase.</p>'
          : status === 'error' && apple?.message
            ? `<p class="admin-store-status admin-error">${escapeHtml(apple.message)}</p>`
            : numbersDone
              ? `<p class="admin-store-status">В базе ${Number(apple.days) || 0} дн. · до ${escapeHtml(apple.lastDay || '—')}</p>`
              : '';
    return `
      <div class="admin-store-progress ${appleBusy ? 'is-busy' : ''}" aria-live="polite">
        <div class="admin-store-progress-head">
          <strong>App Store</strong>
          <span>${appleBusy ? 'запрос…' : numbersDone ? 'готово' : `${percent}%`}</span>
        </div>
        ${appleBusy || !numbersDone ? `
        <div class="admin-store-bar" aria-hidden="true">
          <span style="width:${appleBusy ? Math.max(percent, 18) : percent}%"></span>
        </div>` : ''}
        ${statusLine}
        <button type="button" id="analytics-apple-refresh" class="admin-button" ${storeBusy ? 'disabled' : ''}>
          ${escapeHtml(button)}
        </button>
      </div>
    `;
  }

  function looksLikeStoreTable(text) {
    return /дата|date|период|period|timeperiod|всего|total|установ|install|скач|download/i.test(String(text || ''));
  }

  function decodeStoreCsv(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes);
    }
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    if (looksLikeStoreTable(utf8)) return utf8;
    try {
      const cp = new TextDecoder('windows-1251').decode(bytes);
      if (looksLikeStoreTable(cp)) return cp;
    } catch {
      // not every browser ships this encoding
    }
    return utf8;
  }

  function renderRustoreUpload(rustore) {
    const rustoreBusy = storeBusyKind === 'rustore';
    const button = rustoreBusy ? 'Загружаю…' : 'Выбрать CSV RuStore';
    const statusLine = rustoreBusy
      ? `<p class="admin-store-status">${escapeHtml(storeBusyHint || 'Читаю CSV…')}</p>`
      : rustore && Number(rustore.days) > 0
        ? `<p class="admin-store-status">Загружено ${Number(rustore.days)} дн. · до ${escapeHtml(rustore.lastDay || '—')}</p>`
        : '<p class="admin-store-status">Экспорт из консоли RuStore → статистика → CSV</p>';
    return `
      <div class="admin-store-progress ${rustoreBusy ? 'is-busy' : ''}" aria-live="polite">
        <div class="admin-store-progress-head">
          <strong>RuStore</strong>
          <a class="admin-store-link" href="${RUSTORE_CONSOLE_URL}" target="_blank" rel="noopener noreferrer">Консоль</a>
        </div>
        ${statusLine}
        <button type="button" id="analytics-rustore-upload" class="admin-button" ${storeBusy ? 'disabled' : ''}>
          ${escapeHtml(button)}
        </button>
      </div>
    `;
  }

  /** Period for the +N badge: selected range, or last 1 day when «всё время». */
  function storeDeltaDays() {
    return rangeDays > 0 ? rangeDays : 1;
  }

  function formatStoreDelta(delta) {
    const n = Number(delta) || 0;
    if (n > 0) return `+${n}`;
    if (n < 0) return String(n);
    return '+0';
  }

  function renderStoreValue(total, delta) {
    const n = Number(delta) || 0;
    if (!n) {
      return `<p class="admin-analytics-value admin-store-value"><span>${total}</span></p>`;
    }
    const deltaClass = n > 0 ? 'is-up' : 'is-down';
    return `
      <p class="admin-analytics-value admin-store-value">
        <span>${total}</span>
        <span class="admin-store-delta ${deltaClass}" title="За ${rangeLabel(storeDeltaDays())}">${formatStoreDelta(n)}</span>
      </p>`;
  }

  function renderStoreDownloads(container) {
    if (!container) return;
    const rustore = storeSnapshot?.rustore || { rows: [], total: 0 };
    const apple = storeSnapshot?.apple || { rows: [], total: 0 };
    const deltaDays = storeDeltaDays();
    const rustoreAll = sumStoreRows(rustore.rows, 0);
    const appleAll = sumStoreRows(apple.rows, 0);
    const rustoreDelta = sumStoreRows(rustore.rows, deltaDays);
    const appleDelta = sumStoreRows(apple.rows, deltaDays);
    const storesAll = rustoreAll + appleAll;
    const storesDelta = rustoreDelta + appleDelta;
    const errorLine = storeError
      ? `<p class="admin-error">${escapeHtml(storeError)}</p>`
      : '';
    const okLine = !storeError && storeOk
      ? `<p class="admin-store-ok">${escapeHtml(storeOk)}</p>`
      : '';

    container.innerHTML = `
      <div class="admin-analytics-social-head">
        <h3>Скачивания в сторах</h3>
      </div>
      ${errorLine}
      ${okLine}
      <div class="admin-analytics-grid" id="analytics-stores-alltime">
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">RuStore</p>
          ${renderStoreValue(rustoreAll, rustoreDelta)}
        </article>
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">App Store</p>
          ${renderStoreValue(appleAll, appleDelta)}
        </article>
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">Вместе</p>
          ${renderStoreValue(storesAll, storesDelta)}
        </article>
      </div>
      ${renderRustoreUpload(rustore)}
      ${renderAppleProgress(apple)}
    `;
  }

  async function applyStoreSnapshot(next, okMessage = '') {
    storeSnapshot = next;
    storeError = '';
    if (okMessage) storeOk = okMessage;
    renderStoreDownloads(document.querySelector('#analytics-stores'));
  }

  function ensureRustoreFileInput(stores) {
    if (rustoreFileInput && document.body.contains(rustoreFileInput)) return rustoreFileInput;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'analytics-rustore-csv-persistent';
    input.accept = '.csv,.txt,.tsv,text/csv,text/plain';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;';
    // Keep outside #analytics-stores so re-renders do not destroy the picker (iOS Safari).
    stores.parentElement.appendChild(input);
    rustoreFileInput = input;
    return input;
  }

  async function runStoreAction(kind, work) {
    if (storeBusy) return;
    storeBusy = true;
    storeBusyKind = kind;
    storeError = '';
    storeOk = '';
    const stores = document.querySelector('#analytics-stores');
    renderStoreDownloads(stores);
    try {
      await work();
    } catch (error) {
      storeError = error instanceof Error ? error.message : String(error);
      renderStoreDownloads(stores);
    } finally {
      storeBusy = false;
      storeBusyKind = '';
      storeBusyHint = '';
      renderStoreDownloads(document.querySelector('#analytics-stores'));
    }
  }

  function renderAll() {
    const metrics = document.querySelector('#analytics-metrics');
    const social = document.querySelector('#analytics-social');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    const rows = filteredRows();
    const period = dashboard?.period;

    if (stats) {
      if (period) {
        stats.textContent = `${rangeLabel(rangeDays)} · активны ${period.active || 0} · азкары ${period.azkar || 0}`;
      } else {
        stats.textContent = rangeLabel(rangeDays);
      }
    }
    renderMetricCards(metrics, rows);
    renderStoreDownloads(document.querySelector('#analytics-stores'));

    // Hide noisy duplicate blocks (today academy / raw event dumps).
    if (social) social.innerHTML = '';

    if (!breakdown) return;
    breakdown.innerHTML = '';

    const azkarCats = countBy(
      rows.filter((r) => r.event === 'azkar_item_completed'),
      (r) => (r.props && r.props.category) || '—'
    );
    const courses = countBy(
      rows.filter((r) => r.event === 'academy_lesson_completed'),
      (r) => (r.props && r.props.course_id) || '—'
    );

    if (azkarCats.length || courses.length) {
      const head = document.createElement('div');
      head.className = 'admin-analytics-social-head';
      head.innerHTML = '<h3>Подробнее</h3>';
      breakdown.appendChild(head);
    }
    if (azkarCats.length) {
      renderBreakdown(breakdown, 'Азкары по темам', azkarCats, (key) => String(key));
    }
    if (courses.length) {
      renderBreakdown(breakdown, 'Уроки по курсам', courses, (key) => courseLabel(key));
    }
    renderCourseFunnel(breakdown);
  }

  async function loadDashboardForRange() {
    dashboard = null;
    dashboardError = '';
    if (typeof global.AdminSupabase.loadAnalyticsDashboard !== 'function') return;
    try {
      dashboard = await global.AdminSupabase.loadAnalyticsDashboard(rangeDays);
      if (dashboard?.all_time_installs != null) {
        allTimeInstallCount = Number(dashboard.all_time_installs) || 0;
      }
    } catch (error) {
      dashboard = null;
      // Keep silent — fallback metrics still render without tech error banners.
      console.warn('analytics dashboard', error);
    }
  }

  async function loadAndRender() {
    const metrics = document.querySelector('#analytics-metrics');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    if (!metrics || !global.AdminSupabase?.loadAnalyticsEvents) return;

    metrics.innerHTML = '<p class="admin-muted">Загрузка…</p>';
    const social = document.querySelector('#analytics-social');
    const stores = document.querySelector('#analytics-stores');
    if (social) social.innerHTML = '';
    if (stores) stores.innerHTML = '<p class="admin-muted">Сторы: загрузка…</p>';
    if (breakdown) breakdown.innerHTML = '';
    if (stats) stats.textContent = 'Загрузка…';
    storeError = '';
    storeOk = '';

    try {
      await loadDashboardForRange();

      const eventsPayload = await global.AdminSupabase.loadAnalyticsEvents();
      allRows = Array.isArray(eventsPayload) ? eventsPayload : (eventsPayload?.rows || []);
      eventsWindowLimited = Boolean(eventsPayload && !Array.isArray(eventsPayload) && eventsPayload.truncated);
      installations = [];
      installationsTotal = null;
      if (allTimeInstallCount == null) allTimeInstallCount = null;
      installationsAvailable = false;
      if (typeof global.AdminSupabase.loadAnalyticsInstallations === 'function') {
        try {
          const installPayload = await global.AdminSupabase.loadAnalyticsInstallations();
          if (Array.isArray(installPayload)) {
            installations = installPayload;
            installationsTotal = installPayload.length;
          } else {
            installations = installPayload?.rows || [];
            installationsTotal =
              typeof installPayload?.total === 'number' ? installPayload.total : installations.length;
          }
          installationsAvailable = true;
        } catch (installError) {
          const msg = installError instanceof Error ? installError.message : String(installError);
          if (!/does not exist|relation|analytics_installations/i.test(msg)) {
            throw installError;
          }
        }
      }
      renderAll();

      if (allTimeInstallCount == null && typeof global.AdminSupabase.loadAnalyticsAllTimeInstallCount === 'function') {
        try {
          allTimeInstallCount = await global.AdminSupabase.loadAnalyticsAllTimeInstallCount();
          renderAll();
        } catch (allTimeError) {
          console.warn('all-time install count failed', allTimeError);
        }
      }

      if (typeof global.AdminSupabase.loadStoreDownloads === 'function') {
        try {
          const snap = await global.AdminSupabase.loadStoreDownloads();
          await applyStoreSnapshot(snap);
        } catch (storeLoadError) {
          storeError = storeLoadError instanceof Error ? storeLoadError.message : String(storeLoadError);
          renderStoreDownloads(document.querySelector('#analytics-stores'));
        }
      }
    } catch (error) {
      allRows = [];
      installations = [];
      installationsTotal = null;
      allTimeInstallCount = null;
      installationsAvailable = false;
      eventsWindowLimited = false;
      dashboard = null;
      if (stats) stats.textContent = 'Не удалось загрузить';
      metrics.innerHTML = `<p class="admin-error">${formatError(error)}</p>`;
    }
  }

  function bind({ $ }) {
    const range = $('#analytics-range');
    if (range) {
      range.addEventListener('change', () => {
        rangeDays = Number(range.value) || 0;
        void loadDashboardForRange().then(() => renderAll());
      });
    }
    const refresh = $('#analytics-refresh');
    if (refresh) {
      refresh.addEventListener('click', () => {
        void loadAndRender();
      });
    }
    const stores = document.querySelector('#analytics-stores');
    if (stores && !stores.dataset.bound) {
      stores.dataset.bound = '1';
      const fileInput = ensureRustoreFileInput(stores);

      const uploadRustoreFile = (file) => {
        if (!file || typeof global.AdminSupabase.uploadRustoreCsv !== 'function') return;
        storeBusyHint = 'Читаю CSV и отправляю на сервер…';
        void runStoreAction('rustore', async () => {
          const buffer = await file.arrayBuffer();
          const csv = decodeStoreCsv(buffer);
          if (!String(csv || '').trim()) {
            throw new Error('Файл пустой или не читается. Экспортируйте CSV заново из консоли RuStore.');
          }
          const snap = await global.AdminSupabase.uploadRustoreCsv(csv);
          const days = Number(snap?.rustore?.days) || 0;
          const total = sumStoreRows(snap?.rustore?.rows || [], 0);
          await applyStoreSnapshot(
            snap,
            days
              ? `RuStore обновлён: ${total} скачиваний · ${days} дн.`
              : 'CSV принят, но строк с датами не нашлось.'
          );
        }).finally(() => {
          // Allow selecting the same file again on iOS.
          fileInput.value = '';
        });
      };

      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (file) uploadRustoreFile(file);
      });

      stores.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.closest('#analytics-rustore-upload')) {
          if (storeBusy) return;
          fileInput.value = '';
          fileInput.click();
          return;
        }

        if (!target.closest('#analytics-apple-refresh')) return;
        if (typeof global.AdminSupabase.refreshAppleDownloads !== 'function') return;
        storeBusyHint = 'Спрашиваю Apple… на iPhone может занять до минуты. Не уходите со страницы.';
        void runStoreAction('apple', async () => {
          const beforeDays = Number(storeSnapshot?.apple?.days) || 0;
          const beforeTotal = sumStoreRows(storeSnapshot?.apple?.rows || [], 0);
          const snap = await global.AdminSupabase.refreshAppleDownloads();
          const afterDays = Number(snap?.apple?.days) || 0;
          const afterTotal = sumStoreRows(snap?.apple?.rows || [], 0);
          const sync = snap?.appleSync || {};
          const status = String(snap?.apple?.status || sync.status || '');
          let ok = '';
          if (status === 'waiting') {
            ok = 'Запрос ушёл. Apple ещё готовит файлы — цифры обновятся позже.';
          } else if (afterTotal > beforeTotal || afterDays > beforeDays) {
            ok = `App Store обновлён: ${afterTotal} скачиваний · ${afterDays} дн.`;
          } else if (afterDays > 0) {
            ok = 'App Store проверен — цифры те же (новых файлов нет).';
          } else {
            ok = String(sync.message || snap?.apple?.message || 'App Store проверен.');
          }
          await applyStoreSnapshot(snap, ok);
        });
      });
    }
  }

  global.AdminAnalytics = {
    bind,
    loadAndRender,
  };
})(window);
