import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadAnalyticsHelpers() {
  const source = await readFile(new URL('./admin-analytics.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminAnalytics;
}

test('event fallback is marked as a sample and never becomes an all-time or period total', async () => {
  const analytics = await loadAnalyticsHelpers();
  const result = analytics.resolveFallbackMetrics({
    rows: [
      { event: 'app_open', installation_id: 'one' },
      { event: 'azkar_item_completed', installation_id: 'one' },
    ],
    eventSampleLimit: 5000,
  });

  assert.equal(result.source, 'recent_event_sample');
  assert.equal(result.sampleCount, 2);
  assert.equal(result.active, null);
  assert.equal(result.newInstalls, null);
  assert.equal(result.allTime, null);
  assert.equal(result.events, 2);
  assert.equal(result.azkar, 1);
  assert.equal(result.azkarUsers, null);
});

test('exact installation counts preserve zero and stay separate from event-sample counts', async () => {
  const analytics = await loadAnalyticsHelpers();
  const result = analytics.resolveFallbackMetrics({
    rows: [{ event: 'app_open', installation_id: 'one' }],
    installationCounts: { active: 0, newInstalls: 0, allTime: 12 },
    eventSampleLimit: 5000,
  });

  assert.equal(result.active, 0);
  assert.equal(result.newInstalls, 0);
  assert.equal(result.allTime, 12);
  assert.equal(result.events, 1);
  assert.equal(result.source, 'recent_event_sample');
});

test('unavailable analytics values render as an em dash rather than zero', async () => {
  const analytics = await loadAnalyticsHelpers();
  assert.equal(analytics.formatMetricValue(null), '—');
  assert.equal(analytics.formatMetricValue(undefined), '—');
  assert.equal(analytics.formatMetricValue(0), '0');
  assert.equal(analytics.formatMetricValue(12), '12');
});
