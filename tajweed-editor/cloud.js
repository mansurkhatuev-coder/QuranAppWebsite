/**
 * Cloud draft + publish for tajweed editor (Supabase + publish-content).
 * Depends on window.AdminSupabase from ../admin/admin-supabase.js
 */
(function initTajweedCloud(global) {
  const SITE_PACK_URL = 'https://waydean.ru/data/azkar-tajweed-translit.json';
  let lastManifestVersion = 0;

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

  async function publishLibrary(library) {
    await ensureSession();
    const docs = Array.isArray(library?.docs) ? library.docs : [];
    const version = typeof library?.version === 'number' ? library.version : 2;
    const publishedAt = new Date().toISOString();
    const manifestVersion = Math.max(Date.now(), lastManifestVersion + 1);
    lastManifestVersion = manifestVersion;
    const azkarTajweed = {
      version,
      publishedAt,
      docs,
    };
    const azkarTajweedManifest = {
      version: manifestVersion,
      publishedAt,
      url: '/data/azkar-tajweed-translit.json',
      docCount: docs.length,
    };
    return global.AdminSupabase.publishContent({
      azkarTajweed,
      azkarTajweedManifest,
    });
  }

  async function fetchLivePack() {
    const response = await fetch(`${SITE_PACK_URL}?_=${Date.now()}`, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`Не удалось скачать прод-пак (${response.status})`);
    return response.json();
  }

  global.TajweedCloud = {
    setStatus,
    ensureSession,
    loadDraftLibrary,
    saveDraftLibrary,
    publishLibrary,
    fetchLivePack,
  };
})(window);
