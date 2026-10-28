import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createLegacyDraftAdapter, LEGACY_DRAFT_STORAGE_KEY } = require('./legacy-local-drafts.js');

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

function makeCatalogApi() {
  const calls = { reads: 0, writes: 0, publishes: 0, external: 0 };
  const api = {
    async loadCatalog() {
      calls.reads += 1;
      return {
        support: [
          { id: 'support-1', category: 'support_dua', title: 'До правки', text: 'Текст', source: { book: 'A' } },
          { id: 'support-2', category: 'support_dua', title: 'Удаляемое', text: 'Текст' },
        ],
        general: [{ id: 'general-1', category: 'general_dua', title: 'Общее', text: 'Текст' }],
        announcements: [
          { id: 'banner-1', titleRu: 'Старый баннер', priority: 1 },
          { id: 'banner-2', titleRu: 'Удаляемый баннер', priority: 0 },
        ],
        release: { android: { latestVersion: '1.0' }, ios: {} },
        dailyAyahPool: ['ayah-old'],
        dailyDuaPool: ['dua-old'],
      };
    },
  };
  for (const name of [
    'upsertDuaItem', 'deleteDuaItem', 'upsertHomeAnnouncement', 'deleteHomeAnnouncement',
    'saveHomeDailyPools', 'saveRelease', 'publishContent', 'refreshAppleDownloads',
    'refreshGooglePlayDownloads', 'uploadRustoreCsv', 'uploadGooglePlayCsv', 'syncAppRelease',
  ]) {
    api[name] = async () => {
      if (name === 'publishContent') calls.publishes += 1;
      else if (/^(refresh|upload|sync)/.test(name)) calls.external += 1;
      else calls.writes += 1;
    };
  }
  return { api, calls };
}

test('overlays persisted local edits and deletes on the read-only catalog after reload', async () => {
  const storage = new MemoryStorage();
  const { api, calls } = makeCatalogApi();
  const first = createLegacyDraftAdapter({ api, storage });
  await first.upsertDuaItem({
    id: 'support-1', category: 'support_dua', title: 'Исправлено', text: 'Новый текст',
    source: { book: 'A', page: 4 }, customField: { keep: true },
  });
  await first.upsertDuaItem({ id: 'support-3', category: 'support_dua', title: 'Новое', text: 'Новый материал' });
  await first.deleteDuaItem('support-2');
  await first.upsertHomeAnnouncement({ id: 'banner-1', titleRu: 'Локальный баннер', priority: 3 });
  await first.deleteHomeAnnouncement('banner-2');
  await first.saveHomeDailyPools(['ayah-local'], ['dua-local']);
  await first.saveRelease({ android: { latestVersion: '2.0', versionCode: 2 }, ios: {} });

  const catalog = await createLegacyDraftAdapter({ api, storage }).loadCatalog();
  assert.deepEqual(catalog.support.map((item) => item.id), ['support-1', 'support-3']);
  assert.equal(catalog.support[0].title, 'Исправлено');
  assert.deepEqual(catalog.support[0].source, { book: 'A', page: 4 });
  assert.deepEqual(catalog.support[0].customField, { keep: true });
  assert.deepEqual(catalog.announcements.map((item) => item.id), ['banner-1']);
  assert.equal(catalog.announcements[0].titleRu, 'Локальный баннер');
  assert.deepEqual(catalog.dailyAyahPool, ['ayah-local']);
  assert.deepEqual(catalog.dailyDuaPool, ['dua-local']);
  assert.equal(catalog.release.android.latestVersion, '2.0');
  assert.equal(calls.reads, 1);
  assert.equal(calls.writes, 0);
});

test('local draft export and import round-trip structured edits and form snapshots', async () => {
  const { api } = makeCatalogApi();
  const source = createLegacyDraftAdapter({ api, storage: new MemoryStorage() });
  await source.upsertHomeAnnouncement({ id: 'banner-new', titleRu: 'Экспортируемый баннер' });
  await source.saveFormSnapshot({ values: [{ id: 'daily-ayah-pool', value: 'Локальный текст' }] });
  const exported = JSON.parse(JSON.stringify(source.exportSnapshot()));
  assert.equal(exported.format, 'quranapp-admin-v2-legacy-drafts');

  const target = createLegacyDraftAdapter({ api, storage: new MemoryStorage() });
  await target.importSnapshot(exported);
  const catalog = await target.loadCatalog();
  assert.equal(catalog.announcements.at(-1).titleRu, 'Экспортируемый баннер');
  assert.deepEqual(target.loadFormSnapshot(), { values: [{ id: 'daily-ayah-pool', value: 'Локальный текст' }] });
  assert.equal(target.storageKey, LEGACY_DRAFT_STORAGE_KEY);
});

