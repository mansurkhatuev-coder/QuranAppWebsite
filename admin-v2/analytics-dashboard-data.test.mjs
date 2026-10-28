import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadResolver() {
  const source = await readFile(new URL('./analytics-dashboard-data.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminV2AnalyticsDashboardData;
}

test('read-only range changes reload daily series when no dashboard RPC is allowed', async () => {
  const resolver = await loadResolver();
  let dashboardCalls = 0;
  let seriesCalls = 0;
  const result = await resolver.loadForRange({
    readOnly: true,
    loadDashboard: async () => { dashboardCalls += 1; return null; },
    loadReadOnlySeries: async () => { seriesCalls += 1; return { series: [{ day: '2026-10-01', new_installs: 4 }] }; },
  });
  assert.equal(dashboardCalls, 1);
  assert.equal(seriesCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { series: [{ day: '2026-10-01', new_installs: 4 }] });
});

test('server dashboard is used without reading the fallback series', async () => {
  const resolver = await loadResolver();
  let seriesCalls = 0;
  const dashboard = { period: { new_installs: 5 } };
  const result = await resolver.loadForRange({
    readOnly: false,
    loadDashboard: async () => dashboard,
    loadReadOnlySeries: async () => { seriesCalls += 1; return null; },
  });
  assert.equal(result, dashboard);
  assert.equal(seriesCalls, 0);
});

test('unavailable history remains unavailable instead of becoming zero', async () => {
  const resolver = await loadResolver();
  const result = await resolver.loadForRange({
    readOnly: true,
    loadDashboard: async () => null,
    loadReadOnlySeries: async () => null,
  });
  assert.equal(result, null);
});

test('series metrics use available new installs and preserve zero only when rows exist', async () => {
  const resolver = await loadResolver();
  assert.equal(resolver.sumSeriesMetric([{ new_installs: 7 }, { new_installs: 3 }], 'new_installs'), 10);
  assert.equal(resolver.sumSeriesMetric([{ new_installs: 0 }], 'new_installs'), 0);
  assert.equal(resolver.sumSeriesMetric([], 'new_installs'), null);
  assert.equal(resolver.sumSeriesMetric([{ day: '2026-10-01' }], 'new_installs'), null);
  assert.equal(resolver.averageSeriesMetric([{ active_installs: 20 }, { active_installs: 30 }], 'active_installs'), 25);
});

test('activity cards use daily aggregates instead of totals from a truncated event sample', async () => {
  const resolver = await loadResolver();
  const activity = resolver.resolveActivityMetrics({
    rows: [{ event: 'azkar_item_completed', installation_id: 'sampled-install' }],
    series: [
      { day: '2026-01', events_total: 9000, app_open: 3200, azkar: 800, lessons: 70 },
      { day: '2026-02', events_total: 6000, app_open: 2200, azkar: 500, lessons: 40 },
    ],
    eventsWindowLimited: true,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activity)), {
    events: 15000,
    azkar: 1300,
    lessons: 110,
    appOpen: 5400,
    tasbih: null,
    azkarUsers: null,
    lessonUsers: null,
    source: 'available_dates',
  });
});

test('activity cards with a truncated sample and no server totals remain unavailable', async () => {
  const resolver = await loadResolver();
  const activity = resolver.resolveActivityMetrics({
    rows: [{ event: 'azkar_item_completed', installation_id: 'sampled-install' }],
    series: [],
    eventsWindowLimited: true,
  });

  assert.equal(activity.events, null);
  assert.equal(activity.azkar, null);
  assert.equal(activity.lessons, null);
  assert.equal(activity.azkarUsers, null);
  assert.equal(activity.source, 'incomplete_sample');
});

test('event rows remain a sample even when the server response is below the requested cap', async () => {
  const resolver = await loadResolver();
  const activity = resolver.resolveActivityMetrics({
    rows: [{ event: 'azkar_item_completed', installation_id: 'sampled-install' }],
    series: [],
    eventsAreSample: true,
    eventsWindowLimited: false,
  });
  assert.equal(activity.events, null);
  assert.equal(activity.azkar, null);
  assert.equal(activity.azkarUsers, null);
  assert.equal(activity.source, 'incomplete_sample');
});

test('installation totals use exact counts and never infer totals from the limited rows list', async () => {
  const resolver = await loadResolver();
  const result = resolver.resolveInstallationCounts({
    rows: [{ installation_id: 'only-one-visible-row' }],
    total: 120,
    active: 0,
    newInstalls: 0,
    truncated: true,
  });
  assert.equal(result.allTime, 120);
  assert.equal(result.active, 0);
  assert.equal(result.newInstalls, 0);
  assert.equal(result.truncated, true);
});

test('missing exact installation count stays unknown even if the bounded list has rows', async () => {
  const resolver = await loadResolver();
  const result = resolver.resolveInstallationCounts({
    rows: [{ installation_id: 'row-a' }, { installation_id: 'row-b' }],
    total: null,
    active: 0,
    newInstalls: 0,
    truncated: null,
    limit: 20000,
  });
  assert.equal(result.allTime, null);
  assert.equal(result.active, 0);
  assert.equal(result.newInstalls, 0);
  assert.equal(result.truncated, null);
  assert.equal(result.limit, 20000);
});

test('activity cards can use event rows when the server says the sample is complete', async () => {
  const resolver = await loadResolver();
  const activity = resolver.resolveActivityMetrics({
    rows: [
      { event: 'azkar_item_completed', installation_id: 'install-a' },
      { event: 'academy_lesson_completed', installation_id: 'install-a' },
      { event: 'app_open', installation_id: 'install-b' },
      { event: 'tasbih_milestone', installation_id: 'install-b' },
    ],
    series: [],
    eventsWindowLimited: false,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(activity)), {
    events: 4,
    azkar: 1,
    lessons: 1,
    appOpen: 1,
    tasbih: 1,
    azkarUsers: 1,
    lessonUsers: 1,
    source: 'event_rows',
  });
});
