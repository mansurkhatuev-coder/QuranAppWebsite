import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEnvText } from '../src/env.js';
import {
  buildAnalyticsSummary,
  clampLimit,
  formatAnalytics,
  formatFeedback,
  formatFeedbackStats,
  normalizeDays,
  publicError,
} from '../src/format.js';
import { assertReadOnlyKey, readConfig } from '../src/queries.js';

test('normalizeDays defaults to 7 and keeps 0 as all time', () => {
  assert.equal(normalizeDays(undefined), 7);
  assert.equal(normalizeDays(0), 0);
  assert.equal(normalizeDays(14.8), 14);
  assert.equal(normalizeDays(-3), 7);
});

test('clampLimit stays inside 1..50', () => {
  assert.equal(clampLimit(undefined), 20);
  assert.equal(clampLimit(100), 50);
  assert.equal(clampLimit(0), 1);
});

test('analytics summary keeps only the voice fields', () => {
  const text = formatAnalytics({
    days: 0,
    all_time_installs: 420,
    period: {
      active: 12,
      new_installs: 3,
      events: 90,
      azkar: 10,
      lessons: 2,
      app_open: 20,
      tasbih: 1,
      secret_blob: 'x'.repeat(4000),
    },
    series: [{ day: '2026-01-01', note: 'y'.repeat(4000) }],
    platforms: [{ platform: 'android', count: 9 }],
  });

  assert.match(text, /всё время/);
  assert.match(text, /Активные: 12/);
  assert.match(text, /Тасбих: 1/);
  assert.equal(text.includes('secret_blob'), false);
  assert.equal(text.includes('yyyy'), false);
  assert.ok(text.length < 500);
  assert.deepEqual(buildAnalyticsSummary({ period: { active: 1 } }), { active: 1 });
});

test('feedback text truncates comments and hides client ids', () => {
  const text = formatFeedback([
    {
      id: 'row-1',
      rating: 5,
      comment: 'а'.repeat(400),
      course_id: 'tajweed',
      platform: 'android',
      created_at: '2026-09-01T12:00:00+00:00',
      client_id: 'device-secret-id',
      display_name: 'Амина',
      locale: 'ru',
      app_version: '1.0.17',
    },
  ]);
  assert.match(text, /tajweed/);
  assert.match(text, /android/);
  assert.match(text, /Амина/);
  assert.match(text, /…/);
  assert.equal(text.includes('device-secret-id'), false);
  assert.equal(text.includes('1.0.17'), false);
  assert.ok(text.length < 800);
});

test('feedback stats stay short', () => {
  const text = formatFeedbackStats({ count: 4, avg_rating: 4.5, min_rating: 4 });
  assert.match(text, /Отзывов \(оценка от 4\): 4/);
  assert.match(text, /Средняя оценка: 4.5/);
});

test('rpc and permission failures stay short', () => {
  const missing = publicError(
    new Error('Could not find the function public.analytics_dashboard(p_days) in the schema cache'),
    'analytics'
  );
  assert.match(missing, /analytics_dashboard не найдена/);
  assert.ok(missing.length < 180);

  const denied = publicError(new Error('permission denied for table academy_course_feedback'), 'feedback');
  assert.match(denied, /Нет доступа/);

  const huge = publicError(new Error('z'.repeat(2000)), 'analytics');
  assert.ok(huge.length <= 180);
  assert.equal(huge.includes('analytics_events'), false);
});

test('env file does not override Jarvis env', () => {
  const env = { SUPABASE_URL: 'https://from-jarvis.example', SUPABASE_EMAIL: '' };
  applyEnvText(
    `
# comment
SUPABASE_URL=https://from-file.example
SUPABASE_EMAIL="user@example.com"
SUPABASE_PASSWORD='secret'
export SUPABASE_ANON_KEY=anon
`,
    env
  );
  assert.equal(env.SUPABASE_URL, 'https://from-jarvis.example');
  assert.equal(env.SUPABASE_EMAIL, 'user@example.com');
  assert.equal(env.SUPABASE_PASSWORD, 'secret');
  assert.equal(env.SUPABASE_ANON_KEY, 'anon');
});

test('service role keys are rejected and anon keys are accepted', () => {
  const token = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `eyJhbGciOiJIUzI1NiJ9.${body}.sig`;
  };
  assert.throws(() => assertReadOnlyKey(token({ role: 'service_role' })), /service role/);
  assert.throws(() => assertReadOnlyKey('sb_secret_example'), /service role/);
  assert.doesNotThrow(() => assertReadOnlyKey(token({ role: 'anon' })));
  assert.doesNotThrow(() => assertReadOnlyKey('sb_publishable_example'));

  const missing = readConfig({});
  assert.deepEqual(missing.missing, [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_EMAIL',
    'SUPABASE_PASSWORD',
  ]);
});
