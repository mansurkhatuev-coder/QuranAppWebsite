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
  const GOOGLE_PLAY_REPORTS_URL = 'https://console.cloud.google.com/storage/browser/pubsite_prod_5997333154759014155/stats/installs';
  const LOCAL_STORE_SNAPSHOT_KEY = 'quranapp-admin-v2-store-csv-imports:v1';

  let allRows = [];
  let installations = [];
  let installationCounts = null;
  let installationRowsTruncated = false;
  let rangeDays = 0;
  let installationsAvailable = false;
  let installationsTotal = null;
  let allTimeInstallCount = null;
  let eventsWindowLimited = false;
  let dashboard = null;
  let dashboardError = '';
  let demoPlatforms = null;
  let storeSnapshot = null;
  let storeError = '';
  let storeOk = '';
  let storeBusy = false;
  let storeBusyKind = '';
  let storeBusyHint = '';
  let rustoreFileInput = null;
  let googlePlayFileInput = null;

  function formatError(error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Ошибка загрузки');
    if (/analytics_dashboard/i.test(message) && /function|schema|does not exist/i.test(message)) {
      return 'Серверная сводка недоступна. Точные итоги из ограниченной выборки не подставляются.';
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
    if (curr == null || prev == null || !Number.isFinite(Number(curr)) || !Number.isFinite(Number(prev))) return '';
    const d = (Number(curr) || 0) - (Number(prev) || 0);
    if (!d) return '';
    const cls = d > 0 ? 'is-up' : 'is-down';
    const text = d > 0 ? `+${d}` : String(d);
    return `<span class="admin-store-delta ${cls}" title="к прошлому периоду">${text}</span>`;
  }

  function metricCard(label, value, opts = {}) {
    const hero = opts.hero ? ' admin-analytics-card--hero' : '';
    const delta = opts.prev != null && value != null ? formatDelta(value, opts.prev) : '';
    const sub = opts.sub ? `<span class="admin-analytics-sub">${escapeHtml(opts.sub)}</span>` : '';
    const displayValue = value == null || !Number.isFinite(Number(value))
      ? '—'
      : new Intl.NumberFormat('ru-RU').format(Number(value));
    return `
      <article class="admin-analytics-card${hero}">
        <p class="admin-muted">${escapeHtml(label)}</p>
        <p class="admin-analytics-value admin-store-value">
          <span>${displayValue}</span>
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
    return global.AdminStoreAnalyticsData?.resolveStoreMetrics(storeSnapshot, storeDeltaDays(), sumStoreRows)?.combinedDelta ?? null;
  }

  function renderSparkline(series, key, options = {}) {
    const rows = Array.isArray(series) ? series : [];
    if (!rows.length) return '';
    const values = rows.map((row) => {
      const raw = row?.[key];
      if (raw == null || raw === '') return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    });
    const numericValues = values.filter((value) => value != null);
    if (!numericValues.length) return '';
    const max = Math.max(...numericValues, 1);
    const left = 60;
    const right = 748;
    const top = 18;
    const bottom = 148;
    const x = (index) => rows.length < 2 ? (left + right) / 2 : left + (index * (right - left)) / (rows.length - 1);
    const y = (value) => bottom - (value / max) * (bottom - top);
    const segments = [];
    let currentSegment = [];
    values.forEach((value, index) => {
      if (value == null) {
        if (currentSegment.length) segments.push(currentSegment);
        currentSegment = [];
      } else currentSegment.push({ x: x(index), y: y(value), index, value });
    });
    if (currentSegment.length) segments.push(currentSegment);
    const path = segments.map((segment) => `M ${segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L ')}`).join(' ');
    const areaPath = segments.filter((segment) => segment.length > 1).map((segment) =>
      `M ${segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L ')} L ${segment[segment.length - 1].x.toFixed(1)} ${bottom} L ${segment[0].x.toFixed(1)} ${bottom} Z`
    ).join(' ');
    const labels = { active_installs: 'Активные устройства', new_installs: 'Новые установки', azkar: 'Завершения азкаров', downloads: 'Скачивания' };
    const colors = { active_installs: '#d5b66f', new_installs: '#94a2ad', azkar: '#86afbd' };
    const label = options.label || labels[key] || key;
    const color = options.color || colors[key] || '#d5b66f';
    const id = `analytics-series-${String(options.id || key).replace(/[^a-z0-9_-]/gi, '-')}`;
    const ticks = [...new Set(Array.from({ length: 5 }, (_, index) => Math.round((max * index) / 4)))].map((value) => {
      const tickY = y(value);
      return `<g class="admin-analytics-chart-tick"><line x1="${left}" y1="${tickY}" x2="${right}" y2="${tickY}" /><text x="${left - 9}" y="${tickY + 4}" text-anchor="end">${new Intl.NumberFormat('ru-RU').format(value)}</text></g>`;
    }).join('');
    const labelIndexes = new Set([0, rows.length - 1]);
    const labelStride = Math.max(1, Math.ceil((rows.length - 1) / 6));
    for (let index = 0; index < rows.length; index += labelStride) labelIndexes.add(index);
    const dateLabel = (value) => {
      const text = String(value || '');
      const month = text.match(/^(\d{4})-(\d{2})$/);
      if (month) return new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
      const day = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return day ? `${day[3]}.${day[2]}` : text || '—';
    };
    const dateTicks = [...labelIndexes].sort((a, b) => a - b).map((index) =>
      `<text class="admin-analytics-chart-date" x="${x(index)}" y="174" text-anchor="${index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}">${escapeHtml(dateLabel(rows[index]?.day))}</text>`
    ).join('');
    const circles = values.map((value, index) => {
      if (value == null) return '';
      const day = dateLabel(rows[index]?.day);
      const formattedValue = new Intl.NumberFormat('ru-RU').format(value);
      return `<g class="admin-analytics-chart-point" role="button" tabindex="0" aria-pressed="false" data-x="${x(index)}" data-y="${y(value)}" data-day="${escapeHtml(day)}" data-value="${escapeHtml(formattedValue)}" data-label="${escapeHtml(label)}" aria-label="Выбрать ${escapeHtml(day)}: ${escapeHtml(label)} — ${escapeHtml(formattedValue)}"><circle class="admin-analytics-chart-point-hit" cx="${x(index)}" cy="${y(value)}" r="13" aria-hidden="true"/><circle class="admin-analytics-chart-point-visible" cx="${x(index)}" cy="${y(value)}" r="4.2"><title>${escapeHtml(day)}: ${escapeHtml(formattedValue)}</title></circle></g>`;
    }).join('');
    const tableRows = rows.map((row) => {
      const raw = row?.[key];
      const value = raw == null || raw === '' || !Number.isFinite(Number(raw)) ? '—' : new Intl.NumberFormat('ru-RU').format(Number(raw));
      return `<tr><th scope="row">${escapeHtml(dateLabel(row.day))}</th><td>${escapeHtml(value)}</td></tr>`;
    }).join('');
    return `<figure class="admin-analytics-chart-figure">
      <figcaption><i style="--series-color:${color}"></i>${escapeHtml(label)} <span>${rows.length} точек</span></figcaption>
      <svg class="admin-analytics-chart-svg" viewBox="0 0 760 194" role="group" style="--series-color:${color}" aria-label="${escapeHtml(label)} · ${escapeHtml(options.period || 'последние 30 дней по данным сервера')}">
        <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".24"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
        ${ticks}<path d="${areaPath}" fill="url(#${id})"/><path class="admin-analytics-chart-line" d="${path}" style="--series-color:${color}"/>${circles}${dateTicks}
      </svg>
      <div class="admin-analytics-chart-selection" aria-live="polite"><span>Выберите точку на графике</span><strong>—</strong></div>
      <details class="admin-analytics-chart-data"><summary>Таблица значений</summary><div><table><thead><tr><th scope="col">Дата</th><th scope="col">${escapeHtml(label)}</th></tr></thead><tbody>${tableRows}</tbody></table></div></details>
    </figure>`;
  }

  function selectAnalyticsChartPoint(point) {
    const figure = point?.closest('.admin-analytics-chart-figure');
    if (!figure) return;
    figure.querySelectorAll('.admin-analytics-chart-point').forEach((item) => {
      const selected = item === point;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    const date = figure.querySelector('.admin-analytics-chart-selection span');
    const value = figure.querySelector('.admin-analytics-chart-selection strong');
    if (date) date.textContent = point.dataset.day || '—';
    if (value) value.textContent = `${point.dataset.label || 'Значение'}: ${point.dataset.value || '—'}`;
  }

  document.addEventListener('click', (event) => {
    let point = event.target instanceof Element ? event.target.closest('.admin-analytics-chart-point') : null;
    if (!point && event.target instanceof Element) {
      const svg = event.target.closest('.admin-analytics-chart-svg');
      const matrix = svg?.getScreenCTM?.();
      if (!svg || !matrix) return;
      const cursor = svg.createSVGPoint();
      cursor.x = event.clientX;
      cursor.y = event.clientY;
      const local = cursor.matrixTransform(matrix.inverse());
      let nearestDistance = Infinity;
      svg.querySelectorAll('.admin-analytics-chart-point').forEach((candidate) => {
        const distance = Math.hypot(local.x - Number(candidate.dataset.x), local.y - Number(candidate.dataset.y));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          point = candidate;
        }
      });
      if (nearestDistance > 40) return;
    }
    if (point) selectAnalyticsChartPoint(point);
  });
  document.addEventListener('keydown', (event) => {
    const point = event.target instanceof Element ? event.target.closest('.admin-analytics-chart-point') : null;
    if (!point || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    selectAnalyticsChartPoint(point);
  });

  function filteredRows() {
    if (!rangeDays) return allRows.slice();
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return allRows.filter((row) => {
      const t = Date.parse(row.created_at);
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  function hasInstallationRegistry() {
    return installationsAvailable && (installations.length > 0 || installationCounts != null);
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
    if (courseId === '__missing__') return 'Без курса';
    if (courseId === 'names99') return '99 имён';
    if (courseId === 'tajweed') return 'Таджвид';
    if (courseId === 'madina') return 'Медина';
    return courseId || '—';
  }

  function hasFullHistoryDetails(value = dashboard) {
    const details = value?.details;
    return Boolean(
      value?.series_coverage?.complete === true &&
      Array.isArray(details?.azkar_categories) &&
        Array.isArray(details?.lesson_courses) &&
        Array.isArray(details?.course_funnel)
    );
  }

  function renderMetricCards(container, rows) {
    if (!container) return;
    const period = dashboard?.period || null;
    const previous = dashboard?.previous || null;
    const series = dashboard?.series || [];
    const platforms = dashboard?.platforms || [];
    const reliable = Boolean(period);
    const seriesNewInstalls = global.AdminV2AnalyticsDashboardData.sumSeriesMetric(series, 'new_installs');
    const seriesActiveAverage = global.AdminV2AnalyticsDashboardData.averageSeriesMetric(series, 'active_installs');
    const activity = global.AdminV2AnalyticsDashboardData.resolveActivityMetrics({
      rows,
      series,
      eventsWindowLimited,
      eventsAreSample: true,
    });

    const activeFromRegistry = !reliable && rangeDays > 0 && installationCounts?.active != null;
    const activeFromSeries = !reliable && !activeFromRegistry && seriesActiveAverage != null;
    const active = reliable
      ? period.active
      : activeFromRegistry
        ? installationCounts.active
        : activeFromSeries
          ? seriesActiveAverage
          : null;
    const allTime = reliable
      ? dashboard.all_time_installs == null ? null : Number(dashboard.all_time_installs)
      : installationCounts?.allTime ?? (typeof allTimeInstallCount === 'number' ? allTimeInstallCount : null);
    const events = reliable ? period.events : activity.events;
    const azkar = reliable ? period.azkar : activity.azkar;
    const lessons = reliable ? period.lessons : activity.lessons;
    const opens = reliable ? period.app_open : activity.appOpen;
    const tasbih = reliable ? period.tasbih : activity.tasbih;
    const newInstallsFromRegistry = !reliable && rangeDays > 0 && installationCounts?.newInstalls != null;
    const newInstallsFromSeries = !reliable && !newInstallsFromRegistry && seriesNewInstalls != null;
    const newInstalls = reliable
      ? period.new_installs == null ? null : Number(period.new_installs)
      : newInstallsFromRegistry
        ? installationCounts.newInstalls
        : newInstallsFromSeries ? seriesNewInstalls : null;
    const azkarUsers = reliable ? period.azkar_users : activity.azkarUsers;
    const lessonUsers = reliable ? period.lesson_users : activity.lessonUsers;
    const label = rangeLabel(rangeDays);
    const storeNew = storePeriodDownloads();

    const monthlySeries = series.some((row) => /^\d{4}-\d{2}$/.test(String(row.day || '')));
    const coverage = dashboard?.series_coverage || null;
    const completeHistorySeries = rangeDays === 0 && monthlySeries && coverage?.complete === true;
    const availableHistorySeries = rangeDays === 0 && series.length > 0;
    const coverageRange = coverage?.from && coverage?.to
      ? `${String(coverage.from).slice(0, 10)} — ${String(coverage.to).slice(0, 10)}`
      : series.length ? `${String(series[0]?.day || '—')} — ${String(series[series.length - 1]?.day || '—')}` : '';
    const seriesPeriod = completeHistorySeries
      ? 'полная история · по месяцам'
      : availableHistorySeries ? `доступная история · ${coverageRange || `${series.length} точек`}` : 'последние 30 дней · по данным сервера';
    const activeLabel = activeFromSeries
      ? 'Активные устройства · среднее за доступные дни'
      : monthlySeries ? 'Активность устройств · дневное среднее за месяц' : 'Активные устройства · в день';
    const newLabel = monthlySeries ? 'Новые установки · за месяц' : 'Новые установки · в день';
    const azkarLabel = monthlySeries ? 'Завершения азкаров · за месяц' : 'Завершения азкаров · в день';
    const activeSpark = renderSparkline(series, 'active_installs', { label: activeLabel, id: 'app-active', period: seriesPeriod });
    const newSpark = renderSparkline(series, 'new_installs', { label: newLabel, id: 'app-new', period: seriesPeriod });
    const azkarSpark = renderSparkline(series, 'azkar', { label: azkarLabel, id: 'app-azkar', period: seriesPeriod });
    const trendHeading = completeHistorySeries
      ? 'Динамика за всё время · по месяцам'
      : availableHistorySeries ? 'Динамика · доступная история' : 'Дневная динамика · последние 30 дней';
    const trendNote = completeHistorySeries
      ? `Карточки выше показывают итог за всё время. График охватывает полную историю с ${escapeHtml(coverageRange)}; активность устройств показана как среднее за день в месяце.`
      : availableHistorySeries
        ? `Показаны ${series.length} ${monthlySeries ? 'месячных' : 'дневных'} точек из доступной таблицы аналитики (${escapeHtml(coverageRange)}). Это покрытие данных, а не подтверждение полной истории. Карточки выше показывают выбранный период «${escapeHtml(label)}».`
        : `Графики используют ежедневные точки за последние 30 дней, если сервер их вернул. Карточки выше считают выбранный период «${escapeHtml(label)}» отдельно. Полное покрытие истории пока не подтверждено.`;
    const trendEmpty = rangeDays === 0
      ? 'Сервер не вернул доступные точки истории. Значения не подменяются нулями.'
      : 'Сервер не вернул подтверждённый ряд за выбранный период. Значения на графике не подменяются нулями.';
    const trendBlock = `
      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>${trendHeading}</h3></div>
        <p class="admin-analytics-chart-note">${trendNote}</p>
        ${newSpark}${activeSpark}${azkarSpark}
        ${activeSpark || newSpark || azkarSpark ? '' : `<p class="admin-analytics-chart-empty">${trendEmpty}</p>`}
      </section>`;

    const compareBlock = rangeDays > 0 && (newInstalls != null || storeNew != null)
      ? `<p class="admin-analytics-compare">За период:${newInstalls != null ? ` в приложении <strong>${newInstalls}</strong> новых${newInstallsFromSeries ? ' по доступным датам' : ''}` : ''}${storeNew != null ? ` · в сторах <strong>${storeNew}</strong>` : ''}</p>`
      : '';

    const platformTotal = platforms.reduce((sum, p) => sum + (Number(p.count) || 0), 0);

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

    const platformNote = platforms.length
      ? `<p class="admin-analytics-compare">Всего по ОС: <strong>${platformTotal}</strong>${
          reliable && allTime > platformTotal
            ? ` · без ОС в базе: <strong>${allTime - platformTotal}</strong>`
            : ''
        }</p>`
      : '';

    const activityRange = coverage?.from && coverage?.to
      ? `${String(coverage.from).slice(0, 10)} — ${String(coverage.to).slice(0, 10)}`
      : '';
    const activityHeading = !reliable && activity.source === 'available_dates'
      ? `В приложении · ${label} · по доступным датам`
      : `В приложении · ${label}`;
    const activityCoverageNote = !reliable && activity.source === 'available_dates'
      ? `<p class="admin-analytics-chart-note">Карточки рассчитаны по дневным сводкам${activityRange ? ` (${escapeHtml(activityRange)})` : ''}. Полнота истории не подтверждена${coverage?.truncated ? '; источник ограничен последними 5 000 датами' : ''}.${dashboardError ? ` ${escapeHtml(dashboardError)}` : ''}</p>`
      : !reliable && activity.source === 'incomplete_sample'
        ? `<p class="admin-analytics-chart-note">Доступны только последние до 5 000 событий, поэтому итоговые значения не рассчитаны. Показанные ниже данные не подменяются неполной суммой.${dashboardError ? ` ${escapeHtml(dashboardError)}` : ''}</p>`
        : !reliable && dashboardError
          ? `<p class="admin-analytics-chart-note">${escapeHtml(dashboardError)}</p>`
          : '';

    const installationCards = rangeDays
      ? `
          ${metricCard(reliable || activeFromRegistry ? 'Активны за период' : activeFromSeries ? 'Активны · среднее по доступным датам' : 'Активны за период', active, { hero: true, prev: reliable ? previous?.active : null })}
          ${metricCard(newInstallsFromSeries ? 'Новые · доступные даты' : 'Новые', newInstalls, { hero: true, prev: reliable ? previous?.new_installs : null })}
          ${metricCard('Всего', allTime)}
        `
      : metricCard('Всего устройств', allTime, { hero: true });

    container.innerHTML = `
      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>Установки · ${escapeHtml(label)}</h3></div>
        <div class="admin-analytics-grid">
          ${installationCards}
          ${metricCard('События', events, { prev: previous?.events })}
        </div>
        ${compareBlock}
      </section>

      <section class="admin-analytics-section">
        <div class="admin-analytics-social-head"><h3>${escapeHtml(activityHeading)}</h3></div>
        ${activityCoverageNote}
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
        <div class="admin-analytics-social-head"><h3>Телефоны · всё время</h3></div>
        ${platformList}
        ${platformNote}
      </section>` : ''}
    `;
  }

  function renderBreakdown(container, title, pairs, labelFn, valueFn = null) {
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
        const label = document.createElement('span');
        label.textContent = labelFn(key);
        const value = document.createElement('strong');
        value.textContent = typeof valueFn === 'function' ? valueFn(key, count) : String(count);
        li.append(label, value);
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

  function renderCourseFunnel(container, serverFunnel = null) {
    if (!container) return;
    const rows = filteredRows();
    const funnel = Array.isArray(serverFunnel)
      ? serverFunnel.map((item) => ({
          courseId: item.course_id,
          started: Number(item.started) || 0,
          finished: Number(item.finished) || 0,
          abandoned: Number(item.abandoned) || 0,
          studying: Number(item.studying) || 0,
          totalLessons: Number(item.total_lessons) || 0,
        }))
      : buildCourseFunnel(rows);

    const block = document.createElement('div');
    block.className = 'admin-analytics-block admin-analytics-funnel';
    const head = document.createElement('div');
    head.className = 'admin-analytics-social-head';
    head.innerHTML = `
      <h3>Курсы${serverFunnel == null && eventsWindowLimited ? ' · последние 5 000 событий' : ''}</h3>
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
          <strong>${escapeHtml(courseLabel(item.courseId))}</strong>
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
    if (demoPlatforms) {
      renderBreakdown(container, 'Платформы (ОС) · демо', demoPlatforms.map((item) => [item.platform, item.count]), (key) => String(key));
      return;
    }
    if (hasInstallationRegistry()) {
      const pairs = countBy(installations, (r) => r.platform || '—');
      const suffix = installationRowsTruncated === true
        ? ` · первые ${installations.length.toLocaleString('ru-RU')} из ${Number(installationsTotal).toLocaleString('ru-RU')}`
        : installationRowsTruncated == null ? ` · выборка${installationCounts?.limit ? ` до ${installationCounts.limit.toLocaleString('ru-RU')}` : ''}` : '';
      renderBreakdown(container, `Платформы (ОС)${suffix}`, pairs, (key) => String(key));
      return;
    }
    const pairs = countUniqueInstallsBy(allRows, (r) => r.platform || '—');
    renderBreakdown(container, 'Платформы (ОС) · выборка событий', pairs, (key) => String(key));
  }

  function renderVersionBreakdown(container) {
    if (hasInstallationRegistry()) {
      const pairs = countBy(installations, (r) => r.app_version || '—');
      const suffix = installationRowsTruncated === true
        ? ` · первые ${installations.length.toLocaleString('ru-RU')} из ${Number(installationsTotal).toLocaleString('ru-RU')}`
        : installationRowsTruncated == null ? ` · выборка${installationCounts?.limit ? ` до ${installationCounts.limit.toLocaleString('ru-RU')}` : ''}` : '';
      renderBreakdown(container, `Версии приложения${suffix}`, pairs, (key) => (key === '—' ? '—' : `v${key}`));
      return;
    }
    const pairs = countUniqueInstallsBy(allRows, (r) => r.app_version || '—');
    renderBreakdown(container, 'Версии приложения · выборка событий', pairs, (key) => (key === '—' ? '—' : `v${key}`));
  }

  function sumStoreRows(rows, withinDays) {
    const list = Array.isArray(rows) ? rows : [];
    if (!withinDays) {
      return list.reduce((sum, row) => sum + (Number(row.downloads) || 0), 0);
    }
    const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    const matchingRows = list.filter((row) => {
      const t = Date.parse(`${row.day}T00:00:00.000Z`);
      return Number.isFinite(t) && t >= cutoff;
    });
    if (!matchingRows.length) return null;
    return matchingRows.reduce((sum, row) => sum + (Number(row.downloads) || 0), 0);
  }

  function readLocalStoreSnapshot() {
    return global.AdminV2StoreCsv.readSnapshot(global.localStorage, LOCAL_STORE_SNAPSHOT_KEY);
  }

  function withLocalStoreImports(remoteSnapshot) {
    return global.AdminV2StoreCsv.mergeSnapshot(remoteSnapshot, readLocalStoreSnapshot());
  }

  function saveLocalStoreImport(platform, importedRows) {
    return global.AdminV2StoreCsv.saveImport(global.localStorage, LOCAL_STORE_SNAPSHOT_KEY, platform, importedRows);
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
    const previewReadOnly = global.AdminV2Safety?.readOnly === true;
    const progress = apple && apple.progress;
    const percent = Number(progress && progress.percent) || 0;
    const status = String(apple?.status || '');
    const numbersDone = percent >= 100 || (apple && Number(apple.days) > 0);
    const button = appleBusy
      ? 'Обновляю…'
      : previewReadOnly
        ? 'В предпросмотре выключено'
      : numbersDone
        ? 'Обновить App Store'
        : 'Проверить App Store';
    const statusLine = appleBusy
      ? `<p class="admin-store-status">${escapeHtml(storeBusyHint || 'Спрашиваю Apple…')}</p>`
      : previewReadOnly
        ? '<p class="admin-store-status">Автообновление отключено в тестовом предпросмотре.</p>'
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
        <button type="button" id="analytics-apple-refresh" class="admin-button" ${storeBusy || previewReadOnly ? 'disabled' : ''}>
          ${escapeHtml(button)}
        </button>
      </div>
    `;
  }

  function looksLikeStoreTable(text) {
    return /дата|date|период|period|timeperiod|всего|total|установ|install|скач|download/i.test(String(text || ''));
  }

  function parseRustoreCsvPreview(csv) {
    const text = String(csv || '').replace(/^\uFEFF/, '').trim();
    if (!text) return { ok: false, reason: 'Файл пустой.' };

    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
    if (lines.length < 2) return { ok: false, reason: 'В файле мало строк.' };

    const detectDelimiter = (headerLine) => {
      const semi = (headerLine.match(/;/g) || []).length;
      const tab = (headerLine.match(/\t/g) || []).length;
      const comma = (headerLine.match(/,/g) || []).length;
      if (tab >= semi && tab >= comma && tab > 0) return '\t';
      if (semi >= comma && semi > 0) return ';';
      return ',';
    };
    const splitLine = (line, delimiter) =>
      line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));
    const normalizeHeader = (value) => value.replace(/^\uFEFF/, '').trim().toLowerCase();
    const headerKind = (value) => {
      const h = normalizeHeader(value);
      if (!h) return 'other';
      if (/^timeperiod$|^time[_\s-]*period$|^period$/.test(h)) return 'date';
      if (/период/.test(h) && !/конверси|просмотр|view/.test(h)) return 'date';
      if (/^(date|дата|day|день)$/i.test(h) || /дата начала/.test(h)) return 'date';
      if (/^всего$|^total$|^итого$/.test(h)) return 'downloads';
      if (/установ|install|скач|download|загруз/.test(h)) return 'downloads';
      if (/^counts?$/.test(h) || h === 'количество' || /^кол-?во/.test(h)) return 'counts';
      return 'other';
    };
    const lastDayOfMonth = (year, month) => {
      const last = new Date(Date.UTC(year, month, 0));
      const pad = (n) => String(n).padStart(2, '0');
      return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
    };
    const parseDay = (raw) => {
      const value = String(raw || '').trim();
      const monthYear = /^(\d{1,2})[./-](\d{4})$/.exec(value);
      if (monthYear) {
        const month = Number(monthYear[1]);
        const year = Number(monthYear[2]);
        if (month >= 1 && month <= 12) return lastDayOfMonth(year, month);
      }
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
      if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, '0')}-${dotted[1].padStart(2, '0')}`;
      return null;
    };
    const parseCount = (raw) => {
      const cleaned = String(raw || '').replace(/[\s\u00a0]/g, '').replace(',', '.');
      const n = Number(cleaned);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    };

    let header = null;
    for (let i = 0; i < Math.min(lines.length, 25); i += 1) {
      const delimiter = detectDelimiter(lines[i]);
      const kinds = splitLine(lines[i], delimiter).map(headerKind);
      if (kinds.includes('date') && (kinds.includes('downloads') || kinds.includes('counts'))) {
        header = { index: i, delimiter, kinds };
        break;
      }
    }
    if (!header) {
      return {
        ok: false,
        reason: 'Нет колонок «Период» и «Всего». Экспортируйте таблицу статистики из консоли RuStore.',
      };
    }

    const cells0 = splitLine(lines[header.index], header.delimiter);
    const dateIdx = header.kinds.indexOf('date');
    let downloadsIdx = header.kinds.indexOf('downloads');
    if (downloadsIdx < 0) downloadsIdx = header.kinds.indexOf('counts');

    const merged = new Map();
    for (const line of lines.slice(header.index + 1)) {
      const cells = splitLine(line, header.delimiter);
      const rawDay = cells[dateIdx] || '';
      if (/^(всего|total|итого)$/i.test(rawDay.trim())) continue;
      const day = parseDay(rawDay);
      if (!day) continue;
      merged.set(day, (merged.get(day) || 0) + parseCount(cells[downloadsIdx] || '0'));
    }
    const rows = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const total = rows.reduce((sum, [, n]) => sum + n, 0);
    if (!rows.length) {
      return { ok: false, reason: 'Даты в файле не разобрались. Нужен помесячный CSV (05.2026) или дневной.' };
    }
    return {
      ok: true,
      rows: rows.length,
      total,
      lastDay: rows[rows.length - 1][0],
      message: `${rows.length} мес. · ${total} скачиваний · до ${rows[rows.length - 1][0]}`,
    };
  }

  function decodeStoreCsv(buffer) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes);
    }
    const sampleLength = Math.min(bytes.length, 2000);
    if (sampleLength >= 8) {
      let oddNulls = 0;
      let evenNulls = 0;
      for (let index = 0; index < sampleLength; index += 1) {
        if (bytes[index] !== 0) continue;
        if (index % 2) oddNulls += 1;
        else evenNulls += 1;
      }
      if (oddNulls > sampleLength / 8 && oddNulls > evenNulls * 3) {
        return new TextDecoder('utf-16le').decode(bytes);
      }
      if (evenNulls > sampleLength / 8 && evenNulls > oddNulls * 3) {
        return new TextDecoder('utf-16be').decode(bytes);
      }
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
    const previewReadOnly = global.AdminV2Safety?.readOnly === true;
    const button = rustoreBusy ? 'Читаю CSV…' : previewReadOnly ? 'Загрузить CSV локально' : 'Выбрать CSV RuStore';
    const statusLine = rustoreBusy
      ? `<p class="admin-store-status">${escapeHtml(storeBusyHint || 'Читаю CSV…')}</p>`
      : rustore && Number(rustore.days) > 0
        ? `<p class="admin-store-status">${rustore.localCsvRows ? `История: ${Number(rustore.days)} дат, включая локальный CSV (${Number(rustore.localCsvRows)} дат)` : `Загружено ${Number(rustore.days)} дн.`} · до ${escapeHtml(rustore.lastDay || '—')}</p>`
        : '<p class="admin-store-status">Экспорт из консоли RuStore → статистика → CSV</p>';
    return `
      <div class="admin-store-progress ${rustoreBusy ? 'is-busy' : ''}" aria-live="polite">
        <div class="admin-store-progress-head">
          <strong>RuStore${rustore?.localCsvRows ? ' · есть локальный CSV' : ''}</strong>
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
    if (total == null) {
      return '<p class="admin-analytics-value admin-store-value"><span title="Нет полного покрытия истории">—</span></p>';
    }
    const n = Number(delta) || 0;
    if (delta == null || !n) {
      return `<p class="admin-analytics-value admin-store-value"><span>${total}</span></p>`;
    }
    const deltaClass = n > 0 ? 'is-up' : 'is-down';
    return `
      <p class="admin-analytics-value admin-store-value">
        <span>${total}</span>
        <span class="admin-store-delta ${deltaClass}" title="За ${rangeLabel(storeDeltaDays())}">${formatStoreDelta(n)}</span>
      </p>`;
  }

  function sumStoreField(rows, field, withinDays) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;
    const cutoff = withinDays ? Date.now() - withinDays * 24 * 60 * 60 * 1000 : 0;
    const matchingRows = list.filter((row) => {
      const time = Date.parse(`${row.day}T00:00:00.000Z`);
      return !withinDays || (Number.isFinite(time) && time >= cutoff);
    });
    if (!matchingRows.length) return null;
    return matchingRows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
  }

  function latestStoreField(rows, field) {
    const list = Array.isArray(rows) ? rows : [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const value = list[index][field];
      if (value != null && Number.isFinite(Number(value))) return Number(value);
    }
    return null;
  }

  function renderGooglePlayProgress(googlePlay) {
    const googleRefreshBusy = storeBusyKind === 'googleplay';
    const googleUploadBusy = storeBusyKind === 'googleplay-upload';
    const googleBusy = googleRefreshBusy || googleUploadBusy;
    const status = String(googlePlay?.status || '');
    const previewReadOnly = global.AdminV2Safety?.readOnly === true;
    const days = Number(googlePlay?.days) || 0;
    const lastDay = googlePlay?.lastDay || '—';
    const statusLine = googleBusy
      ? `<p class="admin-store-status">${escapeHtml(storeBusyHint || 'Загружаю отчёты Google Play…')}</p>`
      : previewReadOnly
        ? `<p class="admin-store-status">${days > 0 ? `История: ${days} дат · по ${escapeHtml(lastDay)}${googlePlay?.localCsvRows ? `, включая локальный CSV (${Number(googlePlay.localCsvRows)} дат)` : ''}.` : 'Автообновление отключено в тестовом предпросмотре.'} Импорт CSV остаётся локальным.</p>`
        : status === 'needs_secrets'
        ? '<p class="admin-store-status admin-error">Для автообновления добавьте сервисный аккаунт в секреты Supabase. CSV можно загрузить вручную.</p>'
        : status === 'waiting'
          ? '<p class="admin-store-status">Google Play пока не подготовил отчёт. Попробуйте позже.</p>'
          : status === 'error' && googlePlay?.message
            ? `<p class="admin-store-status admin-error">${escapeHtml(googlePlay.message)}</p>`
            : days > 0
              ? `<p class="admin-store-status">В базе ${days} дн. · данные по ${escapeHtml(lastDay)}</p>`
              : `<p class="admin-store-status">${escapeHtml(googlePlay?.message || 'Для ручной загрузки выберите CSV отчёта установок из Play Console; для автообновления нажмите «Обновить Google Play».')}</p>`;
    return `
      <div class="admin-store-progress ${googleBusy ? 'is-busy' : ''}" aria-live="polite">
        <div class="admin-store-progress-head">
          <strong>Google Play${googlePlay?.localCsvRows ? ' · есть локальный CSV' : ''}</strong>
          <a class="admin-store-link" href="${GOOGLE_PLAY_REPORTS_URL}" target="_blank" rel="noopener noreferrer" title="Открыть CSV-отчёты установок Google Play">Отчёты</a>
        </div>
        ${statusLine}
        <button type="button" id="analytics-google-play-refresh" class="admin-button" ${storeBusy || previewReadOnly ? 'disabled' : ''}>
          ${googleRefreshBusy ? 'Обновляю…' : previewReadOnly ? 'В предпросмотре выключено' : 'Обновить Google Play'}
        </button>
        <button type="button" id="analytics-google-play-upload" class="admin-button" ${storeBusy ? 'disabled' : ''}>
          ${googleUploadBusy ? 'Читаю CSV…' : previewReadOnly ? 'Загрузить CSV локально' : 'Загрузить CSV Google Play'}
        </button>
      </div>
    `;
  }

  function renderStoreDownloads(container) {
    if (!container) return;
    const rustore = storeSnapshot?.rustore || { rows: [], total: 0 };
    const apple = storeSnapshot?.apple || { rows: [], total: 0 };
    const googlePlay = storeSnapshot?.googleplay || { rows: [], total: 0 };
    const deltaDays = storeDeltaDays();
    const storeMetrics = global.AdminStoreAnalyticsData?.resolveStoreMetrics(storeSnapshot, deltaDays, sumStoreRows)
      || { rustore: { total: null, delta: null }, apple: { total: null, delta: null }, googleplay: { total: null, delta: null }, combinedTotal: null, combinedDelta: null };
    const { total: rustoreAll, delta: rustoreDelta } = storeMetrics.rustore;
    const { total: appleAll, delta: appleDelta } = storeMetrics.apple;
    const { total: googlePlayAll, delta: googlePlayDelta } = storeMetrics.googleplay;
    const { combinedTotal: storesAll, combinedDelta: storesDelta } = storeMetrics;
    const storeHistoryComplete = storeSnapshot?.coverage?.complete !== false;
    const periodLabel = rangeDays ? rangeLabel(rangeDays) : 'за всё время';
    const googlePlayUninstalls = storeHistoryComplete ? sumStoreField(googlePlay.rows, 'uninstalls', rangeDays) : null;
    const googlePlayUpdates = storeHistoryComplete ? sumStoreField(googlePlay.rows, 'updates', rangeDays) : null;
    const currentUserInstalls = storeHistoryComplete ? googlePlay.currentUserInstalls ?? latestStoreField(googlePlay.rows, 'currentUserInstalls') : null;
    const activeDeviceInstalls = storeHistoryComplete ? googlePlay.activeDeviceInstalls ?? latestStoreField(googlePlay.rows, 'activeDeviceInstalls') : null;
    const coverage = storeSnapshot?.coverage || {};
    const coverageLine = !storeHistoryComplete
      ? `<p class="admin-store-status">${escapeHtml(coverage.message || 'Загружена часть истории статистики магазинов.')} Показано строк: ${Number(coverage.loadedRows) || 0}${Number.isFinite(coverage.expectedRows) ? ` из ${coverage.expectedRows}` : ''}. Итоги скрыты до полной загрузки.</p>`
      : '';
    const errorLine = storeError
      ? `<p class="admin-error">${escapeHtml(storeError)}</p>`
      : '';
    const okLine = !storeError && storeOk
      ? `<p class="admin-store-ok">${escapeHtml(storeOk)}</p>`
      : '';
    const storeHistory = [
      { id: 'rustore', label: 'RuStore · загрузки', color: '#94a2ad', rows: rustore.rows },
      { id: 'app-store', label: 'App Store · загрузки', color: '#9eabed', rows: apple.rows },
      { id: 'google-play', label: 'Google Play · новые установки', color: '#dcc37f', rows: googlePlay.rows },
    ].map((store) => {
      const rows = Array.isArray(store.rows) ? store.rows : [];
      const filteredRows = rangeDays > 0
        ? rows.filter((row) => {
            const day = Date.parse(`${row.day}T00:00:00.000Z`);
            return Number.isFinite(day) && day >= Date.now() - rangeDays * 24 * 60 * 60 * 1000;
          })
        : rows;
      return { ...store, rows: filteredRows };
    });
    const storeHistoryCharts = storeHistory.filter((store) => store.rows.length)
      .map((store) => renderSparkline(store.rows, 'downloads', {
        id: `store-${store.id}`,
        label: store.label,
        color: store.color,
        period: rangeDays > 0 ? rangeLabel(rangeDays) : storeHistoryComplete ? 'вся загруженная история отчётов' : 'часть загруженной истории',
      })).join('');

    container.innerHTML = `
      <div class="admin-analytics-social-head">
        <h3>Скачивания в сторах</h3>
      </div>
      ${errorLine}
      ${okLine}
      ${coverageLine}
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
          <p class="admin-muted">Сумма отчётов · все 3</p>
          ${renderStoreValue(storesAll, storesDelta)}
        </article>
        <article class="admin-analytics-card admin-analytics-card--hero">
          <p class="admin-muted">Google Play · новые установки</p>
          ${renderStoreValue(googlePlayAll, googlePlayDelta)}
        </article>
      </div>
      <div class="admin-analytics-grid" id="analytics-google-play-details">
        <article class="admin-analytics-card">
          <p class="admin-muted">Google Play · удаления ${escapeHtml(periodLabel)}</p>
          <p class="admin-analytics-value">${googlePlayUninstalls == null ? '—' : googlePlayUninstalls}</p>
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">Google Play · обновления ${escapeHtml(periodLabel)}</p>
          <p class="admin-analytics-value">${googlePlayUpdates == null ? '—' : googlePlayUpdates}</p>
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">Google Play · текущие установки пользователей</p>
          <p class="admin-analytics-value">${currentUserInstalls == null ? '—' : Number(currentUserInstalls) || 0}</p>
        </article>
        <article class="admin-analytics-card">
          <p class="admin-muted">Google Play · установки на активных устройствах</p>
          <p class="admin-analytics-value">${activeDeviceInstalls == null ? '—' : Number(activeDeviceInstalls) || 0}</p>
        </article>
      </div>
      ${renderRustoreUpload(rustore)}
      ${renderAppleProgress(apple)}
      ${renderGooglePlayProgress(googlePlay)}
      <section class="admin-analytics-store-history">
        <div class="admin-analytics-social-head"><h3>Динамика по магазинам · ${escapeHtml(rangeLabel(rangeDays))}</h3></div>
        <p class="admin-analytics-chart-note">Отдельные ряды из импортированных отчётов. Показаны только даты, которые есть в источнике; пропуски не принимаются за нулевые скачивания.</p>
        ${storeHistoryCharts || '<p class="admin-analytics-chart-empty">Нет загруженной истории отчётов для построения графиков. Импортируйте данные магазина, чтобы увидеть динамику.</p>'}
      </section>
      <p class="admin-muted admin-analytics-note">Google Play публикует статистику с задержкой; значения обновляются после появления отчётов в Play Console.</p>
    `;
  }

  async function applyStoreSnapshot(next, okMessage = '') {
    storeSnapshot = withLocalStoreImports(next);
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

  function ensureGooglePlayFileInput(stores) {
    if (googlePlayFileInput && document.body.contains(googlePlayFileInput)) return googlePlayFileInput;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'analytics-google-play-csv-persistent';
    input.accept = '.csv,text/csv,text/plain';
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;';
    // Keep outside #analytics-stores so re-renders do not destroy the picker (iOS Safari).
    stores.parentElement.appendChild(input);
    googlePlayFileInput = input;
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
    const fullHistoryDetails = hasFullHistoryDetails();
    const details = dashboard?.details;

    if (stats) {
      if (period) {
        const activity = rangeDays
          ? `активны за период ${period.active == null ? '—' : period.active}`
          : `всего устройств ${dashboard?.all_time_installs == null ? '—' : dashboard.all_time_installs}`;
        stats.textContent = `${rangeLabel(rangeDays)} · ${activity} · уроков ${period.lessons == null ? '—' : period.lessons}`;
      } else {
        stats.textContent = rangeLabel(rangeDays);
      }
    }
    renderMetricCards(metrics, rows);
    publishOverviewAnalytics();
    renderStoreDownloads(document.querySelector('#analytics-stores'));

    // Hide noisy duplicate blocks (today academy / raw event dumps).
    if (social) social.innerHTML = '';

    if (!breakdown) return;
    breakdown.innerHTML = '';

    const azkarCats = fullHistoryDetails
      ? details.azkar_categories.map((item) => [item.category, Number(item.completions) || 0])
      : countBy(
          rows.filter((r) => r.event === 'azkar_item_completed'),
          (r) => (r.props && r.props.category) || '__missing__'
        );
    const courses = fullHistoryDetails
      ? details.lesson_courses.map((item) => [item.course_id, item])
      : countBy(
          rows.filter((r) => r.event === 'academy_lesson_completed'),
          (r) => (r.props && r.props.course_id) || '__missing__'
        );
    const detailSampleSuffix = !fullHistoryDetails && eventsWindowLimited
      ? ' · последние 5 000 событий'
      : '';

    if (fullHistoryDetails || azkarCats.length || courses.length) {
      const head = document.createElement('div');
      head.className = 'admin-analytics-social-head';
      head.innerHTML = '<h3>Подробнее</h3>';
      breakdown.appendChild(head);
    }
    if (fullHistoryDetails || azkarCats.length) {
      renderBreakdown(
        breakdown,
        `Азкары по темам${detailSampleSuffix}`,
        azkarCats,
        (key) => (key === '__missing__' ? 'Без темы' : String(key))
      );
    }
    if (fullHistoryDetails || courses.length) {
      const lessonTotal = fullHistoryDetails
        ? Number(period?.lessons) || 0
        : courses.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
      const courseTotal = courses.reduce(
        (sum, [, item]) => sum + (Number(fullHistoryDetails ? item.completions : item) || 0),
        0
      );
      renderBreakdown(
        breakdown,
        `Уроки по курсам${detailSampleSuffix}`,
        courses,
        (key) => courseLabel(key),
        (key, item) => fullHistoryDetails
          ? `${Number(item.completions) || 0} · ${Number(item.learners) || 0} чел.`
          : String(Number(item) || 0)
      );
      const reconciliation = document.createElement('p');
      reconciliation.className = 'admin-muted';
      reconciliation.textContent = fullHistoryDetails
        ? `По курсам и «Без курса»: ${courseTotal} завершений · всего уроков: ${lessonTotal}.`
        : `В выборке: ${courseTotal} завершений.`;
      breakdown.appendChild(reconciliation);
    }
    renderCourseFunnel(breakdown, fullHistoryDetails ? details.course_funnel : null);
  }

  function renderDemo(data = {}) {
    const payload = data.dashboard ? data : { dashboard: data };
    rangeDays = Number(payload.rangeDays ?? document.querySelector('#analytics-range')?.value) || 0;
    dashboard = payload.dashboard || null;
    demoPlatforms = Array.isArray(dashboard?.platforms) ? dashboard.platforms : null;
    storeSnapshot = payload.storeSnapshot || {};
    storeError = '';
    storeOk = 'ДЕМО · условные значения, не статистика пользователей';
    allRows = [];
    installations = (dashboard?.platforms || []).map((row) => ({ platform: row.platform, app_version: '0.0-demo' }));
    installationsTotal = Number(dashboard?.all_time_installs) || 0;
    installationCounts = { rows: installations, allTime: installationsTotal, active: dashboard?.period?.active ?? null, newInstalls: dashboard?.period?.new_installs ?? null, truncated: false, limit: installations.length };
    installationRowsTruncated = false;
    installationsAvailable = true;
    allTimeInstallCount = installationsTotal;
    eventsWindowLimited = false;
    dashboardError = '';
    renderAll();
    const stats = document.querySelector('#analytics-stats');
    if (stats) stats.textContent = `ДЕМО · искусственные данные · ${rangeLabel(rangeDays)} · пользователи не подключены`;
    document.querySelectorAll('#analytics-stores .admin-store-progress button').forEach((button) => {
      button.disabled = true;
      button.textContent = 'Импорт отключён в демо';
      button.title = 'Демо-показатели заданы в локальном наборе';
    });
    document.querySelectorAll('#analytics-stores .admin-store-link').forEach((link) => { link.hidden = true; });
  }

  function publishOverviewAnalytics(source = dashboard, sourceRange = rangeDays) {
    if (!global.parent || global.parent === global || typeof global.parent.postMessage !== 'function') return;
    const series = Array.isArray(source?.series) ? source.series.map((row) => ({
      day: String(row?.day || '').slice(0, 10),
      active_installs: row?.active_installs == null ? null : Number(row.active_installs),
      new_installs: row?.new_installs == null ? null : Number(row.new_installs),
    })).filter((row) => row.day) : [];
    global.parent.postMessage({
      type: 'admin-v2:analytics-series',
      rangeDays: sourceRange,
      series,
      coverage: source?.series_coverage || null,
    }, global.location.origin);
  }

  async function loadDashboardForRange() {
    dashboard = null;
    dashboardError = '';
    demoPlatforms = null;
    if (global.AdminV2Safety?.readOnly === true) return null;
    if (typeof global.AdminSupabase.loadAnalyticsDashboard !== 'function') return null;
    try {
      dashboard = await global.AdminSupabase.loadAnalyticsDashboard(rangeDays);
      if (dashboard?.all_time_installs != null) {
        allTimeInstallCount = Number(dashboard.all_time_installs) || 0;
      }
      return dashboard;
    } catch (error) {
      dashboard = null;
      dashboardError = formatError(error);
      console.warn('analytics dashboard', error);
      return null;
    }
  }

  async function loadReadOnlyDailySeries() {
    const client = global.AdminSupabase?.getClient?.();
    if (!client || typeof client.from !== 'function') return null;
    let query = client
      .from('analytics_daily')
      .select('day,active_installs,new_installs,events_total,app_open,azkar_item_completed,academy_lesson_completed');
    if (rangeDays > 0) {
      const fromDay = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query = query.gte('day', fromDay);
    }
    const result = await query.order('day', { ascending: true }).limit(5000);
    if (result.error) throw result.error;
    const rows = Array.isArray(result.data) ? result.data : [];
    const daily = rows.map((row) => ({
      day: String(row.day || '').slice(0, 10),
      active_installs: row.active_installs == null ? null : Number(row.active_installs),
      new_installs: row.new_installs == null ? null : Number(row.new_installs),
      events_total: row.events_total == null ? null : Number(row.events_total),
      app_open: row.app_open == null ? null : Number(row.app_open),
      azkar: row.azkar_item_completed == null ? null : Number(row.azkar_item_completed),
      lessons: row.academy_lesson_completed == null ? null : Number(row.academy_lesson_completed),
    }));
    const series = rangeDays === 0 && daily.length > 370
      ? [...daily.reduce((months, row) => {
          const key = row.day.slice(0, 7);
          const month = months.get(key) || { day: key, activeTotal: 0, activeDays: 0, new_installs: 0, events_total: 0, app_open: 0, azkar: 0, lessons: 0 };
          if (row.active_installs != null) { month.activeTotal += row.active_installs; month.activeDays += 1; }
          if (row.new_installs != null) month.new_installs += row.new_installs;
          if (row.events_total != null) month.events_total += row.events_total;
          if (row.app_open != null) month.app_open += row.app_open;
          if (row.azkar != null) month.azkar += row.azkar;
          if (row.lessons != null) month.lessons += row.lessons;
          months.set(key, month);
          return months;
        }, new Map()).values()].map((month) => ({
          day: month.day,
          active_installs: month.activeDays ? Math.round(month.activeTotal / month.activeDays) : 0,
          new_installs: month.new_installs,
          events_total: month.events_total,
          app_open: month.app_open,
          azkar: month.azkar,
          lessons: month.lessons,
        }))
      : daily;
    return {
      series,
      series_coverage: {
        from: rows[0]?.day ? String(rows[0].day).slice(0, 10) : null,
        to: rows.at(-1)?.day ? String(rows.at(-1).day).slice(0, 10) : null,
        complete: false,
        truncated: rows.length >= 5000,
        source: 'analytics_daily',
      },
    };
  }

  async function loadDashboardForCurrentRange() {
    dashboard = await global.AdminV2AnalyticsDashboardData.loadForRange({
      readOnly: global.AdminV2Safety?.readOnly === true,
      loadDashboard: loadDashboardForRange,
      loadReadOnlySeries: async () => {
        try {
          return await loadReadOnlyDailySeries();
        } catch (error) {
          console.warn('read-only analytics daily series unavailable', error);
          return null;
        }
      },
    });
    return dashboard;
  }

  async function loadOverviewSeries() {
    if (global.AdminV2Safety?.readOnly !== true) {
      publishOverviewAnalytics({ series: [], series_coverage: null }, 0);
      return;
    }
    try {
      const result = await loadReadOnlyDailySeries();
      publishOverviewAnalytics(result || { series: [], series_coverage: null }, 0);
    } catch (error) {
      console.warn('read-only overview series unavailable', error);
      publishOverviewAnalytics({ series: [], series_coverage: null }, 0);
    }
  }

  async function loadAndRender() {
    const metrics = document.querySelector('#analytics-metrics');
    const breakdown = document.querySelector('#analytics-breakdown');
    const stats = document.querySelector('#analytics-stats');
    if (
      !metrics ||
      (!global.AdminSupabase?.loadAnalyticsEvents && !global.AdminSupabase?.loadAnalyticsDashboard)
    ) return;

    metrics.innerHTML = '<p class="admin-muted">Загрузка…</p>';
    const social = document.querySelector('#analytics-social');
    const stores = document.querySelector('#analytics-stores');
    if (social) social.innerHTML = '';
    if (stores) stores.innerHTML = '<p class="admin-muted">Сторы: загрузка…</p>';
    if (breakdown) breakdown.innerHTML = '';
    if (stats) stats.textContent = 'Загрузка…';
    storeError = '';
    storeOk = '';
    allRows = [];
    installations = [];
    installationsTotal = null;
    installationCounts = null;
    installationRowsTruncated = false;
    installationsAvailable = false;
    allTimeInstallCount = null;
    eventsWindowLimited = false;
    dashboard = null;
    dashboardError = '';
    demoPlatforms = null;

    try {
      await loadDashboardForCurrentRange();

      const serverHasFullDetails = hasFullHistoryDetails();
      if (!serverHasFullDetails && typeof global.AdminSupabase.loadAnalyticsEvents === 'function') {
        const eventsPayload = await global.AdminSupabase.loadAnalyticsEvents();
        allRows = Array.isArray(eventsPayload) ? eventsPayload : (eventsPayload?.rows || []);
        // loadAnalyticsEvents always returns the compatibility query capped at 5,000 rows.
        // A short response does not prove that the query contains the full history.
        eventsWindowLimited = true;
      } else {
        allRows = [];
        eventsWindowLimited = false;
      }
      installations = [];
      installationsTotal = null;
      installationCounts = null;
      installationRowsTruncated = false;
      installationsAvailable = false;
      const readOnlySeriesOnly = global.AdminV2Safety?.readOnly === true && !hasFullHistoryDetails();
      if ((!dashboard || readOnlySeriesOnly) && typeof global.AdminSupabase.loadAnalyticsInstallations === 'function') {
        try {
          const installPayload = await global.AdminSupabase.loadAnalyticsInstallations(rangeDays);
          const normalizedInstalls = global.AdminV2AnalyticsDashboardData.resolveInstallationCounts(installPayload);
          installations = normalizedInstalls.rows;
          installationsTotal = normalizedInstalls.allTime ?? installations.length;
          installationCounts = normalizedInstalls;
          installationRowsTruncated = normalizedInstalls.truncated;
          allTimeInstallCount = normalizedInstalls.allTime;
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

      await applyStoreSnapshot({});
      if (global.AdminV2Safety?.readOnly === true) {
        try {
          const readOnlyStoreLoader = global.AdminV2StoreDownloadsReadOnly?.load;
          if (typeof readOnlyStoreLoader !== 'function') {
            throw new Error('Безопасный источник статистики магазинов не подключён.');
          }
          const snap = await readOnlyStoreLoader(global.AdminSupabase?.getClient?.());
          await applyStoreSnapshot(snap);
        } catch (storeLoadError) {
          storeError = storeLoadError instanceof Error ? storeLoadError.message : String(storeLoadError);
          storeSnapshot = withLocalStoreImports({});
          renderStoreDownloads(document.querySelector('#analytics-stores'));
        }
      } else if (typeof global.AdminSupabase.loadStoreDownloads === 'function') {
        try {
          const snap = await global.AdminSupabase.loadStoreDownloads();
          await applyStoreSnapshot(snap);
        } catch (storeLoadError) {
          storeError = storeLoadError instanceof Error ? storeLoadError.message : String(storeLoadError);
          storeSnapshot = withLocalStoreImports({});
          renderStoreDownloads(document.querySelector('#analytics-stores'));
        }
      }
    } catch (error) {
      allRows = [];
      installations = [];
      installationsTotal = null;
      installationCounts = null;
      installationRowsTruncated = false;
      allTimeInstallCount = null;
      installationsAvailable = false;
      eventsWindowLimited = false;
      dashboard = null;
      demoPlatforms = null;
      if (stats) stats.textContent = 'Не удалось загрузить';
      metrics.innerHTML = `<p class="admin-error">${formatError(error)}</p>`;
      publishOverviewAnalytics();
    }
  }

  function bind({ $ }) {
    const range = $('#analytics-range');
    if (range) {
      range.addEventListener('change', () => {
        rangeDays = Number(range.value) || 0;
        void loadAndRender();
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
      const googlePlayInput = ensureGooglePlayFileInput(stores);

      const uploadRustoreFile = (file) => {
        const previewReadOnly = global.AdminV2Safety?.readOnly === true;
        if (!file || (!previewReadOnly && typeof global.AdminSupabase.uploadRustoreCsv !== 'function')) return;
        storeBusyHint = previewReadOnly ? 'Читаю CSV и сохраняю в этом браузере…' : 'Читаю CSV и отправляю на сервер…';
        void runStoreAction('rustore', async () => {
          const buffer = await file.arrayBuffer();
          const csv = decodeStoreCsv(buffer);
          if (!String(csv || '').trim()) {
            throw new Error('Файл пустой или не читается. Экспортируйте CSV заново из консоли RuStore.');
          }
          if (previewReadOnly) {
            const parsed = global.AdminV2StoreCsv.parseRuStore(csv);
            if (!parsed.ok) throw new Error(parsed.reason);
            const imported = saveLocalStoreImport('rustore', parsed.rows);
            await applyStoreSnapshot(storeSnapshot || {}, `RuStore CSV сохранён локально: ${imported.total} скачиваний · ${imported.days} дн.`);
            return;
          }
          const preview = parseRustoreCsvPreview(csv);
          if (!preview.ok) {
            throw new Error(preview.reason);
          }
          const snap = await global.AdminSupabase.uploadRustoreCsv(csv);
          const days = Number(snap?.rustore?.days) || preview.rows || 0;
          const total = sumStoreRows(snap?.rustore?.rows || [], 0) || preview.total || 0;
          await applyStoreSnapshot(
            snap,
            days
              ? `RuStore обновлён: ${total} скачиваний · ${days} пер.`
              : `CSV принят (${preview.message}), но сервер не сохранил строки. Задеплойте store-downloads.`
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

      const uploadGooglePlayFile = (file) => {
        if (!file) return;
        const previewReadOnly = global.AdminV2Safety?.readOnly === true;
        if (!previewReadOnly && typeof global.AdminSupabase.uploadGooglePlayCsv !== 'function') {
          storeError = 'Ручная загрузка Google Play недоступна. Обновите страницу админки.';
          renderStoreDownloads(document.querySelector('#analytics-stores'));
          return;
        }
        storeBusyHint = previewReadOnly ? 'Читаю CSV и сохраняю в этом браузере…' : 'Читаю CSV Google Play и отправляю на сервер…';
        void runStoreAction('googleplay-upload', async () => {
          const buffer = await file.arrayBuffer();
          const csv = decodeStoreCsv(buffer);
          if (!String(csv || '').trim()) {
            throw new Error('Файл пустой или не читается. Выберите CSV отчёта установок из Google Play Console.');
          }
          if (previewReadOnly) {
            const parsed = global.AdminV2StoreCsv.parseGooglePlay(csv);
            if (!parsed.ok) throw new Error(parsed.reason);
            const imported = saveLocalStoreImport('googleplay', parsed.rows);
            await applyStoreSnapshot(storeSnapshot || {}, `Google Play CSV сохранён локально: ${imported.days} дн. · ${parsed.rows[0].day} — ${imported.lastDay}`);
            return;
          }
          storeBusyHint = 'Проверяю отчёт и обновляю данные Google Play…';
          renderStoreDownloads(document.querySelector('#analytics-stores'));
          const snap = await global.AdminSupabase.uploadGooglePlayCsv(csv);
          const imported = snap?.googlePlayCsvImport || {};
          const importedRows = Number(imported.rows) || 0;
          if (!importedRows) {
            throw new Error('Сервер не вернул количество импортированных дат. Обновите функцию store-downloads.');
          }
          const firstDay = String(imported.firstDay || '');
          const lastDay = String(imported.lastDay || '');
          await applyStoreSnapshot(
            snap,
            `Google Play CSV загружен: ${importedRows} дн. · ${firstDay} — ${lastDay}`
          );
        }).finally(() => {
          // Allow selecting the same file again on iOS.
          googlePlayInput.value = '';
        });
      };

      googlePlayInput.addEventListener('change', () => {
        const file = googlePlayInput.files && googlePlayInput.files[0];
        if (file) uploadGooglePlayFile(file);
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

        if (target.closest('#analytics-google-play-upload')) {
          if (storeBusy) return;
          googlePlayInput.value = '';
          googlePlayInput.click();
          return;
        }

        const appleButton = target.closest('#analytics-apple-refresh');
        const googlePlayButton = target.closest('#analytics-google-play-refresh');
        if (!appleButton && !googlePlayButton) return;
        if (appleButton) {
          if (global.AdminV2Safety?.readOnly === true) return;
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
          return;
        }

        if (global.AdminV2Safety?.readOnly === true) return;
        if (typeof global.AdminSupabase.refreshGooglePlayDownloads !== 'function') return;
        storeBusyHint = 'Загружаю отчёты Google Play…';
        void runStoreAction('googleplay', async () => {
          const beforeDays = Number(storeSnapshot?.googleplay?.days) || 0;
          const beforeTotal = sumStoreRows(storeSnapshot?.googleplay?.rows || [], 0);
          const snap = await global.AdminSupabase.refreshGooglePlayDownloads();
          const googlePlay = snap?.googleplay || {};
          const afterDays = Number(googlePlay.days) || 0;
          const afterTotal = sumStoreRows(googlePlay.rows || [], 0);
          const sync = snap?.googlePlaySync || {};
          const status = String(googlePlay.status || sync.status || '');
          let ok = '';
          if (status === 'waiting') {
            ok = 'Google Play пока не подготовил отчёт. Новые данные появятся позже.';
          } else if (afterTotal > beforeTotal || afterDays > beforeDays) {
            ok = `Google Play обновлён: ${afterTotal} новых установок · ${afterDays} дн.`;
          } else if (afterDays > 0) {
            ok = 'Google Play проверен — новых данных пока нет.';
          } else {
            ok = String(sync.message || googlePlay.message || 'Google Play проверен.');
          }
          await applyStoreSnapshot(snap, ok);
        });
      });
    }
  }

  global.AdminAnalytics = {
    bind,
    loadAndRender,
    loadOverviewSeries,
    renderDemo,
  };
})(window);
