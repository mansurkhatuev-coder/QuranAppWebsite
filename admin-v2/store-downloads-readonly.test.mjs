import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadAdapter() {
  const source = await readFile(new URL('./store-downloads-readonly.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window }, { filename: 'store-downloads-readonly.js' });
  return window.AdminV2StoreDownloadsReadOnly;
}

test('read-only store snapshot maps database rows and metadata to the analytics view model', async () => {
  const adapter = await loadAdapter();
  const snapshot = adapter.createSnapshot([
    { store: 'rustore', day: '2026-10-01', downloads: 7, updates: 2, uninstalls: 1 },
    { store: 'googleplay', day: '2026-10-02', downloads: 9, updates: 3, uninstalls: 2, current_user_installs: 40, active_device_installs: 35 },
  ], [
    { key: 'rustore', payload: { status: 'ok', message: 'CSV загружен' } },
    { key: 'googleplay', payload: { status: 'ok', fetchedAt: '2026-10-03T00:00:00Z' } },
  ]);

  assert.equal(snapshot.rustore.total, 7);
  assert.equal(snapshot.rustore.days, 1);
  assert.equal(snapshot.rustore.message, 'CSV загружен');
  assert.equal(snapshot.googleplay.rows[0].currentUserInstalls, 40);
  assert.equal(snapshot.googleplay.currentUserInstalls, 40);
  assert.equal(snapshot.apple.rows.length, 0);
});

test('read-only store loader performs authenticated table reads without calling a mutating endpoint', async () => {
  const adapter = await loadAdapter();
  const tables = [];
  const client = {
    from(table) {
      tables.push(table);
      const query = {
        select() { return query; },
        order() { return query; },
        range() {
          return Promise.resolve({ data: [], count: 0, error: null });
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
      };
      return query;
    },
  };

  const result = await adapter.load(client);

  assert.deepEqual(tables.sort(), ['store_download_days', 'store_download_meta']);
  assert.equal(result.ok, true);
});

test('read-only store loader pages through the exact row count before declaring coverage complete', async () => {
  const adapter = await loadAdapter();
  const allRows = Array.from({ length: 2105 }, (_, index) => ({
    store: index % 2 ? 'appstore' : 'rustore',
    day: `2026-${String(Math.floor(index / 31) + 1).padStart(2, '0')}-${String((index % 31) + 1).padStart(2, '0')}`,
    downloads: 1,
  }));
  const ranges = [];
  const client = {
    from(table) {
      const query = {
        select(_columns, options) { if (table === 'store_download_days') assert.equal(options.count, 'exact'); return query; },
        order() { return query; },
        range(start, end) {
          ranges.push([table, start, end]);
          const data = table === 'store_download_days' ? allRows.slice(start, end + 1) : [];
          return Promise.resolve({ data, count: table === 'store_download_days' ? allRows.length : null, error: null });
        },
        limit() { return Promise.resolve({ data: [], error: null }); },
      };
      return query;
    },
  };

  const snapshot = await adapter.load(client);

  assert.deepEqual(ranges.filter(([table]) => table === 'store_download_days').map(([, start]) => start), [0, 1000, 2000]);
  assert.equal(snapshot.coverage.complete, true);
  assert.equal(snapshot.coverage.expectedRows, 2105);
  assert.equal(snapshot.coverage.loadedRows, 2105);
});

test('read-only store loader reports partial coverage when the server returns fewer rows than its exact count', async () => {
  const adapter = await loadAdapter();
  const ranges = [];
  const client = {
    from(table) {
      const query = {
        select() { return query; },
        order() { return query; },
        range(start) {
          ranges.push(start);
          return Promise.resolve({
            data: table === 'store_download_days' && start === 0 ? [{ store: 'rustore', day: '2026-01-01', downloads: 4 }] : [],
            count: table === 'store_download_days' ? 3 : null,
            error: null,
          });
        },
        limit() { return Promise.resolve({ data: [], error: null }); },
      };
      return query;
    },
  };

  const snapshot = await adapter.load(client);

  assert.equal(snapshot.coverage.complete, false);
  assert.equal(snapshot.coverage.expectedRows, 3);
  assert.equal(snapshot.coverage.loadedRows, 1);
  assert.equal(snapshot.coverage.message, 'Загружена часть истории статистики магазинов.');
});

test('read-only store loader never claims complete coverage when PostgREST omits the exact count', async () => {
  const adapter = await loadAdapter();
  const client = {
    from(table) {
      const query = {
        select() { return query; },
        order() { return query; },
        range() { return Promise.resolve({ data: table === 'store_download_days' ? [{ store: 'rustore', day: '2026-01-01', downloads: 4 }] : [], count: null, error: null }); },
        limit() { return Promise.resolve({ data: [], error: null }); },
      };
      return query;
    },
  };

  const snapshot = await adapter.load(client);

  assert.equal(snapshot.coverage.complete, false);
  assert.equal(snapshot.coverage.expectedRows, null);
  assert.equal(snapshot.coverage.loadedRows, 1);
});
