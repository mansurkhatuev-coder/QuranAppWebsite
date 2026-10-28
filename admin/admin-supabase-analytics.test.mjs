import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadSupabaseApi({ omitHeadCount = false, omitFeedbackCount = false, feedbackCount = 250 } = {}) {
  const calls = [];
  const client = {
    async rpc() { return { data: null, error: { message: 'function does not exist' } }; },
    from(table) {
      const state = { table, filters: [], selected: null, options: null };
      const resultFor = () => {
        if (state.table === 'academy_course_feedback') {
          return {
            data: [{ id: 'feedback-1', course_id: 'tajweed', rating: 5 }],
            count: omitFeedbackCount ? undefined : feedbackCount,
            error: null,
          };
        }
        if (state.options?.head) {
          const filter = state.filters[0]?.field;
          const count = omitHeadCount ? undefined : filter === 'last_seen_at' ? 5 : filter === 'first_seen_at' ? 2 : 120;
          return { data: null, count, error: null };
        }
        return { data: [{ installation_id: 'row-from-limited-list' }], count: 120, error: null };
      };
      const query = {
        select(columns, options) { state.selected = columns; state.options = options; return this; },
        order() { return this; },
        limit(value) { state.limit = value; return this; },
        gte(field, value) { state.filters.push({ field, value }); return this; },
        eq(field, value) { state.filters.push({ field, value }); return this; },
        then(resolve, reject) {
          calls.push({ ...state, filters: [...state.filters] });
          return Promise.resolve(resultFor()).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const window = {
    SUPABASE_CONFIG: { url: 'https://example.supabase.co', anonKey: 'public-test-key' },
    supabase: { createClient: () => client },
    URL,
    fetch,
    console,
  };
  const source = await readFile(new URL('./admin-supabase.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window, URL, fetch, console, AbortController, setTimeout, clearTimeout });
  return { api: window.AdminSupabase, calls };
}

test('installation list uses a bounded page and exact active/new/all-time counts', async () => {
  const { api, calls } = await loadSupabaseApi();
  const result = await api.loadAnalyticsInstallations(30);
  assert.equal(result.total, 120);
  assert.equal(result.active, 5);
  assert.equal(result.newInstalls, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.rows.length, 1);
  const counts = calls.filter((call) => call.options?.head);
  assert.equal(counts.length, 3);
  assert.deepEqual(counts.map((call) => call.filters[0]?.field).sort(), ['first_seen_at', 'last_seen_at', undefined].sort());
  assert.ok(calls.some((call) => call.limit === 20000));
});

test('all-time installation count does not substitute a capped event sample', async () => {
  const { api } = await loadSupabaseApi();
  const result = await api.loadAnalyticsAllTimeInstallCount();
  assert.equal(result, 120);
});

test('missing exact PostgREST count stays unknown instead of using the list length', async () => {
  const { api } = await loadSupabaseApi({ omitHeadCount: true });
  const result = await api.loadAnalyticsInstallations(0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.total, null);
  assert.equal(result.truncated, null);
  assert.equal(await api.loadAnalyticsAllTimeInstallCount(), null);
});

test('Academy feedback returns an exact course count separately from its bounded display rows', async () => {
  const { api, calls } = await loadSupabaseApi();
  const result = await api.loadAcademyCourseFeedback('tajweed');

  assert.equal(result.rows.length, 1);
  assert.equal(result.total, 250);
  assert.equal(result.limit, 200);
  assert.equal(result.courseId, 'tajweed');
  const query = calls.find((call) => call.table === 'academy_course_feedback');
  assert.equal(query.options.count, 'exact');
  assert.equal(query.limit, 200);
  assert.deepEqual(query.filters, [{ field: 'course_id', value: 'tajweed' }]);
});

test('Academy feedback keeps the total unknown when PostgREST omits its exact count', async () => {
  const { api } = await loadSupabaseApi({ omitFeedbackCount: true });
  const result = await api.loadAcademyCourseFeedback();

  assert.equal(result.rows.length, 1);
  assert.equal(result.total, null);
});
