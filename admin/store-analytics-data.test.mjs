import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadAnalyticsData() {
  const source = await readFile(new URL('./store-analytics-data.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminStoreAnalyticsData;
}

const sumRows = (rows, withinDays) => {
  const cutoff = withinDays ? Date.now() - withinDays * 24 * 60 * 60 * 1000 : 0;
  const matchingRows = withinDays
    ? rows.filter((row) => Date.parse(`${row.day}T00:00:00.000Z`) >= cutoff)
    : rows;
  if (withinDays && !matchingRows.length) return null;
  return matchingRows.reduce((sum, row) => sum + Number(row.downloads || 0), 0);
};

test('missing store snapshot is unknown, not zero', async () => {
  const data = await loadAnalyticsData();
  const result = data.resolveStoreMetrics(null, 7, sumRows);
  assert.equal(result.rustore.total, null);
  assert.equal(result.apple.total, null);
  assert.equal(result.googleplay.total, null);
  assert.equal(result.combinedTotal, null);
});

test('empty store source is unknown and cannot create a misleading combined total', async () => {
  const data = await loadAnalyticsData();
  const result = data.resolveStoreMetrics({
    coverage: { complete: true },
    rustore: { rows: [{ day: '2026-10-01', downloads: 12 }] },
    apple: { rows: [] },
    googleplay: { rows: [{ day: '2026-10-01', downloads: 7 }] },
  }, 7, sumRows);
  assert.equal(result.rustore.total, 12);
  assert.equal(result.apple.total, null);
  assert.equal(result.googleplay.total, 7);
  assert.equal(result.combinedTotal, null);
});

test('complete nonempty reports produce separate totals and a combined sum', async () => {
  const data = await loadAnalyticsData();
  const result = data.resolveStoreMetrics({
    coverage: { complete: true },
    rustore: { rows: [{ day: '2026-10-28', downloads: 12 }] },
    apple: { rows: [{ day: '2026-10-28', downloads: 20 }] },
    googleplay: { rows: [{ day: '2026-10-28', downloads: 7 }] },
  }, 7, sumRows);
  assert.equal(result.combinedTotal, 39);
  assert.equal(result.combinedDelta, 39);
});

test('known all-time totals stay visible when the selected period has no report rows', async () => {
  const data = await loadAnalyticsData();
  const result = data.resolveStoreMetrics({
    coverage: { complete: true },
    rustore: { rows: [{ day: '2025-01-01', downloads: 12 }] },
    apple: { rows: [{ day: '2025-01-01', downloads: 20 }] },
    googleplay: { rows: [{ day: '2025-01-01', downloads: 7 }] },
  }, 7, sumRows);
  assert.equal(result.combinedTotal, 39);
  assert.equal(result.combinedDelta, null);
});

test('partial store history does not expose totals', async () => {
  const data = await loadAnalyticsData();
  const result = data.resolveStoreMetrics({
    coverage: { complete: false },
    rustore: { rows: [{ day: '2026-10-01', downloads: 12 }] },
    apple: { rows: [{ day: '2026-10-01', downloads: 20 }] },
    googleplay: { rows: [{ day: '2026-10-01', downloads: 7 }] },
  }, 7, sumRows);
  assert.equal(result.rustore.total, null);
  assert.equal(result.combinedTotal, null);
});
