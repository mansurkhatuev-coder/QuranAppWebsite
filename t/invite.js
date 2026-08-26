(function initInvite() {
  const FALLBACK_PUBLISH =
    'https://rivjkiksknnesahrvamf.supabase.co/functions/v1/publish-drewo';
  const config = window.SUPABASE_CONFIG || {};
  const publishUrl = config.publishDrewoUrl || FALLBACK_PUBLISH;
  const anonKey = config.anonKey || '';

  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const errorEl = document.getElementById('error');
  const formEl = document.getElementById('manual-form');
  const inputEl = document.getElementById('code-input');
  const hintEl = document.getElementById('hint');

  function normalizeCode(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/^\/+|\/+$/g, '');
  }

  function codeFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeCode(params.get('c') || params.get('code') || '');
    if (fromQuery) return fromQuery;

    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] === 't' && parts[1] && parts[1] !== 'index.html') {
      return normalizeCode(parts[1]);
    }
    return '';
  }

  function showError(message) {
    if (titleEl) titleEl.textContent = 'Приглашение';
    if (subtitleEl) subtitleEl.textContent = 'Проверьте код или попросите новую ссылку.';
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message || 'Нет такого древа';
    }
    if (formEl) formEl.hidden = false;
    if (hintEl) hintEl.hidden = false;
  }

  function showLoading(code) {
    if (titleEl) titleEl.textContent = 'Открываем древо';
    if (subtitleEl) subtitleEl.textContent = code ? `Код «${code}»…` : 'Секунду…';
    if (errorEl) errorEl.hidden = true;
  }

  async function resolveFromRegistry(code) {
    const response = await fetch('/trees/registry.json?v=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Нет такого древа');
    const registry = await response.json();
    const trees = Array.isArray(registry?.trees) ? registry.trees : [];
    const hit = trees.find((item) => String(item.code || '').toLowerCase() === code);
    if (!hit || !hit.treeDir) throw new Error('Нет такого древа');
    return {
      ok: true,
      code,
      title: hit.title || hit.treeDir,
      treeDir: hit.treeDir,
      path: `/${hit.treeDir}/`,
    };
  }

  async function resolveFromApi(code) {
    if (!anonKey) throw new Error('no-api');
    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action: 'resolve-invite', code }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
      throw new Error(json.error || 'Нет такого древа');
    }
    return json;
  }

  async function resolveCode(code) {
    try {
      return await resolveFromApi(code);
    } catch (error) {
      if (error instanceof Error && error.message === 'Нет такого древа') throw error;
      return resolveFromRegistry(code);
    }
  }

  async function openByCode(code) {
    const normalized = normalizeCode(code);
    if (!/^[a-z][a-z0-9-]{1,24}$/.test(normalized)) {
      showError('Нет такого древа');
      if (inputEl) inputEl.value = normalized;
      return;
    }

    showLoading(normalized);
    try {
      const data = await resolveCode(normalized);
      if (titleEl && data.title) titleEl.textContent = data.title;
      if (subtitleEl) subtitleEl.textContent = 'Переходим к входу…';
      const target = String(data.path || '').trim() || `/${data.treeDir}/`;
      const url = new URL(target, window.location.origin);
      try {
        localStorage.setItem(
          'nek:lastTree',
          JSON.stringify({
            path: url.pathname,
            title: String(data.title || ''),
            code: normalized,
            at: Date.now(),
          })
        );
      } catch (err) {
        /* private mode */
      }
      window.location.replace(url.pathname + url.search);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Нет такого древа');
      if (inputEl) inputEl.value = normalized;
    }
  }

  formEl?.addEventListener('submit', (event) => {
    event.preventDefault();
    void openByCode(inputEl?.value || '');
  });

  const initial = codeFromLocation();
  if (initial) {
    void openByCode(initial);
  } else {
    if (errorEl) errorEl.hidden = true;
    if (titleEl) titleEl.textContent = 'Приглашение';
    if (subtitleEl) subtitleEl.textContent = 'Введите код из сообщения родственника.';
    if (formEl) formEl.hidden = false;
    if (hintEl) hintEl.hidden = false;
  }
})();
