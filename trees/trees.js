(function initTreesHub() {
  const EMAIL_KEY = 'waydean_trees_email_v1';
  const PWA_DISMISS_KEY = 'waydean_trees_pwa_dismiss_v1';
  const POLL_MS = 30000;

  const TREES = [
    {
      dir: 'drewo',
      title: 'Хьоти некъ',
      path: '/drewo/',
      accent: 'moss',
    },
    {
      dir: 'drewo-dada-yurt',
      title: 'Дади-Юрт',
      path: '/drewo-dada-yurt/',
      accent: 'amber',
    },
    {
      dir: 'drewo-reklama',
      title: 'Демо (реклама)',
      path: '/drewo-reklama/',
      accent: 'quiet',
    },
  ];

  const config = window.SUPABASE_CONFIG || {};
  let client = null;
  let pollTimer = null;
  let refreshInFlight = false;

  const $ = (sel) => document.querySelector(sel);

  function publishUrl() {
    return (
      config.publishDrewoUrl ||
      'https://rivjkiksknnesahrvamf.supabase.co/functions/v1/publish-drewo'
    );
  }

  function isAuthReady() {
    return Boolean(config.url && config.anonKey && window.supabase?.createClient);
  }

  function getClient() {
    if (!isAuthReady()) return null;
    if (!client) {
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'waydean-trees-auth',
        },
      });
    }
    return client;
  }

  function showBoot(text) {
    const overlay = $('#boot-overlay');
    const label = $('#boot-text');
    if (label && text) label.textContent = text;
    if (overlay) overlay.hidden = false;
  }

  function hideBoot() {
    const overlay = $('#boot-overlay');
    if (overlay) overlay.hidden = true;
  }

  function showLogin() {
    $('#login-screen').hidden = false;
    $('#app-screen').hidden = true;
    stopPolling();
  }

  function showApp() {
    $('#login-screen').hidden = true;
    $('#app-screen').hidden = false;
  }

  function formatNumber(value) {
    if (value == null || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function formatRelative(iso) {
    if (!iso) return 'нет сохранений';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '—';
    const diffSec = Math.round((Date.now() - then) / 1000);
    const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
    const abs = Math.abs(diffSec);
    if (abs < 60) return rtf.format(-diffSec, 'second');
    if (abs < 3600) return rtf.format(-Math.round(diffSec / 60), 'minute');
    if (abs < 86400) return rtf.format(-Math.round(diffSec / 3600), 'hour');
    return rtf.format(-Math.round(diffSec / 86400), 'day');
  }

  function walkNodes(root) {
    const out = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      out.push(node);
      const sons = Array.isArray(node.sons) ? node.sons : [];
      sons.forEach(visit);
    }
    visit(root);
    return out;
  }

  function analyzeTreeJson(data) {
    const nodes = walkNodes(data);
    let photos = 0;
    let withYears = 0;
    let withBio = 0;
    let maxDepth = 0;

    function depthWalk(node, depth) {
      if (!node) return;
      maxDepth = Math.max(maxDepth, depth);
      const sons = Array.isArray(node.sons) ? node.sons : [];
      sons.forEach((child) => depthWalk(child, depth + 1));
    }
    depthWalk(data, 1);

    nodes.forEach((node) => {
      if (node.photo) photos += 1;
      if (node.born || node.died) withYears += 1;
      if (node.bio || node.note) withBio += 1;
    });

    return {
      people: nodes.length,
      photos,
      withYears,
      withBio,
      maxDepth,
    };
  }

  function analyzeManifest(manifest) {
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    const withPeople = items.filter((item) => Number(item.personCount) > 0);
    const latest = withPeople[0] || items[0] || null;
    const previousDifferent = withPeople.find(
      (item, index) => index > 0 && Number(item.personCount) !== Number(latest?.personCount)
    );
    const baseline = [...withPeople].reverse()[0] || null;
    const personCount = Number(latest?.personCount) || 0;
    const addedSinceBaseline =
      baseline && personCount >= Number(baseline.personCount)
        ? personCount - Number(baseline.personCount)
        : null;
    const addedSincePrevious =
      previousDifferent && personCount >= Number(previousDifferent.personCount)
        ? personCount - Number(previousDifferent.personCount)
        : 0;

    return {
      backupCount: items.length,
      lastSavedAt: latest?.savedAt || null,
      manifestPeople: personCount,
      addedSinceBaseline,
      addedSincePrevious,
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  }

  async function callHubOverview() {
    const response = await fetch(publishUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.anonKey || ''}`,
        apikey: config.anonKey || '',
      },
      body: JSON.stringify({ action: 'hub-overview' }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `hub-overview ${response.status}`);
    }
    return response.json();
  }

  async function callStatus(treeDir) {
    const response = await fetch(publishUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.anonKey || ''}`,
        apikey: config.anonKey || '',
      },
      body: JSON.stringify({ action: 'status', treeDir }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `status ${response.status}`);
    }
    return response.json();
  }

  async function loadLocalStats(meta) {
    const base = meta.path;
    const [treeResult, manifestResult] = await Promise.allSettled([
      fetchJson(`${base}family-tree.json`),
      fetchJson(`${base}backups/manifest.json`),
    ]);

    const treeStats =
      treeResult.status === 'fulfilled' ? analyzeTreeJson(treeResult.value) : null;
    const manifestStats =
      manifestResult.status === 'fulfilled' ? analyzeManifest(manifestResult.value) : null;

    const people = treeStats?.people ?? manifestStats?.manifestPeople ?? null;

    return {
      meta,
      people,
      photos: treeStats?.photos ?? null,
      withYears: treeStats?.withYears ?? null,
      withBio: treeStats?.withBio ?? null,
      maxDepth: treeStats?.maxDepth ?? null,
      backupCount: manifestStats?.backupCount ?? null,
      lastSavedAt: manifestStats?.lastSavedAt ?? null,
      addedSinceBaseline: manifestStats?.addedSinceBaseline ?? null,
      addedSincePrevious: manifestStats?.addedSincePrevious ?? null,
      treeOk: treeResult.status === 'fulfilled',
    };
  }

  async function loadAll() {
    // Prefer hub-overview when deployed; fall back to per-tree status.
    let overviewByDir = new Map();
    try {
      const overview = await callHubOverview();
      if (overview?.ok && Array.isArray(overview.trees)) {
        overview.trees.forEach((row) => overviewByDir.set(row.treeDir, row));
      }
    } catch {
      overviewByDir = new Map();
    }

    const locals = await Promise.all(TREES.map((meta) => loadLocalStats(meta)));

    return Promise.all(
      locals.map(async (local) => {
        let remote = overviewByDir.get(local.meta.dir) || null;
        let liveOk = Boolean(remote);
        if (!remote) {
          try {
            remote = await callStatus(local.meta.dir);
            liveOk = true;
          } catch {
            remote = null;
            liveOk = false;
          }
        }

        return {
          ...local,
          locked: Boolean(remote?.locked),
          lockedReason: remote?.lockedReason || '',
          lastSavedAt: remote?.lastSavedAt || local.lastSavedAt,
          backupCount: remote?.backupCount ?? local.backupCount,
          addedSinceBaseline:
            remote?.addedSinceBaseline != null
              ? remote.addedSinceBaseline
              : local.addedSinceBaseline,
          addedSincePrevious:
            remote?.addedSincePrevious != null
              ? remote.addedSincePrevious
              : local.addedSincePrevious,
          people: local.people ?? remote?.personCount ?? null,
          liveOk,
        };
      })
    );
  }

  function renderSummary(rows) {
    const people = rows.reduce((sum, row) => sum + (Number(row.people) || 0), 0);
    const added = rows.reduce((sum, row) => sum + (Number(row.addedSinceBaseline) || 0), 0);

    $('#sum-people').textContent = formatNumber(people);
    $('#sum-added').textContent = formatNumber(added);
  }

  function badgeHtml(row) {
    if (row.locked) {
      return `<span class="badge badge-locked">Закрыто</span>`;
    }
    return '';
  }

  function renderCards(rows) {
    const list = $('#tree-list');
    list.innerHTML = rows
      .map((row, index) => {
        const addedHint =
          row.addedSincePrevious != null && row.addedSincePrevious > 0
            ? `+${formatNumber(row.addedSincePrevious)} с прошлого бэкапа`
            : 'с первого учёта';
        const photoText =
          row.photos != null ? `${formatNumber(row.photos)} с фото` : 'фото —';
        const yearsText =
          row.withYears != null ? `${formatNumber(row.withYears)} с годами` : '';
        const depthText = row.maxDepth != null ? `глубина ${formatNumber(row.maxDepth)}` : '';

        return `
          <article class="tree-card" data-i="${index}" data-dir="${row.meta.dir}">
            <div class="tree-card-head">
              <div>
                <h2>${row.meta.title}</h2>
                <p class="tree-slug">${row.meta.path}</p>
              </div>
              ${badgeHtml(row)}
            </div>
            <div class="metrics">
              <div class="metric">
                <span class="m-label">Люди</span>
                <span class="m-value">${formatNumber(row.people)}</span>
                <span class="m-hint">${photoText}</span>
              </div>
              <div class="metric">
                <span class="m-label">Добавлено</span>
                <span class="m-value">${formatNumber(row.addedSinceBaseline)}</span>
                <span class="m-hint">${addedHint}</span>
              </div>
              <div class="metric">
                <span class="m-label">Бэкапы</span>
                <span class="m-value">${formatNumber(row.backupCount)}</span>
              </div>
              <div class="metric">
                <span class="m-label">Состав</span>
                <span class="m-value">${formatNumber(row.withBio)}</span>
                <span class="m-hint">${[yearsText, depthText].filter(Boolean).join(' · ') || 'био / заметки'}</span>
              </div>
            </div>
            <p class="tree-meta">
              <span>Сохранено ${formatRelative(row.lastSavedAt)}</span>
              ${row.locked && row.lockedReason ? `<span>${row.lockedReason}</span>` : ''}
              ${row.liveOk ? '' : '<span>статус недоступен</span>'}
            </p>
            <div class="tree-actions">
              <a class="btn btn-primary" href="${row.meta.path}" target="_blank" rel="noopener">Открыть древо</a>
              <button type="button" class="btn btn-amber" data-copy="${row.meta.path}">Копировать ссылку</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  async function refresh(opts = {}) {
    if (refreshInFlight) return;
    refreshInFlight = true;
    const btn = $('#refresh-btn');
    if (btn) btn.classList.add('is-spinning');
    if (opts.boot) showBoot('Считываю древа…');

    const status = $('#status-line');
    try {
      const rows = await loadAll();
      renderSummary(rows);
      renderCards(rows);
      const stamp = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      $('#updated-at').textContent = `Обновлено в ${stamp}`;
      if (status) status.textContent = 'Данные с сайта и live-статуса. Старые ссылки /drewo/ не менялись.';
    } catch (error) {
      if (status) {
        status.textContent =
          error instanceof Error ? error.message : 'Не удалось обновить данные';
      }
    } finally {
      refreshInFlight = false;
      if (btn) {
        window.setTimeout(() => btn.classList.remove('is-spinning'), 700);
      }
      if (opts.boot) hideBoot();
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  const AUTH_LOCK_SCOPE = 'trees';
  let authLockTimer = null;

  function authLockApi() {
    return window.AuthLock || null;
  }

  function setLoginError(message, visible = true) {
    const err = $('#login-error');
    if (!err) return;
    err.hidden = !visible;
    if (visible) err.textContent = message;
  }

  function syncLoginLockUi() {
    const api = authLockApi();
    const submit = $('#login-submit');
    if (!api) return;
    const state = api.getState(AUTH_LOCK_SCOPE);
    if (state.locked) {
      setLoginError(state.message, true);
      if (submit) submit.disabled = true;
      return;
    }
    if (submit && isAuthReady()) submit.disabled = false;
  }

  function startAuthLockTicker() {
    if (authLockTimer) return;
    authLockTimer = window.setInterval(() => {
      const api = authLockApi();
      if (!api) return;
      const state = api.getState(AUTH_LOCK_SCOPE);
      if (state.locked) {
        setLoginError(state.message, true);
        const submit = $('#login-submit');
        if (submit) submit.disabled = true;
        return;
      }
      clearInterval(authLockTimer);
      authLockTimer = null;
      syncLoginLockUi();
      const err = $('#login-error');
      if (err && /Слишком много попыток|Осталось попыток/.test(err.textContent || '')) {
        err.hidden = true;
      }
    }, 1000);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError('', false);
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;

    const sb = getClient();
    if (!sb) {
      setLoginError('Supabase не настроен');
      return;
    }

    const lock = authLockApi();
    if (lock) {
      try {
        lock.assertAllowed(AUTH_LOCK_SCOPE);
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : 'Слишком много попыток.');
        startAuthLockTicker();
        syncLoginLockUi();
        return;
      }
    }

    showBoot('Вход…');
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (lock) lock.clear(AUTH_LOCK_SCOPE);
      try {
        localStorage.setItem(EMAIL_KEY, email);
      } catch {
        // ignore
      }
      showApp();
      await refresh({ boot: true });
      startPolling();
    } catch (error) {
      let message = error?.message?.includes('Invalid')
        ? 'Неверные данные для входа'
        : error?.message || 'Ошибка входа';
      if (lock) {
        const after = lock.recordFailure(AUTH_LOCK_SCOPE);
        message = after.locked
          ? after.message
          : `Неверные данные для входа. Осталось попыток: ${after.attemptsLeft}`;
        if (after.locked) startAuthLockTicker();
      }
      setLoginError(message);
      syncLoginLockUi();
      hideBoot();
    }
  }

  async function handleLogout() {
    const sb = getClient();
    stopPolling();
    showBoot('Выход…');
    try {
      if (sb) await sb.auth.signOut();
    } catch {
      // ignore
    }
    hideBoot();
    showLogin();
  }

  async function restoreSession() {
    const sb = getClient();
    if (!sb) {
      $('#login-setup-notice').hidden = false;
      $('#login-submit').disabled = true;
      hideBoot();
      return;
    }

    showBoot('Проверка сессии…');
    try {
      const { data } = await sb.auth.getSession();
      if (!data?.session) {
        hideBoot();
        return;
      }
      showApp();
      await refresh({ boot: true });
      startPolling();
    } catch {
      showLogin();
      hideBoot();
    }
  }

  function setupPwa() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
      });
    }

    const banner = $('#pwa-banner');
    const installBtn = $('#pwa-install');
    const dismissBtn = $('#pwa-dismiss');
    if (!banner || !installBtn || !dismissBtn) return;

    try {
      if (localStorage.getItem(PWA_DISMISS_KEY) === '1') return;
    } catch {
      // continue
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) return;

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      banner.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        // ignore
      }
      deferredPrompt = null;
      banner.hidden = true;
    });

    dismissBtn.addEventListener('click', () => {
      banner.hidden = true;
      try {
        localStorage.setItem(PWA_DISMISS_KEY, '1');
      } catch {
        // ignore
      }
    });
  }

  async function copyPath(path) {
    const url = new URL(path, window.location.origin).href;
    const status = $('#status-line');
    try {
      await navigator.clipboard.writeText(url);
      if (status) status.textContent = `Скопировано: ${url}`;
    } catch {
      if (status) status.textContent = url;
    }
  }

  function bind() {
    $('#login-form')?.addEventListener('submit', (event) => {
      void handleLogin(event);
    });
    $('#logout-btn')?.addEventListener('click', () => {
      void handleLogout();
    });
    $('#refresh-btn')?.addEventListener('click', () => {
      void refresh();
    });
    $('#tree-list')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-copy]');
      if (!btn) return;
      void copyPath(btn.getAttribute('data-copy'));
    });

    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved && $('#login-email')) $('#login-email').value = saved;
    } catch {
      // ignore
    }

    if (!isAuthReady()) {
      const notice = $('#login-setup-notice');
      const submit = $('#login-submit');
      if (notice) notice.hidden = false;
      if (submit) submit.disabled = true;
    }
    syncLoginLockUi();
    const lock = authLockApi();
    if (lock?.getState(AUTH_LOCK_SCOPE).locked) startAuthLockTicker();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !$('#app-screen').hidden) {
        void refresh();
      }
    });
  }

  bind();
  setupPwa();
  void restoreSession();
})();
