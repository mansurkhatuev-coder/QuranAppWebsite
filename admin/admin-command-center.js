(function initAdminCommandCenter(global) {
  const POLL_MS = 8000;
  const SITE = 'https://waydean.ru';
  const QF_PROXY = 'https://quranapp-qf.mansur-khatuev.workers.dev';

  let timer = null;
  let clockTimer = null;
  let cycle = 0;
  let active = false;

  function $(id) {
    return document.getElementById(id);
  }

  function nowClock(timeZone) {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone,
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(11, 19);
    }
  }

  function updateClocks() {
    const local = $('hud-clock-local');
    const utc = $('hud-clock-utc');
    if (local) local.textContent = nowClock(undefined);
    if (utc) utc.textContent = nowClock('UTC');
  }

  async function pingUrl(url, options = {}) {
    const started = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 7000);
      const response = await fetch(url, {
        method: options.method || 'GET',
        signal: controller.signal,
        cache: 'no-store',
        headers: options.headers || {},
        mode: options.mode || 'cors',
      });
      clearTimeout(timeout);
      const ms = Math.round(performance.now() - started);
      return {
        ok: response.ok || response.status === 401 || response.status === 403,
        soft: response.status === 401 || response.status === 403,
        status: response.status,
        ms,
        detail: response.ok ? 'ONLINE' : `HTTP ${response.status}`,
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : 'FAIL';
      return { ok: false, soft: false, status: 0, ms, detail: message.slice(0, 42) };
    }
  }

  async function pingSupabase() {
    const config = global.SUPABASE_CONFIG;
    if (!config?.url || !config?.anonKey) {
      return { ok: false, soft: false, status: 0, ms: 0, detail: 'NOT CONFIGURED' };
    }
    const started = performance.now();
    try {
      const client = global.AdminSupabase?.getClient?.();
      if (!client) {
        return { ok: false, soft: false, status: 0, ms: 0, detail: 'NO CLIENT' };
      }
      const { error } = await client.from('app_release').select('id').limit(1);
      const ms = Math.round(performance.now() - started);
      if (error) {
        return { ok: false, soft: false, status: 500, ms, detail: error.message.slice(0, 42) };
      }
      return { ok: true, soft: false, status: 200, ms, detail: 'ONLINE' };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      return {
        ok: false,
        soft: false,
        status: 0,
        ms,
        detail: (error instanceof Error ? error.message : 'FAIL').slice(0, 42),
      };
    }
  }

  async function pingPublish() {
    const url = global.SUPABASE_CONFIG?.publishFunctionUrl;
    if (!url) {
      return { ok: false, soft: true, status: 0, ms: 0, detail: 'URL EMPTY' };
    }
    // Functions often reject unauthenticated GET with 401 — still proves the edge is up.
    return pingUrl(url, {
      method: 'OPTIONS',
      timeoutMs: 7000,
    });
  }

  function statusClass(result) {
    if (result.ok && !result.soft) return 'is-online';
    if (result.ok || result.soft) return 'is-warn';
    return 'is-offline';
  }

  function statusGlyph(result) {
    if (result.ok && !result.soft) return '●';
    if (result.ok || result.soft) return '▲';
    return '■';
  }

  function renderTargets(results) {
    const root = $('hud-targets');
    if (!root) return;
    root.innerHTML = '';
    for (const item of results) {
      const card = document.createElement('article');
      card.className = `admin-hud-target ${statusClass(item.result)}`;
      card.innerHTML = `
        <div class="admin-hud-target-top">
          <span class="admin-hud-glyph">${statusGlyph(item.result)}</span>
          <span class="admin-hud-target-id">${item.id}</span>
        </div>
        <h3>${item.name}</h3>
        <p class="admin-hud-detail">${item.result.detail}</p>
        <div class="admin-hud-metrics">
          <span>LAT ${item.result.ms}ms</span>
          <span>CODE ${item.result.status || '—'}</span>
        </div>
      `;
      root.appendChild(card);
    }
  }

  function renderBanner(results) {
    const banner = $('hud-system-banner');
    if (!banner) return;
    const hardFail = results.filter((item) => !item.result.ok && !item.result.soft).length;
    const soft = results.filter((item) => item.result.soft || (item.result.ok && item.result.status >= 400)).length;
    banner.classList.remove('is-scanning', 'is-ok', 'is-warn', 'is-critical');
    if (hardFail === 0 && soft === 0) {
      banner.classList.add('is-ok');
      banner.textContent = 'ALL SYSTEMS NOMINAL';
      return;
    }
    if (hardFail === 0) {
      banner.classList.add('is-warn');
      banner.textContent = `PARTIAL LOCK // ${soft} CHANNEL(S) DEGRADED`;
      return;
    }
    banner.classList.add('is-critical');
    banner.textContent = `THREAT DETECTED // ${hardFail} TARGET(S) OFFLINE`;
  }

  async function sweep() {
    cycle += 1;
    const cycleEl = $('hud-cycle');
    if (cycleEl) cycleEl.textContent = String(cycle);

    const operator = $('hud-operator');
    if (operator && global.AdminSupabase?.getSession) {
      try {
        const session = await global.AdminSupabase.getSession();
        operator.textContent = session?.user?.email || 'UNKNOWN';
      } catch {
        operator.textContent = 'UNKNOWN';
      }
    }

    const checks = await Promise.all([
      pingSupabase().then((result) => ({
        id: 'SB-01',
        name: 'Supabase API',
        result,
      })),
      pingUrl(`${SITE}/data/app-release.json`).then((result) => ({
        id: 'CDN-02',
        name: 'Site · app-release',
        result,
      })),
      pingUrl(`${SITE}/data/remote-dua.manifest.json`).then((result) => ({
        id: 'CDN-03',
        name: 'Site · dua manifest',
        result,
      })),
      pingUrl(`${SITE}/admin/manifest.webmanifest`).then((result) => ({
        id: 'PWA-04',
        name: 'Admin PWA shell',
        result,
      })),
      pingPublish().then((result) => ({
        id: 'PUB-05',
        name: 'Publish function',
        result,
      })),
      pingUrl(`${QF_PROXY}/`, { method: 'GET', timeoutMs: 6000 }).then((result) => ({
        id: 'QF-06',
        name: 'Quran Foundation proxy',
        result,
      })),
    ]);

    renderTargets(checks);
    renderBanner(checks);
    const sweepEl = $('hud-last-sweep');
    if (sweepEl) {
      sweepEl.textContent = new Date().toLocaleTimeString('ru-RU');
    }
  }

  function start() {
    if (active) return;
    active = true;
    updateClocks();
    clockTimer = window.setInterval(updateClocks, 1000);
    void sweep();
    timer = window.setInterval(() => {
      void sweep();
    }, POLL_MS);
  }

  function stop() {
    active = false;
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    if (clockTimer) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  function bind() {
    const refresh = $('hud-refresh');
    if (refresh) {
      refresh.addEventListener('click', () => {
        void sweep();
      });
    }
  }

  global.AdminCommandCenter = {
    bind,
    start,
    stop,
    sweep,
  };
})(window);
