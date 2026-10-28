(() => {
  "use strict";

  const html = document.documentElement;
  const legacyFrame = document.getElementById("legacy-frame");
  const workbenchFrame = document.getElementById("workbench-frame");
  const localeFrame = document.getElementById("locale-frame");
  const leaveDialog = document.getElementById("leave-dialog");
  const title = document.getElementById("view-breadcrumb");
  const viewTitles = { overview: "Обзор", content: "Контент", legacy: "Инструменты", locale: "Переводы интерфейса" };
  const state = { view: "overview", legacySection: "command", dirty: false, dirtyFrame: null, dirtyFrames: new Set(), density: "studio" };
  const DRAFT_ACTIVITY_KEY = "quranapp-admin-v2-drafts";
  const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  const overviewDemoSeries = [
    { day: "2025-11", active_installs: 1960, new_installs: 184 },
    { day: "2025-12", active_installs: 2085, new_installs: 212 },
    { day: "2026-01", active_installs: 2270, new_installs: 196 },
    { day: "2026-02", active_installs: 2180, new_installs: 173 },
    { day: "2026-03", active_installs: 2545, new_installs: 241 },
    { day: "2026-04", active_installs: 2790, new_installs: 236 },
    { day: "2026-05", active_installs: 3015, new_installs: 268 },
    { day: "2026-06", active_installs: 2940, new_installs: 229 },
    { day: "2026-07", active_installs: 3460, new_installs: 312 },
    { day: "2026-08", active_installs: 3715, new_installs: 307 },
    { day: "2026-09", active_installs: 4030, new_installs: 346 },
    { day: "2026-10", active_installs: 4285, new_installs: 391 },
  ];
  let draftSaveResolve = null;
  let draftSaveTimer = 0;
  let draftSaveRequestId = "";
  let draftSaveTarget = null;
  let draftSaveSequence = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function chartDateLabel(value, long = false) {
    const text = String(value || "");
    const month = text.match(/^(\d{4})-(\d{2})$/);
    if (month) return new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleDateString("ru-RU", long ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
    const day = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!day) return text || "—";
    return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).toLocaleDateString("ru-RU", long ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short" });
  }

  function renderOverviewAnalytics(payload = {}) {
    const chart = document.getElementById("overview-chart");
    const seriesGroup = document.getElementById("overview-chart-series");
    const datesGroup = document.getElementById("overview-chart-dates");
    const note = document.getElementById("overview-chart-note");
    const readout = document.getElementById("overview-chart-readout");
    if (!chart || !seriesGroup || !datesGroup || !note || !readout) return;
    const allowDemo = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const { rows, isDemo } = window.AdminV2OverviewChartData.resolveRows({
      series: payload.series,
      demoRows: overviewDemoSeries,
      allowDemo,
    });
    chart.querySelector(".overview-chart-selection-guide")?.remove();

    const definitions = [
      { key: "active_installs", label: "Активные устройства", color: "#8ab99a" },
      { key: "new_installs", label: "Новые установки", color: "#d8bd78" },
    ];
    const metricValue = (row, key) => row[key] == null || !Number.isFinite(Number(row[key])) ? null : Math.max(0, Number(row[key]));
    const values = rows.flatMap((row) => definitions.map(({ key }) => metricValue(row, key)).filter((value) => value != null));
    const max = Math.max(...values, 1);
    const left = 54;
    const right = 888;
    const top = 24;
    const bottom = 208;
    const x = (index) => rows.length < 2 ? (left + right) / 2 : left + ((right - left) * index) / (rows.length - 1);
    const y = (value) => bottom - (Math.max(0, Number(value) || 0) / max) * (bottom - top);
    const tickText = [...document.querySelectorAll(".overview-chart-grid text")];
    tickText.forEach((label, index) => {
      const value = Math.round((max * (4 - index)) / 4);
      label.textContent = index === 4 && value === 0 ? "0" : numberFormat.format(value);
      label.setAttribute("y", String(top + ((bottom - top) * index) / 4 + 4));
    });
    if (!rows.length) {
      datesGroup.innerHTML = "";
      seriesGroup.innerHTML = "";
      chart.__adminV2Rows = [];
      chart.dataset.rowCount = "0";
      const sourceBadge = document.getElementById("overview-chart-source");
      if (sourceBadge) {
        sourceBadge.textContent = "НЕТ ДАННЫХ";
        sourceBadge.classList.remove("is-live");
      }
      chart.setAttribute("aria-label", "Нет данных для графика использования приложения.");
      note.textContent = "Нет доступных данных для графика.";
      readout.innerHTML = "<strong>—</strong><span>Нет данных</span>";
      return;
    }
    const stride = Math.max(1, Math.ceil((rows.length - 1) / 5));
    const labelIndexes = [...new Set([0, ...Array.from({ length: rows.length }, (_, index) => index).filter((index) => index % stride === 0), rows.length - 1])];
    datesGroup.innerHTML = labelIndexes.map((index) => `<text x="${x(index).toFixed(1)}" y="241" text-anchor="${index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"}">${escapeHtml(chartDateLabel(rows[index].day))}</text>`).join("");
    seriesGroup.innerHTML = definitions.map((definition) => {
      const allPoints = rows.map((row, index) => ({ x: x(index), y: y(metricValue(row, definition.key) ?? 0), value: metricValue(row, definition.key), row, index }));
      const points = allPoints.filter((point) => point.value != null);
      if (!points.length) return "";
      const segments = [];
      let currentSegment = [];
      allPoints.forEach((point) => {
        if (point.value == null) {
          if (currentSegment.length) segments.push(currentSegment);
          currentSegment = [];
        } else currentSegment.push(point);
      });
      if (currentSegment.length) segments.push(currentSegment);
      const paths = segments.map((segment) => {
        const line = segment.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
        const area = segment.length > 1 ? `<path class="overview-chart-fill" d="${line} L ${segment.at(-1).x.toFixed(1)} ${bottom} L ${segment[0].x.toFixed(1)} ${bottom} Z"></path>` : "";
        return `${area}<path class="overview-chart-line" d="${line}"></path>`;
      }).join("");
      const pointsMarkup = points.map((point) => {
        const accessibleLabel = `${chartDateLabel(point.row.day, true)} · ${definition.label}: ${numberFormat.format(point.value)}`;
        return `<g class="overview-chart-point" style="--series-color:${definition.color}"><circle class="overview-chart-hit" data-chart-index="${point.index}" data-chart-series="${definition.key}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="9" tabindex="0" role="button" aria-pressed="false" aria-label="${escapeHtml(accessibleLabel)}"></circle><circle class="overview-chart-dot" data-chart-dot-index="${point.index}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.3" aria-hidden="true"></circle></g>`;
      }).join("");
      return `<g class="overview-chart-series-line" style="--series-color:${definition.color}">${paths}${pointsMarkup}</g>`;
    }).join("");

    chart.__adminV2Rows = rows;
    chart.dataset.rowCount = String(rows.length);
    const sourceBadge = document.getElementById("overview-chart-source");
    if (sourceBadge) {
      sourceBadge.textContent = isDemo ? "ДЕМО" : rows.length ? "ДАННЫЕ" : "НЕТ ДАННЫХ";
      sourceBadge.classList.toggle("is-live", !isDemo && rows.length > 0);
    }
    chart.setAttribute("aria-label", isDemo
      ? `Демонстрационный график за ${rows.length} месяцев. Точки можно выбрать мышью или клавиатурой.`
      : `Использование приложения по ${rows.length} доступным датам.`);
    const coverage = payload.coverage || {};
    const from = coverage.from || rows[0]?.day;
    const to = coverage.to || rows.at(-1)?.day;
    const rangeText = from && to ? `${chartDateLabel(from, true)} — ${chartDateLabel(to, true)}` : "";
    note.textContent = isDemo
      ? "Демо-данные · реальные появятся после входа в аналитику."
      : !rows.length
        ? "Нет доступных данных для графика."
      : payload.rangeDays > 0
      ? `Период: ${payload.rangeDays} дней · ${rows.length} точек.`
      : coverage.complete === true
        ? `Полная история · ${rangeText}.`
        : `Доступные даты: ${rangeText}. Полнота истории не подтверждена.`;
    chart.__adminV2Rows = rows;
    chart.dataset.rowCount = String(rows.length);
    readout.innerHTML = `<strong>—</strong><span>${isDemo || rows.length ? "Выберите точку графика" : "Нет данных"}</span>`;
  }

  function selectOverviewPoint(point) {
    const chart = point.closest("svg");
    const index = point.dataset.chartIndex;
    if (!chart || index == null) return;
    const points = [...chart.querySelectorAll("[data-chart-index]")];
    points.forEach((item) => {
      const selected = item.dataset.chartIndex === index;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    chart.querySelectorAll("[data-chart-dot-index]").forEach((dot) => dot.classList.toggle("is-selected", dot.dataset.chartDotIndex === index));
    const pointPosition = point.getAttribute("cx");
    let guide = chart.querySelector(".overview-chart-selection-guide");
    if (!guide) {
      guide = document.createElementNS("http://www.w3.org/2000/svg", "line");
      guide.setAttribute("class", "overview-chart-selection-guide");
      guide.setAttribute("y1", "19");
      guide.setAttribute("y2", "212");
      chart.insertBefore(guide, chart.querySelector(".overview-chart-series"));
    }
    guide.setAttribute("x1", pointPosition);
    guide.setAttribute("x2", pointPosition);
    const readout = document.getElementById("overview-chart-readout");
    const row = chart.__adminV2Rows?.[Number(index)];
    if (!row || !readout) return;
    const active = row.active_installs == null || !Number.isFinite(Number(row.active_installs)) ? "—" : numberFormat.format(Math.max(0, Number(row.active_installs)));
    const fresh = row.new_installs == null || !Number.isFinite(Number(row.new_installs)) ? "—" : numberFormat.format(Math.max(0, Number(row.new_installs)));
    readout.innerHTML = `<strong>${escapeHtml(chartDateLabel(row.day, true))}</strong><span><em style="--series-color:#8ab99a">Активные · ${active}</em><em style="--series-color:#d8bd78">Новые · ${fresh}</em></span>`;
  }

  document.addEventListener("click", (event) => {
    const point = event.target.closest?.("#overview-chart [data-chart-index]");
    if (point) selectOverviewPoint(point);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const point = event.target.closest?.("#overview-chart [data-chart-index]");
    if (!point) return;
    event.preventDefault();
    selectOverviewPoint(point);
  });

  function finishDraftSave(saved, sourceFrame, requestId = "") {
    if (!draftSaveResolve) return;
    if (sourceFrame !== draftSaveTarget) return;
    if (sourceFrame === workbenchFrame && String(requestId || "") !== draftSaveRequestId) return;
    window.clearTimeout(draftSaveTimer);
    const resolve = draftSaveResolve;
    draftSaveResolve = null;
    draftSaveTarget = null;
    draftSaveRequestId = "";
    resolve(saved);
  }

  function setDirty(value, detail = "") {
    if (!value) {
      state.dirtyFrames.clear();
      state.dirtyFrame = null;
    }
    state.dirty = Boolean(value) || state.dirtyFrames.size > 0;
    const label = document.querySelector(".save-state span");
    if (label) label.textContent = state.dirty ? (detail || "Есть несохранённые правки") : "Только тестовый режим";
    document.querySelector(".save-state")?.classList.toggle("has-changes", state.dirty);
  }

  function setActiveNav(view, legacySection = "") {
    document.querySelectorAll("[data-view], [data-legacy-tab]").forEach((button) => {
      const active = button.dataset.view === view || (view === "legacy" && button.dataset.legacyTab === legacySection);
      button.classList.toggle("is-active", active);
      if (button.matches("[role='tab']")) button.setAttribute("aria-selected", String(active));
    });
  }

  function showPanel(view) {
    state.view = view;
    if (view !== "content") document.body.classList.remove("mobile-arabic-keyboard-open");
    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    title.textContent = viewTitles[view] || viewTitles.legacy;
    document.body.dataset.view = view;
    setActiveNav(view, state.legacySection);
  }

  function navigateToLegacy(section) {
    state.legacySection = section;
    showPanel("legacy");
    setActiveNav("legacy", section);
    const send = () => legacyFrame.contentWindow?.postMessage({ type: "admin-v2:navigate", section }, window.location.origin);
    if (legacyFrame.contentDocument?.readyState === "complete") send();
    else legacyFrame.addEventListener("load", send, { once: true });
  }

  function navigate(view) {
    if (view === "overview" || view === "content" || view === "locale") {
      showPanel(view);
      if (view === "content") workbenchFrame.contentWindow?.postMessage({ type: "admin-v2:design", design: state.density }, window.location.origin);
      return;
    }
    navigateToLegacy(view);
  }

  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-view], [data-legacy-tab]");
    if (nav) {
      event.preventDefault();
      if (nav.dataset.view) navigate(nav.dataset.view);
      else navigateToLegacy(nav.dataset.legacyTab);
      return;
    }
    const quick = event.target.closest("[data-quick-view]");
    if (quick) navigate(quick.dataset.quickView);
  });

  function markWorkbenchDirty(frame = null) {
    if (frame) {
      state.dirtyFrame = frame;
      state.dirtyFrames.add(frame);
    }
    setDirty(true, "Черновик хранится на этом устройстве");
  }

  function bindDirtyTracking(frame, includeNested = false) {
    const bindDocument = (doc) => {
      if (!doc || doc.documentElement.dataset.adminV2DirtyBound === "true") return;
      doc.documentElement.dataset.adminV2DirtyBound = "true";
      const onEdit = (event) => {
        if (event.target?.matches?.("input, textarea, select, [contenteditable='true']")) markWorkbenchDirty(frame);
      };
      doc.addEventListener("input", onEdit, true);
      doc.addEventListener("change", onEdit, true);
      if (includeNested) doc.querySelectorAll("iframe").forEach((nested) => {
        nested.addEventListener("load", () => { try { bindDocument(nested.contentDocument); } catch { /* cross-origin frame */ } });
        try { if (nested.contentDocument?.readyState === "complete") bindDocument(nested.contentDocument); } catch { /* cross-origin frame */ }
      });
    };
    frame.addEventListener("load", () => { try { bindDocument(frame.contentDocument); } catch { /* cross-origin frame */ } });
    try { if (frame.contentDocument?.readyState === "complete") bindDocument(frame.contentDocument); } catch { /* cross-origin frame */ }
  }

  bindDirtyTracking(workbenchFrame, true);
  bindDirtyTracking(legacyFrame);
  bindDirtyTracking(localeFrame);

  const requestOverviewAnalytics = () => legacyFrame.contentWindow?.postMessage({ type: "admin-v2:load-overview-analytics" }, window.location.origin);
  legacyFrame.addEventListener("load", requestOverviewAnalytics);
  if (legacyFrame.contentDocument?.readyState === "complete") requestOverviewAnalytics();

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
    const sourceFrame = [workbenchFrame, legacyFrame, localeFrame].find((frame) => frame.contentWindow === event.source) || null;
    if (event.data.type === "admin-v2:keyboard-mode") {
      if (sourceFrame !== workbenchFrame) return;
      const active = state.view === "content"
        && event.data.open === true
        && event.data.mobile === true
        && window.matchMedia("(max-width: 720px)").matches;
      document.body.classList.toggle("mobile-arabic-keyboard-open", active);
    }
    if (event.data.type === "admin-v2:analytics-series" && sourceFrame === legacyFrame) {
      renderOverviewAnalytics(event.data);
    }
    if (event.data.type === "admin-v2:dirty") markWorkbenchDirty(sourceFrame);
    if (event.data.type === "admin-v2:saved" && sourceFrame) {
      state.dirtyFrames.delete(sourceFrame);
      state.dirtyFrame = [...state.dirtyFrames].at(-1) || null;
      setDirty(state.dirtyFrames.size > 0, "Остались несохранённые правки в другом разделе");
      try {
        const drafts = JSON.parse(localStorage.getItem(DRAFT_ACTIVITY_KEY) || "{}");
        drafts.lastSavedAt = new Date().toISOString();
        drafts.source = sourceFrame === workbenchFrame ? "content" : sourceFrame === localeFrame ? "locale" : "legacy";
        localStorage.setItem(DRAFT_ACTIVITY_KEY, JSON.stringify(drafts));
      } catch { /* the saved draft remains in its editor when overview activity is unavailable */ }
      finishDraftSave(true, sourceFrame, event.data.requestId);
    }
    if (event.data.type === "admin-v2:write-blocked") {
      event.source?.postMessage({ type: "admin-v2:capture-draft" }, window.location.origin);
      const status = document.querySelector(".save-state span");
      if (status) status.textContent = event.data.message || "Запись отключена в тестовом режиме";
      window.clearTimeout(window.adminV2WriteNoticeTimer);
      window.adminV2WriteNoticeTimer = window.setTimeout(() => {
        setDirty(state.dirty, state.dirty ? "Черновик хранится на этом устройстве" : "Только тестовый режим");
      }, 4500);
    }
  });

  document.getElementById("density-toggle")?.addEventListener("click", () => {
    state.density = state.density === "studio" ? "compact" : "studio";
    html.dataset.design = state.density;
    const button = document.getElementById("density-toggle");
    button.textContent = state.density === "studio" ? "Компактный вид" : "Просторный вид";
    button.setAttribute("aria-label", state.density === "studio" ? "Включить компактный вид" : "Включить просторный вид");
    workbenchFrame.contentWindow?.postMessage({ type: "admin-v2:design", design: state.density }, window.location.origin);
    try { localStorage.setItem("quranapp-admin-v2-design", state.density); } catch { /* private browsing */ }
  });

  function requestFrameDraftSave(target) {
    if (!target?.contentWindow) return Promise.resolve(false);
    return new Promise((resolve) => {
      draftSaveResolve = resolve;
      draftSaveTarget = target;
      draftSaveRequestId = `admin-v2-save-${Date.now()}-${++draftSaveSequence}`;
      const requestId = draftSaveRequestId;
      draftSaveTimer = window.setTimeout(() => finishDraftSave(false, target, requestId), 2000);
      target.contentWindow.postMessage({ type: "admin-v2:save-draft", requestId }, window.location.origin);
    });
  }

  async function requestDraftSave() {
    const targets = state.dirtyFrames.size
      ? [...state.dirtyFrames]
      : [state.dirtyFrame || (state.view === "content" ? workbenchFrame : state.view === "locale" ? localeFrame : legacyFrame)];
    for (const target of targets) {
      if (!await requestFrameDraftSave(target)) return false;
    }
    return true;
  }

  async function goToOldVersion(saveDraft) {
    if (saveDraft) {
      const saved = await requestDraftSave();
      if (!saved) {
        setDirty(true, "Не удалось подтвердить сохранение. Остались в тестовой админке.");
        return;
      }
    }
    leaveDialog.close();
    window.location.assign(new URL("../admin/", window.location.href).href);
  }

  function askBeforeLeaving() {
    if (!state.dirty) {
      window.location.assign(new URL("../admin/", window.location.href).href);
      return;
    }
    leaveDialog.showModal();
  }

  document.getElementById("old-version-button")?.addEventListener("click", askBeforeLeaving);
  document.getElementById("mobile-old-version")?.addEventListener("click", askBeforeLeaving);
  document.getElementById("leave-stay")?.addEventListener("click", () => leaveDialog.close());
  document.getElementById("leave-discard")?.addEventListener("click", () => goToOldVersion(false));
  document.getElementById("leave-save")?.addEventListener("click", () => goToOldVersion(true));

  function updateOverviewActivity() {
    const target = document.getElementById("draft-activity");
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_ACTIVITY_KEY) || "{}");
      if (!draft.lastSavedAt) return;
      const stamp = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(draft.lastSavedAt));
      target.innerHTML = `<span class="empty-glyph">✓</span><span><strong>Черновик сохранён локально</strong><small>${stamp} · источник: ${draft.source === "content" ? "редактор материалов" : "инструменты админки"}</small></span>`;
    } catch { /* sample UI remains available */ }
  }

  async function loadCatalogCounts() {
    const readJson = async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Не удалось прочитать ${path}`);
      return response.json();
    };
    try {
      const [support, general, azkar, tajweed] = await Promise.all([
        readJson("./data/support-dua.json"),
        readJson("./data/general-dua.json"),
        readJson("./data/azkar-classic-preview.json"),
        readJson("./data/azkar-tajweed-translit.json"),
      ]);
      const duaCount = (Array.isArray(support) ? support.length : 0) + (Array.isArray(general) ? general.length : 0);
      const azkarCount = Array.isArray(azkar) ? azkar.length : 0;
      const docs = Array.isArray(tajweed?.docs) ? tajweed.docs.length : 0;
      document.getElementById("dua-total").textContent = duaCount.toLocaleString("ru-RU");
      document.getElementById("azkar-total").textContent = azkarCount.toLocaleString("ru-RU");
      document.getElementById("tajweed-total").textContent = docs.toLocaleString("ru-RU");
      document.getElementById("sidebar-content-count").textContent = (duaCount + azkarCount).toLocaleString("ru-RU");
    } catch {
      for (const id of ["dua-total", "azkar-total", "tajweed-total", "sidebar-content-count"]) document.getElementById(id).textContent = "—";
    }
  }

  const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date());
  document.getElementById("today-date").textContent = dateLabel;
  renderOverviewAnalytics();
  try {
    const savedDensity = localStorage.getItem("quranapp-admin-v2-design");
    if (savedDensity === "compact") document.getElementById("density-toggle").click();
  } catch { /* private browsing */ }
  updateOverviewActivity();
  loadCatalogCounts();
})();
