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
  let storeSnapshot = null;
  let storeError = '';
  let storeBusy = false;
  let storeBusyKind = '';
  let storeBusyHint = '';

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
    const byEvent = Object.fromEntries(countBy(rows, (r) => r.event));
    const sourceNote = hasInstallationRegistry()
      ? 'Активные — уникальные установки (installation_id), которые присылали события. Платформа = ОС (android/ios), не магазин (RuStore / APK / App Store). Без аналитики или офлайн устройство не видно.'
      : installationsAvailable
        ? 'Реестр установок пуст — считаем по событиям. «Всё время» = уникальные installation_id из загруженных событий.'
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

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    const steps = progress && Array.isArray(progress.steps) && progress.steps.length
      ? progress.steps
      : defaultAppleSteps();
    const percent = Number(progress && progress.percent) || 0;
    const hint = appleBusy
      ? storeBusyHint || 'Спрашиваю Apple… обычно до минуты. Не закрывайте вкладку.'
      : (progress && progress.hint) || 'Нажмите кнопку — закажем отчёт у Apple. Готовые файлы приходят не сразу, обычно сутки–двое.';
    const button = appleBusy
      ? 'Спрашиваю Apple…'
      : (progress && progress.button) || 'Проверить App Store';
    const stepList = `<ol class="admin-store-steps">${steps.map((step) => `
          <li class="${step.done ? 'is-done' : ''}">
            <strong>${escapeHtml(step.label)}</strong>
            <span>${escapeHtml(step.detail)}</span>
          </li>`).join('')}</ol>`;
    return `
      <div class="admin-store-progress ${appleBusy ? 'is-busy' : ''}" aria-live="polite">
        <div class="admin-store-progress-head">
          <strong>App Store · прогресс</strong>
          <span>${appleBusy ? 'идёт запрос' : `${percent}%`}</span>
        </div>
        <div class="admin-store-bar" aria-hidden="true">
          <span style="width:${appleBusy ? Math.max(percent, 15) : percent}%"></span>
        </div>
        ${stepList}
        <p class="admin-muted admin-analytics-note">${escapeHtml(hint)}</p>
        <button type="button" id="analytics-apple-refresh" class="admin-button" ${storeBusy ? 'disabled' : ''}>
          ${escapeHtml(button)}
        </button>
      </div>
    `;
  }

  function looksLikeStoreTable(text) {
    return /дата|date|установ|install|скач|download/i.test(String(text || ''));
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
    const hint = rustoreBusy
      ? storeBusyHint || 'Читаю CSV и отправляю на сервер…'
      : rustore && rustore.fetchedAt
        ? `CSV загружен. Последний день в файле: ${rustore.lastDay || '—'}.`
        : 'В консоли откройте статистику приложения → таблица → экспорт CSV. Подойдёт и помесячный файл с колонками timePeriod и Всего.';
    const button = rustoreBusy ? 'Загружаю CSV…' : 'Загрузить CSV';
    return `
      <div class="admin-store-progress ${rustoreBusy ? 'is-busy' : ''}" aria-live="polite">
        <div class="admin-store-progress-head">
          <strong>RuStore · CSV</strong>
          <a class="admin-store-link" href="${RUSTORE_APP_URL}" target="_blank" rel="noopener noreferrer">Страница в RuStore</a>
        </div>
        <p class="admin-muted admin-analytics-note">${escapeHtml(hint)}</p>
        <p class="admin-store-links">
          <a class="admin-store-link" href="${RUSTORE_CONSOLE_URL}" target="_blank" rel="noopener noreferrer">Консоль RuStore · статистика</a>
        </p>
        <div class="admin-toolbar" style="margin-top:8px;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="admin-inline-field">
            Файл CSV
            <input type="file" id="analytics-rustore-csv" accept=".csv,.txt,.tsv,text/csv,text/plain" ${storeBusy ? 'disabled' : ''} />
          </label>
          <button type="button" id="analytics-rustore-upload" class="admin-button" ${storeBusy ? 'disabled' : ''}>
            ${escapeHtml(button)}
          </button>
        </div>
      </div>
    `;
  }

  function storeCoverageNote(store) {
    if (!store || !store.days) return '';
    const first = store.firstDay || '';
    const last = store.lastDay || '';
    if (first && last && first !== last) return `${store.days} дн. · ${first}…${last}`;
    if (last) return `${store.days} дн. · до ${last}`;
    return `${store.days} дн.`;
  }

  function renderStoreDownloads(container) {
    if (!container) return;
    const rustore = storeSnapshot?.rustore || { rows: [], total: 0 };
    const apple = storeSnapshot?.apple || { rows: [], total: 0 };
    const rustorePeriod = sumStoreRows(rustore.rows, rangeDays);
    const applePeriod = sumStoreRows(apple.rows, rangeDays);
    const rustoreAll = sumStoreRows(rustore.rows, 0);
    const appleAll = sumStoreRows(apple.rows, 0);
    const periodNote = rangeDays ? `за ${rangeLabel(rangeDays)}` : 'за всё время';
    const errorLine = storeError
      ? `<p class="admin-error">${escapeHtml(storeError)}</p>`
      : '';
    const appleCoverage = storeCoverageNote(apple);
    const rustoreCoverage = storeCoverageNote(rustore);

    container.innerHTML = `
      <div class="admin-analytics-social-head">
        <h3>Сторы · скачивания</h3>
        <p class="admin-muted">Цифры магазинов, не наши «устройства». Считаем first-time downloads (без обновлений и повторных скачиваний). «Всё время» = сумма дней, которые уже подтянуты из отчётов, а не lifetime из App Store Connect целиком.</p>
      </div>
      ${errorLine}
      <div class="admin-analytics-grid">
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">RuStore · ${periodNote}</p>
          <p class="admin-analytics-value">${rustorePeriod}</p>
        </article>
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">App Store · ${periodNote}</p>
          <p class="admin-analytics-value">${applePeriod}</p>
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">Сторы вместе · ${periodNote}</p>
          <p class="admin-analytics-value">${rustorePeriod + applePeriod}</p>
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">RuStore · всё время</p>
          <p class="admin-analytics-value">${rustoreAll}</p>
          ${rustoreCoverage ? `<p class="admin-muted admin-analytics-note">${escapeHtml(rustoreCoverage)}</p>` : ''}
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">App Store · всё время</p>
          <p class="admin-analytics-value">${appleAll}</p>
          ${appleCoverage ? `<p class="admin-muted admin-analytics-note">${escapeHtml(appleCoverage)}</p>` : ''}
        </article>
      </div>
      ${renderRustoreUpload(rustore)}
      ${renderAppleProgress(apple)}
    `;
  }

  async function applyStoreSnapshot(next) {
    storeSnapshot = next;
    storeError = '';
    renderStoreDownloads(document.querySelector('#analytics-stores'));
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
    renderStoreDownloads(document.querySelector('#analytics-stores'));
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
    const social = document.querySelector('#analytics-social');
    const stores = document.querySelector('#analytics-stores');
    if (social) social.innerHTML = '';
    if (stores) stores.innerHTML = '<p class="admin-muted">Сторы: загрузка…</p>';
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
    const stores = document.querySelector('#analytics-stores');
    if (stores && !stores.dataset.bound) {
      stores.dataset.bound = '1';
      const uploadRustoreFile = (file) => {
        if (!file || typeof global.AdminSupabase.uploadRustoreCsv !== 'function') return;
        storeBusy = true;
        storeBusyKind = 'rustore';
        storeBusyHint = 'Читаю CSV и отправляю на сервер…';
        storeError = '';
        renderStoreDownloads(stores);
        void file
          .arrayBuffer()
          .then((buffer) => decodeStoreCsv(buffer))
          .then((csv) => global.AdminSupabase.uploadRustoreCsv(csv))
          .then((snap) => applyStoreSnapshot(snap))
          .catch((error) => {
            storeError = error instanceof Error ? error.message : String(error);
            renderStoreDownloads(stores);
          })
          .finally(() => {
            storeBusy = false;
            storeBusyKind = '';
            storeBusyHint = '';
            renderStoreDownloads(stores);
          });
      };
      stores.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.id !== 'analytics-rustore-csv') return;
        uploadRustoreFile(input.files && input.files[0]);
      });
      stores.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('#analytics-rustore-upload')) {
          const input = stores.querySelector('#analytics-rustore-csv');
          const file = input instanceof HTMLInputElement ? input.files && input.files[0] : null;
          if (file) {
            uploadRustoreFile(file);
            return;
          }
          if (input instanceof HTMLInputElement) input.click();
          return;
        }
        if (!target.closest('#analytics-apple-refresh')) return;
        if (typeof global.AdminSupabase.refreshAppleDownloads !== 'function') return;
        storeBusy = true;
        storeBusyKind = 'apple';
        storeBusyHint = 'Спрашиваю Apple: ключ → заказ отчёта → файлы. Обычно до минуты.';
        renderStoreDownloads(stores);
        void global.AdminSupabase.refreshAppleDownloads()
          .then((snap) => applyStoreSnapshot(snap))
          .catch((error) => {
            storeError = error instanceof Error ? error.message : String(error);
            renderStoreDownloads(stores);
          })
          .finally(() => {
            storeBusy = false;
            storeBusyKind = '';
            storeBusyHint = '';
            renderStoreDownloads(stores);
          });
      });
    }
  }

  global.AdminAnalytics = {
    bind,
    loadAndRender,
  };
})(window);
