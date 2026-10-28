(() => {
  "use strict";

  async function loadForRange({ readOnly, loadDashboard, loadReadOnlySeries }) {
    const dashboard = await loadDashboard();
    if (dashboard || !readOnly) return dashboard || null;
    return await loadReadOnlySeries() || null;
  }

  function valuesForSeriesMetric(series, field) {
    if (!Array.isArray(series) || !series.length) return null;
    const values = series
      .filter((row) => row?.[field] != null && Number.isFinite(Number(row[field])))
      .map((row) => Number(row[field]));
    return values.length ? values : null;
  }

  function sumSeriesMetric(series, field) {
    const values = valuesForSeriesMetric(series, field);
    return values ? values.reduce((sum, value) => sum + value, 0) : null;
  }

  function averageSeriesMetric(series, field) {
    const values = valuesForSeriesMetric(series, field);
    return values ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }

  function resolveActivityMetrics({ rows = [], series = [], eventsWindowLimited = false, eventsAreSample = false } = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeSeries = Array.isArray(series) ? series : [];
    const limited = eventsWindowLimited === true || eventsAreSample === true;
    const rowCount = (event) => safeRows.filter((row) => !event || row?.event === event).length;
    const seriesCount = (field) => sumSeriesMetric(safeSeries, field);
    const count = (field, event) => {
      const aggregated = seriesCount(field);
      if (aggregated != null) return aggregated;
      return limited ? null : rowCount(event);
    };
    const users = (event) => {
      if (limited) return null;
      return new Set(safeRows
        .filter((row) => row?.event === event && row.installation_id)
        .map((row) => row.installation_id)).size;
    };
    const usesSeries = ["events_total", "azkar", "lessons", "app_open"]
      .some((field) => seriesCount(field) != null);

    return {
      events: count("events_total", null),
      azkar: count("azkar", "azkar_item_completed"),
      lessons: count("lessons", "academy_lesson_completed"),
      appOpen: count("app_open", "app_open"),
      tasbih: limited ? null : rowCount("tasbih_milestone"),
      azkarUsers: users("azkar_item_completed"),
      lessonUsers: users("academy_lesson_completed"),
      source: usesSeries ? "available_dates" : limited ? "incomplete_sample" : "event_rows",
    };
  }

  function resolveInstallationCounts(payload) {
    const exact = (value) => {
      if (value == null || value === "") return null;
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 0 ? number : null;
    };
    if (Array.isArray(payload)) {
      return { rows: payload, allTime: null, active: null, newInstalls: null, truncated: null, limit: null };
    }
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const total = exact(payload?.total);
    return {
      rows,
      allTime: total,
      active: exact(payload?.active),
      newInstalls: exact(payload?.newInstalls),
      truncated: payload?.truncated === true || (total == null ? null : total > rows.length),
      limit: exact(payload?.limit),
    };
  }

  window.AdminV2AnalyticsDashboardData = Object.freeze({
    loadForRange,
    sumSeriesMetric,
    averageSeriesMetric,
    resolveActivityMetrics,
    resolveInstallationCounts,
  });
})();
