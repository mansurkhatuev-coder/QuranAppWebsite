(() => {
  "use strict";

  function resolveRows({ series = [], demoRows = [], allowDemo = false } = {}) {
    const rows = Array.isArray(series)
      ? series.filter((row) => row?.day).sort((a, b) => String(a.day).localeCompare(String(b.day)))
      : [];
    if (rows.length) return { rows, isDemo: false };
    const demo = Array.isArray(demoRows) ? demoRows : [];
    return allowDemo && demo.length ? { rows: demo, isDemo: true } : { rows: [], isDemo: false };
  }

  window.AdminV2OverviewChartData = Object.freeze({ resolveRows });
})();
