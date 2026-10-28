import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadParser() {
  const source = await readFile(new URL('./store-csv.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminV2StoreCsv;
}

test('RuStore CSV converts month buckets to dated local rows', async () => {
  const parser = await loadParser();
  const result = parser.parseRuStore('Период;Всего\n05.2026;1 234\n06.2026;21');
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [
    { day: '2026-05-31', downloads: 1234, updates: 0 },
    { day: '2026-06-30', downloads: 21, updates: 0 },
  ]);
  assert.equal(result.total, 1255);
});

test('Google Play CSV parser aggregates countries but excludes server total rows', async () => {
  const parser = await loadParser();
  const result = parser.parseGooglePlay([
    'Date,Daily User Installs,Daily User Uninstalls,Daily Device Upgrades,Current User Installs,Installs on active devices,Country',
    '2026-06-01,10,2,3,50,45,RU',
    '2026-06-01,4,1,1,20,18,KZ',
    '2026-06-01,999,99,99,999,999,Total',
  ].join('\n'));
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [{
    day: '2026-06-01', downloads: 14, updates: 4, uninstalls: 3,
    currentUserInstalls: 70, activeDeviceInstalls: 63,
  }]);
});

test('Google Play always uses user installs even when device installs are first or differently ordered', async () => {
  const parser = await loadParser();
  const deviceFirst = parser.parseGooglePlay([
    'Date,Daily Device Installs,Daily User Installs,Country',
    '2026-06-01,90,30,RU',
  ].join('\n'));
  const userFirst = parser.parseGooglePlay([
    'Date,Daily User Installs,Country,Daily Device Installs',
    '2026-06-01,30,RU,90',
  ].join('\n'));
  assert.equal(deviceFirst.ok, true);
  assert.equal(userFirst.ok, true);
  assert.equal(deviceFirst.total, 30);
  assert.equal(userFirst.total, 30);
});

test('Google Play rejects device-only installation CSVs instead of mixing metrics', async () => {
  const parser = await loadParser();
  const result = parser.parseGooglePlay('Date,Daily Device Installs,Country\n2026-06-01,90,RU');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Daily User Installs/i);
});

test('local imports replace matching dates without deleting earlier imported days', async () => {
  const parser = await loadParser();
  const result = parser.mergeRows(
    [{ day: '2026-05-31', downloads: 3, source: 'remote' }, { day: '2026-06-30', downloads: 4 }],
    [{ day: '2026-05-31', downloads: 8, source: 'local-csv' }],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { day: '2026-05-31', downloads: 8, source: 'local-csv' },
    { day: '2026-06-30', downloads: 4 },
  ]);
});

test('local CSV snapshot merges into the remote view while marking its own coverage', async () => {
  const parser = await loadParser();
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };
  parser.saveImport(storage, 'local-store', 'googleplay', [
    { day: '2026-06-01', downloads: 12 },
    { day: '2026-06-02', downloads: 15 },
  ], '2026-06-03T10:00:00.000Z');
  const local = parser.readSnapshot(storage, 'local-store');
  const merged = parser.mergeSnapshot({ googleplay: { rows: [
    { day: '2026-05-31', downloads: 8 },
    { day: '2026-06-01', downloads: 5 },
  ] } }, local);
  assert.deepEqual(JSON.parse(JSON.stringify(merged.googleplay.rows)), [
    { day: '2026-05-31', downloads: 8 },
    { day: '2026-06-01', downloads: 12 },
    { day: '2026-06-02', downloads: 15 },
  ]);
  assert.equal(merged.googleplay.total, 35);
  assert.equal(merged.googleplay.days, 3);
  assert.equal(merged.googleplay.localCsvRows, 2);
  assert.equal(merged.googleplay.localCsvLastDay, '2026-06-02');
});

test('local CSV imports do not turn a partial remote history into complete all-time coverage', async () => {
  const parser = await loadParser();
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };
  parser.saveImport(storage, 'local-store', 'rustore', [{ day: '2026-06-30', downloads: 8 }]);
  const merged = parser.mergeSnapshot({
    coverage: { complete: false, expectedRows: 1001, loadedRows: 1000, message: 'Часть истории' },
    rustore: { rows: [{ day: '2026-06-29', downloads: 5 }] },
  }, parser.readSnapshot(storage, 'local-store'));

  assert.equal(merged.coverage.complete, false);
  assert.equal(merged.coverage.expectedRows, 1001);
  assert.equal(merged.rustore.total, 13);
});

test('local CSV save reports browser storage quota errors instead of claiming success', async () => {
  const parser = await loadParser();
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.throws(
    () => parser.saveImport(storage, 'local-store', 'rustore', [{ day: '2026-06-30', downloads: 5 }]),
    /сохранить CSV в этом браузере/i,
  );
});
