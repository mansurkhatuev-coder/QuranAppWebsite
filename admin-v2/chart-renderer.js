(() => {
  "use strict";

  const instances = new WeakMap();
  const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  const compactNumber = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });

  function dateLabel(value, monthly = false) {
    const text = String(value || "");
    const month = text.match(/^(\d{4})-(\d{2})$/);
    const day = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (month) return new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)).toLocaleDateString("ru-RU", { month: "short", year: "2-digit", timeZone: "UTC" });
    if (day) return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))).toLocaleDateString("ru-RU", monthly ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    return text || "—";
  }

  function destroy(canvas) {
    const instance = canvas && instances.get(canvas);
    if (instance) {
      instance.destroy();
      instances.delete(canvas);
    }
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(8, 11, 14, .98)",
          titleColor: "#fff0c2",
          bodyColor: "#f4f6f7",
          titleFont: { family: "Manrope, sans-serif", size: 17, weight: "700" },
          bodyFont: { family: "Manrope, sans-serif", size: 16, weight: "700" },
          footerFont: { family: "Manrope, sans-serif", size: 14, weight: "600" },
          borderColor: "rgba(231, 199, 119, .72)",
          borderWidth: 1,
          padding: 16,
          cornerRadius: 12,
          boxWidth: 14,
          boxHeight: 14,
          caretPadding: 9,
          titleSpacing: 8,
          displayColors: true,
          callbacks: { label: (context) => `${context.dataset.label}: ${number.format(Number(context.raw) || 0)}` },
        },
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          border: { display: false },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 7,
            maxRotation: 0,
            minRotation: 0,
            color: "#c1c8ca",
            padding: 10,
            font: { family: "Manrope, sans-serif", size: 13, weight: "700" },
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: "rgba(191, 205, 211, .18)", drawTicks: false },
          ticks: {
            color: "#b8c1c4",
            padding: 12,
            maxTicksLimit: 5,
            callback: (value) => compactNumber.format(Number(value) || 0),
            font: { family: "Manrope, sans-serif", size: 13, weight: "700" },
          },
        },
      },
      layout: { padding: { top: 8, right: 10, bottom: 0, left: 4 } },
    };
  }

  function mount(canvas, config) {
    if (!canvas || typeof window.Chart !== "function") return null;
    destroy(canvas);
    const chart = new window.Chart(canvas, config);
    instances.set(canvas, chart);
    return chart;
  }

  function renderOverviewChart(canvas, rows, onSelect) {
    const points = Array.isArray(rows) ? rows : [];
    const options = baseOptions();
    options.scales.x.ticks.maxTicksLimit = 8;
    options.scales.x.ticks.callback = (index) => dateLabel(points[index]?.day, points.some((row) => /^\d{4}-\d{2}$/.test(String(row?.day || ""))));
    options.onClick = (_event, active) => {
      const index = active?.[0]?.index;
      if (Number.isInteger(index) && points[index]) onSelect?.(points[index]);
    };
    options.plugins.tooltip.callbacks.title = (items) => dateLabel(points[items?.[0]?.dataIndex]?.day, points.some((row) => /^\d{4}-\d{2}$/.test(String(row?.day || ""))));
    return mount(canvas, {
      type: "bar",
      data: {
        labels: points.map((row) => row.day),
        datasets: [
          { label: "Активные", data: points.map((row) => row.active_installs ?? row.active ?? 0), backgroundColor: "rgba(213, 185, 119, .92)", hoverBackgroundColor: "#efd28d", borderRadius: 5, borderSkipped: false, categoryPercentage: .76, barPercentage: .82, maxBarThickness: 34 },
          { label: "Новые", data: points.map((row) => row.new_installs ?? row.fresh ?? 0), backgroundColor: "rgba(150, 170, 183, .92)", hoverBackgroundColor: "#c3d4df", borderRadius: 5, borderSkipped: false, categoryPercentage: .76, barPercentage: .82, maxBarThickness: 34 },
        ],
      },
      options,
    });
  }

  function renderSeriesChart(canvas, rows, key, configuration = {}) {
    const points = Array.isArray(rows) ? rows : [];
    const options = baseOptions();
    options.scales.x.ticks.maxTicksLimit = Math.min(7, Math.max(3, points.length));
    options.scales.x.ticks.callback = (index) => dateLabel(points[index]?.day);
    options.plugins.tooltip.callbacks.title = (items) => dateLabel(points[items?.[0]?.dataIndex]?.day);
    options.onClick = (_event, active) => {
      const index = active?.[0]?.index;
      if (Number.isInteger(index) && points[index]) configuration.onSelect?.(points[index], index);
    };
    return mount(canvas, {
      type: "line",
      data: {
        labels: points.map((row) => row.day),
        datasets: [{
          label: configuration.label || key,
          data: points.map((row) => row?.[key] == null || row[key] === "" || !Number.isFinite(Number(row[key])) ? null : Number(row[key])),
          borderColor: configuration.color || "#d5b977",
          backgroundColor: `${configuration.color || "#d5b977"}24`,
          fill: true,
          tension: .32,
          spanGaps: false,
          pointRadius: points.length > 45 ? 0 : 3.5,
          pointHoverRadius: 6,
          pointHitRadius: 10,
          pointBackgroundColor: "#171a1d",
          pointBorderWidth: 2,
          pointBorderColor: configuration.color || "#d5b977",
          borderWidth: 2.5,
        }],
      },
      options,
    });
  }

  window.AdminV2Charts = Object.freeze({ renderOverviewChart, renderSeriesChart, destroy, dateLabel });
})();
