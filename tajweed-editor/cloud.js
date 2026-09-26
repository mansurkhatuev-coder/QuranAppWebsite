/**
 * Cloud draft + publish for tajweed editor (Supabase + publish-content).
 * Depends on window.AdminSupabase from ../admin/admin-supabase.js
 */
(function initTajweedCloud(global) {
  const SITE_ORIGIN = global.location?.origin || 'https://waydean.ru';
  const SITE_PACK_URL = `${SITE_ORIGIN}/data/azkar-tajweed-translit.json`;
  const SITE_MANIFEST_URL = `${SITE_ORIGIN}/data/remote-azkar-tajweed.manifest.json`;
  let control = { manifest: null, publicManifest: null, phase: 'loading', message: 'Проверяем состояние', busy: false };
  const listeners = new Set();
  let latestManifest = null;
  let deploymentCheck = 0;

  function updateControl(patch) {
    control = { ...control, ...patch };
    for (const listener of listeners) listener({ ...control });
  }

  async function runExclusive(operation) {
    if (control.busy) throw new Error('Дождитесь завершения текущей операции');
    updateControl({ busy: true });
    try { return await operation(); }
    finally { updateControl({ busy: false }); }
  }

  async function bounded(operation) {
    let timer;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Время ожидания истекло')), 15000); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  function validManifest(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && value.url === undefined) {
      value = { ...value, url: '/data/azkar-tajweed-translit.json' };
    }
    if (!value || Array.isArray(value) || !Number.isSafeInteger(value.version) || value.version < 1 ||
      (value.enabled !== undefined && typeof value.enabled !== 'boolean') ||
      (value.docCount !== undefined && (!Number.isSafeInteger(value.docCount) || value.docCount < 0)) ||
      typeof value.url !== 'string' || !value.url || (value.publishedAt !== undefined && typeof value.publishedAt !== 'string')) {
      throw new Error('Некорректный манифест: состояние неизвестно');
    }
    const url = new URL(value.url, SITE_MANIFEST_URL);
    if (url.origin !== new URL(SITE_MANIFEST_URL).origin || url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('Некорректный адрес пакета');
    }
    return { ...value, enabled: value.enabled === true };
  }

  async function readControlSnapshot() {
    const result = await bounded(() => global.AdminSupabase.publishContent({ azkarTajweedControl: { action: 'read' } }));
    const manifest = validManifest(result.azkarTajweedManifest);
    assertCurrentManifest(manifest);
    return { manifest, packDigest: result.azkarTajweedPackDigest };
  }

  async function readControl() { return (await readControlSnapshot()).manifest; }

  async function fetchJson(url) {
    const abort = new AbortController();
    try {
      return await bounded(async () => {
        const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
          cache: 'no-store', signal: abort.signal,
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) throw new Error(`Не удалось прочитать сайт (${response.status})`);
        return response.json();
      });
    } finally { abort.abort(); }
  }

  function matchesManifest(a, b) {
    return a.version === b.version && a.enabled === b.enabled && a.url === b.url &&
      a.publishedAt === b.publishedAt && a.docCount === b.docCount;
  }

  function assertCurrentManifest(manifest) {
    if (latestManifest && (manifest.version < latestManifest.version ||
      (manifest.version === latestManifest.version && !matchesManifest(manifest, latestManifest)))) {
      throw new Error('Получена устаревшая или противоречивая версия; обновите состояние');
    }
  }

  async function checkDeployment(manifest, prefix = '') {
    manifest = validManifest(manifest);
    assertCurrentManifest(manifest);
    latestManifest = manifest;
    const check = ++deploymentCheck;
    let publicManifest = null;
    try { publicManifest = validManifest(await fetchJson(SITE_MANIFEST_URL)); }
    catch { /* A saved repository change is still pending when the site cannot be read. */ }
    if (check !== deploymentCheck) return false;
    const published = publicManifest && matchesManifest(manifest, publicManifest);
    updateControl({ manifest, publicManifest, phase: published ? 'published' : 'pending',
      message: prefix + (published ? `Сайт подтвердил: ${manifest.enabled ? 'включено' : 'выключено'} · версия ${manifest.version}` :
        `Сохранено: ${manifest.enabled ? 'включено' : 'выключено'} · версия ${manifest.version}. Ожидается обновление сайта`) });
    return Boolean(published);
  }

  async function refreshControl(interactive = false) {
    return runExclusive(async () => {
      updateControl({ phase: 'loading', message: 'Проверяем состояние' });
      try {
        if (interactive) await ensureSession();
        else if (!global.AdminSupabase?.isEnabled?.() || !await global.AdminSupabase.getSession()) {
          updateControl({ manifest: null, publicManifest: null, phase: 'auth', message: 'Войдите с ролью редактора таджвида, чтобы проверить состояние' });
          return;
        }
        await checkDeployment(await readControl());
      } catch (error) {
        updateControl({ manifest: null, publicManifest: null, phase: 'error', message: `Состояние неизвестно. ${error.message}` });
      }
    });
  }

  async function reconcileWrite(error) {
    const prefix = `Результат операции не подтверждён (${error.message}). Повторная проверка: `;
    try { await checkDeployment(await readControl(), prefix); }
    catch (readError) {
      updateControl({ manifest: null, publicManifest: null, phase: 'error', message: `${prefix}состояние неизвестно. ${readError.message}` });
    }
  }

  async function setAvailability(enabled) {
    return runExclusive(async () => {
      if (!control.manifest || typeof enabled !== 'boolean') throw new Error('Сначала проверьте состояние');
      const expectedVersion = control.manifest.version;
      updateControl({ phase: 'saving', message: 'Сохраняем состояние…' });
      try {
        await ensureSession();
        const result = await bounded(() => global.AdminSupabase.publishContent({ azkarTajweedControl: { action: 'set', enabled, expectedVersion } }));
        await checkDeployment(validManifest(result.azkarTajweedManifest), result.mirrorWarning ? `${result.mirrorWarning}. ` : '');
      } catch (error) { await reconcileWrite(error); }
    });
  }

  async function preparePublication() {
    await ensureSession();
    // Read the authoritative version BEFORE public data. The server's CAS protects the later write.
    const { manifest, packDigest } = await readControlSnapshot();
    const before = validManifest(await fetchJson(SITE_MANIFEST_URL));
    if (!matchesManifest(manifest, before)) throw new Error('Сайт ещё не обновлён до версии репозитория. Повторите после обновления сайта');
    const pack = await fetchJson(new URL(manifest.url, SITE_MANIFEST_URL).href);
    if (typeof packDigest !== 'string' || !/^[a-f0-9]{64}$/.test(packDigest)) {
      throw new Error('Не удалось проверить пакет репозитория. Публикация заблокирована');
    }
    const digestBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(pack)));
    const publicDigest = Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (publicDigest !== packDigest) throw new Error('Пакет на сайте ещё не совпадает с репозиторием. Дождитесь обновления сайта');
    const after = validManifest(await fetchJson(SITE_MANIFEST_URL));
    if (!matchesManifest(manifest, after) || !Array.isArray(pack?.docs) ||
      (manifest.docCount !== undefined && pack.docs.length !== manifest.docCount)) {
      throw new Error('Пакет на сайте изменился или повреждён. Повторите подготовку публикации');
    }
    return { expectedVersion: manifest.version, pack };
  }

  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('ok', Boolean(ok));
  }

  async function ensureSession() {
    if (!global.AdminSupabase?.isEnabled?.()) {
      throw new Error('Supabase не настроен');
    }
    let session = await global.AdminSupabase.getSession().catch(() => null);
    if (session) return session;

    const email = window.prompt('Email Supabase (admin):');
    if (!email) throw new Error('Вход отменён');
    const password = window.prompt('Пароль:');
    if (!password) throw new Error('Вход отменён');
    session = await global.AdminSupabase.signIn(email.trim(), password);
    return session;
  }

  async function loadDraftLibrary() {
    await ensureSession();
    const row = await global.AdminSupabase.loadAzkarTajweedDraft();
    if (!row?.payload) return null;
    return {
      library: row.payload,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  async function saveDraftLibrary(library) {
    await ensureSession();
    return global.AdminSupabase.saveAzkarTajweedDraft(library);
  }

  async function publishLibrary(library, expectedVersion) {
    await ensureSession();
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('Сначала подготовьте публикацию с актуальной версией');
    const docs = Array.isArray(library?.docs) ? library.docs : [];
    const version = typeof library?.version === 'number' ? library.version : 2;
    const publishedAt = new Date().toISOString();
    const azkarTajweed = {
      version,
      publishedAt,
      docs,
    };
    return bounded(() => global.AdminSupabase.publishContent({
      azkarTajweed,
      azkarTajweedExpectedVersion: expectedVersion,
    }));
  }

  async function fetchLivePack() {
    return fetchJson(SITE_PACK_URL);
  }

  function sortMarks(marks) {
    return (Array.isArray(marks) ? marks : [])
      .map((m) => ({
        start: Number(m.start) || 0,
        end: Number(m.end) || 0,
        rules: Array.isArray(m.rules) ? [...m.rules].sort() : [],
        accent: Boolean(m.accent),
        hidden: Boolean(m.hidden),
        note: String(m.note || ''),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end || a.rules.join().localeCompare(b.rules.join()));
  }

  function comparableDoc(doc) {
    if (!doc || typeof doc !== 'object') return '';
    return JSON.stringify({
      title: String(doc.title || ''),
      azkarIds: Array.isArray(doc.azkarIds) ? [...doc.azkarIds].map(String).sort() : [],
      arabic: String(doc.arabic || ''),
      transliteration: String(doc.transliteration || ''),
      marks: sortMarks(doc.marks),
    });
  }

  function describeDocChanges(live, draft) {
    if (!live) return ['Новый документ'];
    const changed = [];
    if (String(live.title || '') !== String(draft?.title || '')) changed.push('Название');
    if (String(live.arabic || '') !== String(draft?.arabic || '')) changed.push('Арабский текст');
    const liveIds = Array.isArray(live.azkarIds) ? [...live.azkarIds].map(String).sort() : [];
    const draftIds = Array.isArray(draft?.azkarIds) ? [...draft.azkarIds].map(String).sort() : [];
    if (JSON.stringify(liveIds) !== JSON.stringify(draftIds)) changed.push('Связи с азкарами');
    if (String(live.transliteration || '') !== String(draft?.transliteration || '')) {
      changed.push('Транслитерация');
    }
    if (JSON.stringify(sortMarks(live.marks)) !== JSON.stringify(sortMarks(draft?.marks))) {
      changed.push('Метки таджвида');
    }
    return changed;
  }

  function estimatePublishedDocCount(liveCount, selectedCandidates) {
    return Math.max(0, Number(liveCount) || 0) +
      (Array.isArray(selectedCandidates) ? selectedCandidates.filter((candidate) => candidate?.kind === 'new').length : 0);
  }

  /**
   * Draft docs that are new or differ from live (title/arabic/translit/marks/azkarIds).
   * @returns {{ id: string, title: string, kind: 'new'|'changed', marks: number, hasTranslit: boolean, defaultChecked: boolean }[]}
   */
  function listPublishCandidates(draftDocs, liveDocs) {
    const liveById = new Map(
      (Array.isArray(liveDocs) ? liveDocs : [])
        .filter((d) => d && d.id)
        .map((d) => [String(d.id), d])
    );
    const out = [];
    for (const draft of Array.isArray(draftDocs) ? draftDocs : []) {
      if (!draft || !draft.id) continue;
      const id = String(draft.id);
      const live = liveById.get(id);
      if (live && comparableDoc(draft) === comparableDoc(live)) continue;
      const hasTranslit = Boolean(String(draft.transliteration || '').trim());
      const marks = Array.isArray(draft.marks) ? draft.marks.length : 0;
      out.push({
        id,
        title: String(draft.title || id),
        kind: live ? 'changed' : 'new',
        marks,
        hasTranslit,
        defaultChecked: marks > 0 && hasTranslit,
      });
    }
    out.sort((a, b) => {
      if (a.defaultChecked !== b.defaultChecked) return a.defaultChecked ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === 'new' ? -1 : 1;
      return a.title.localeCompare(b.title, 'ru');
    });
    return out;
  }

  /**
   * Upsert selected draft docs into a copy of live docs. Never deletes live entries.
   */
  function mergeSelectedDocs(liveDocs, draftDocs, selectedIds) {
    const live = Array.isArray(liveDocs) ? liveDocs.slice() : [];
    const draftById = new Map(
      (Array.isArray(draftDocs) ? draftDocs : [])
        .filter((d) => d && d.id)
        .map((d) => [String(d.id), d])
    );
    const selected = new Set((selectedIds || []).map(String));
    const byId = new Map(live.filter((d) => d && d.id).map((d) => [String(d.id), d]));

    for (const id of selected) {
      const draft = draftById.get(id);
      if (draft) byId.set(id, draft);
    }

    const merged = [];
    const seen = new Set();
    for (const d of live) {
      if (!d || !d.id) continue;
      const id = String(d.id);
      merged.push(byId.get(id) || d);
      seen.add(id);
    }
    for (const id of selected) {
      if (seen.has(id)) continue;
      const draft = byId.get(id);
      if (draft) {
        merged.push(draft);
        seen.add(id);
      }
    }
    return merged;
  }

  global.TajweedCloud = {
    getControlState: () => ({ ...control }),
    subscribeControl: (listener) => { listeners.add(listener); listener({ ...control }); return () => listeners.delete(listener); },
    runExclusive,
    refreshControl,
    setAvailability,
    preparePublication,
    checkDeployment,
    reconcileWrite,
    setStatus,
    ensureSession,
    loadDraftLibrary,
    saveDraftLibrary,
    publishLibrary,
    fetchLivePack,
    listPublishCandidates,
    mergeSelectedDocs,
    describeDocChanges,
    estimatePublishedDocCount,
    comparableDoc,
  };
})(window);
