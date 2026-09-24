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
    setStatus,
    ensureSession,
    loadDraftLibrary,
    saveDraftLibrary,
    publishLibrary,
    fetchLivePack,
    listPublishCandidates,
    mergeSelectedDocs,
    comparableDoc,
  };
})(window);
