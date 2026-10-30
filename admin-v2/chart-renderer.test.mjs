import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("./", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const analytics = readFileSync(new URL("admin-analytics-v2.js", root), "utf8");

function loadRenderer() {
  const file = new URL("chart-renderer.js", root);
  assert.ok(existsSync(file), "shared Chart.js renderer should be present");
  const charts = [];
  class FakeChart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.destroyed = false;
      charts.push(this);
    }
    destroy() { this.destroyed = true; }
  }
  const window = { Chart: FakeChart };
  vm.runInNewContext(readFileSync(file, "utf8"), { window, Intl, Date, Math, Number, Map, WeakMap });
  return { renderer: window.AdminV2Charts, charts };
}

test("the local Chart.js bundle and shared renderer load before Admin V2 consumers", () => {
  const vendorIndex = html.indexOf("./vendor/chart.umd.min.js");
  const rendererIndex = html.indexOf("./chart-renderer.js");
  const analyticsIndex = html.indexOf("./admin-analytics-v2.js");
  assert.ok(vendorIndex >= 0, "Chart.js should be served from this site, not a remote CDN");
  assert.ok(rendererIndex > vendorIndex);
  assert.ok(analyticsIndex > rendererIndex);
  assert.match(html, /<canvas[^>]+id="overview-chart"/);
  assert.doesNotMatch(html, /<svg[^>]+id="overview-chart"/);
  assert.match(analytics, /renderAnalyticsCharts\(/);
});

test("overview chart keeps every date, uses responsive grouped bars, and opens the selected day", () => {
  const { renderer, charts } = loadRenderer();
  const canvas = {};
  const rows = [
    { day: "2026-10-01", active_installs: 420, new_installs: 8 },
    { day: "2026-10-02", active_installs: 447, new_installs: 34 },
  ];
  let selected = null;
  renderer.renderOverviewChart(canvas, rows, (row) => { selected = row; });

  const config = charts[0].config;
  assert.equal(config.type, "bar");
  assert.equal(config.data.labels.length, rows.length);
  assert.equal(config.data.datasets.length, 2);
  assert.equal(config.options.responsive, true);
  assert.equal(config.options.maintainAspectRatio, false);
  assert.equal(config.options.scales.x.ticks.autoSkip, true);
  config.options.onClick({}, [{ index: 1 }]);
  assert.equal(selected, rows[1]);
});

test("analytics line charts preserve missing days and skip crowded date labels", () => {
  const { renderer, charts } = loadRenderer();
  const canvas = {};
  const rows = Array.from({ length: 27 }, (_, index) => ({
    day: `2026-10-${String(index + 1).padStart(2, "0")}`,
    installs: index === 12 ? null : index * 3,
  }));
  let selected = null;
  renderer.renderSeriesChart(canvas, rows, "installs", { label: "Новые установки", onSelect: (row) => { selected = row; } });

  const config = charts[0].config;
  assert.equal(config.type, "line");
  assert.equal(config.data.labels.length, 27);
  assert.equal(config.data.datasets[0].data[12], null);
  assert.equal(config.options.scales.x.ticks.autoSkip, true);
  assert.ok(config.options.scales.x.ticks.maxTicksLimit <= 7);
  assert.equal(config.options.interaction.intersect, false);
  config.options.onClick({}, [{ index: 11 }]);
  assert.equal(selected, rows[11]);
});

test("replacing a chart destroys its prior canvas instance", () => {
  const { renderer, charts } = loadRenderer();
  const canvas = {};
  renderer.renderOverviewChart(canvas, [{ day: "2026-10-01", active_installs: 1, new_installs: 0 }]);
  renderer.renderOverviewChart(canvas, [{ day: "2026-10-02", active_installs: 2, new_installs: 1 }]);
  assert.equal(charts[0].destroyed, true);
  assert.equal(charts.length, 2);
});
