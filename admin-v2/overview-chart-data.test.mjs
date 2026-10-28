import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadResolver() {
  const source = await readFile(new URL('./overview-chart-data.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminV2OverviewChartData;
}

test('production with no series never receives demo data', async () => {
  const resolver = await loadResolver();
  const result = resolver.resolveRows({ series: [], demoRows: [{ day: '2026-01' }], allowDemo: false });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { rows: [], isDemo: false });
});

test('local preview may show clearly identified demo data', async () => {
  const resolver = await loadResolver();
  const demoRows = [{ day: '2026-01' }];
  const result = resolver.resolveRows({ series: [], demoRows, allowDemo: true });
  assert.equal(result.isDemo, true);
  assert.equal(result.rows, demoRows);
});

test('real series wins even when local demo mode is enabled', async () => {
  const resolver = await loadResolver();
  const series = [{ day: '2026-02', new_installs: 4 }];
  const result = resolver.resolveRows({ series, demoRows: [{ day: '2026-01' }], allowDemo: true });
  assert.equal(result.isDemo, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), series);
});