test('publish action returns a local preview result without calling the production publisher', async () => {
  const { api, calls } = makeCatalogApi();
  const adapter = createLegacyDraftAdapter({ api, storage: new MemoryStorage() });
  const result = await adapter.publishContent({ supportDua: [{ id: 'draft' }] });
  assert.equal(result.localPreview, true);
  assert.match(result.message, /локальн/i);
  assert.equal(Object.hasOwn(result, 'publishedAt'), false);
  assert.equal(calls.publishes, 0);
  assert.deepEqual(adapter.exportSnapshot().draft.lastPreviewPayload, { supportDua: [{ id: 'draft' }] });
});

test('store refresh and other external actions fail with a local-preview explanation', async () => {
  const { api, calls } = makeCatalogApi();
  const adapter = createLegacyDraftAdapter({ api, storage: new MemoryStorage() });
  for (const action of [
    () => adapter.refreshAppleDownloads(),
    () => adapter.refreshGooglePlayDownloads(),
    () => adapter.uploadRustoreCsv('csv'),
    () => adapter.uploadGooglePlayCsv('csv'),
    () => adapter.syncAppRelease(),
  ]) await assert.rejects(action, /тестов.*предпросмотр|локальн.*черновик/i);
  assert.equal(calls.external, 0);
});

test('local draft save failure is surfaced when browser storage is full', async () => {
  const { api } = makeCatalogApi();
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const adapter = createLegacyDraftAdapter({ api, storage });
  await assert.rejects(() => adapter.upsertDuaItem({ id: 'x', category: 'support_dua' }), /локальн.*черновик/i);
});

test('giveaway settings are saved locally while entry status changes are rejected', async () => {
  const storage = new MemoryStorage();
  let remoteReads = 0;
  let remoteWrites = 0;
  const client = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => {
          remoteReads += 1;
          return { data: { campaign_id: 'tajweed_final_v1', active: false }, error: null };
        },
        upsert: async () => { remoteWrites += 1; return { error: null }; },
        update() { return this; },
      };
    },
  };
  const messages = [];
  const window = {
    location: { origin: 'https://preview.example' },
    parent: { postMessage: (message) => messages.push(message) },
    supabase: { createClient() {} },
  };
  const adapter = createLegacyDraftAdapter({ api: { getClient: () => client }, storage, window });
  adapter.install({ window });

  const initial = await window.supabase.from('academy_giveaway_settings').select('active').eq('campaign_id', 'tajweed_final_v1').maybeSingle();
  assert.equal(initial.data.active, false);
  const saved = await window.supabase.from('academy_giveaway_settings').upsert({ campaign_id: 'tajweed_final_v1', active: true, prize_text: 'Книга' });
  assert.equal(saved.error, null);
  const reloaded = await window.supabase.from('academy_giveaway_settings').select('active').eq('campaign_id', 'tajweed_final_v1').maybeSingle();
  assert.equal(reloaded.data.active, true);
  assert.equal(remoteReads, 1);
  assert.equal(remoteWrites, 0);

  const blocked = await window.supabase.from('academy_final_exam_entries').update({ status: 'winner' }).eq('id', 'entry-1');
  assert.match(blocked.error.message, /предпросмотр/i);
  assert.equal(remoteWrites, 0);
  assert.equal(messages.some((message) => message.type === 'admin-v2:write-blocked'), true);
  assert.equal(adapter.getSnapshot().giveawaySettings.active, true);
});

test('legacy publish button creates a local backup without invoking production publish', async () => {
  const { api, calls } = makeCatalogApi();
  const listeners = [];
  const status = { hidden: true, textContent: '' };
  const downloads = [];
  const document = {
    addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
    getElementById: (id) => id === 'publish-status' ? status : null,
    querySelectorAll: () => [],
    createElement: () => ({ click() { downloads.push(this.download); } }),
  };
  const adapter = createLegacyDraftAdapter({ api, storage: new MemoryStorage(), document });
  adapter.install({ document });
  const click = listeners.find((entry) => entry.type === 'click').handler;
  let prevented = false;
  let stopped = false;
  click({
    target: { closest: (selector) => selector.includes('#publish-site') ? {} : null },
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { stopped = true; },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(downloads.length, 1);
  assert.match(status.textContent, /резервная копия/i);
  assert.equal(calls.publishes, 0);
  assert.equal(adapter.exportSnapshot().draft.formSnapshot.values.length, 0);
});
