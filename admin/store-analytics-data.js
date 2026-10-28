(() => {
  "use strict";

  const SOURCES = ["rustore", "apple", "googleplay"];

  function resolveStoreMetrics(snapshot, days, sumRows) {
    const complete = Boolean(snapshot) && snapshot.coverage?.complete !== false;
    const sourceMetrics = Object.fromEntries(SOURCES.map((key) => {
      const rows = Array.isArray(snapshot?.[key]?.rows) ? snapshot[key].rows : [];
      if (!complete || rows.length === 0 || typeof sumRows !== "function") {
        return [key, { total: null, delta: null }];
      }
      return [key, { total: sumRows(rows, 0), delta: sumRows(rows, days) }];
    }));
    const values = SOURCES.map((key) => sourceMetrics[key]);
    const hasEveryTotal = values.every(({ total }) => total != null);
    const hasEveryDelta = values.every(({ delta }) => delta != null);
    return {
      ...sourceMetrics,
      combinedTotal: hasEveryTotal ? values.reduce((sum, item) => sum + Number(item.total), 0) : null,
      combinedDelta: hasEveryDelta ? values.reduce((sum, item) => sum + Number(item.delta), 0) : null,
    };
  }

  window.AdminStoreAnalyticsData = Object.freeze({ resolveStoreMetrics });
})();
