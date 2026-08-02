(function initAdminCommandCenter(global) {
  const POLL_MS = 8000;
  const SITE = 'https://waydean.ru';
  const QF_PROXY = 'https://quranapp-qf.mansur-khatuev.workers.dev';
  const QF_SAMPLE =
    `${QF_PROXY}/content/api/v4/quran/verses/uthmani?chapter_number=1`;
  const AUDIO_CDN_SAMPLE =
    'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3';
  const AUDIO_GAPLESS_SAMPLE =
    'https://audio-cdn.tarteel.ai/quran/surah/mansourAlSalimi/murattal/mp3/001.mp3';
  const AUDIO_MP3QURAN_SAMPLE = 'https://server14.mp3quran.net/mansor/001.mp3';
  const GIVEAWAY_FN =
    'https://rivjkiksknnesahrvamf.supabase.co/functions/v1/academy-giveaway-enter';
  const APP_STORE_LOOKUP = 'https://itunes.apple.com/lookup?id=6782619598';
  const AUDIO_PREF_KEY = 'waydean_admin_hud_audio_v1';
  const OPERATOR_NAME = 'Mansur';

  const TARGET_BRIEFS = {
    'SB-01': {
      bound:
        'База админки: релизы, дуа, отзывы Академии, аналитика, розыгрыш, вход оператора.',
      fail:
        'Админка почти не работает: нет данных, публикации, отзывов и аналитики. Приложение при этом может жить на кэше.',
    },
    'AN-02': {
      bound:
        'Таблица analytics_events — события из приложения (открытия, уроки, азкары, тасбих).',
      fail:
        'Вкладка «Аналитика» пустая или с ошибкой. Само приложение и уроки работают как обычно.',
    },
    'CDN-03': {
      bound:
        'Файл app-release.json на waydean.ru — версии Android/iOS и ссылки RuStore/APK для баннера обновления в приложении.',
      fail:
        'В приложении не подтянется проверка новой версии / ссылка на обновление. Уже установленное приложение читает Коран и Академию офлайн.',
    },
    'ST-12': {
      bound:
        'Живая версия в Apple App Store (iTunes Lookup) + сверка с iOS-полем в app-release.json.',
      fail:
        'Не видим актуальную версию в App Store или манифест на сайте устарел относительно стора. Баннер обновления в приложении может показывать неверную версию, пока не опубликуете релиз в админке.',
    },
    'ST-13': {
      bound:
        'Живая версия в RuStore (через Edge Function + API ключ) и сверка с Android-полем в app-release.json.',
      fail:
        'Не видим актуальную версию в RuStore или манифест на сайте устарел. Баннер обновления Android может показывать неверную версию, пока не подтянете и не опубликуете релиз.',
    },
    'CDN-04': {
      bound:
        'Манифест удалённых дуа для раздела «Поддержка» на сайте и в админке.',
      fail:
        'Не обновятся удалённые дуа с CDN. Локальный контент в приложении и уже опубликованные файлы остаются.',
    },
    'PWA-05': {
      bound:
        'Манифест PWA админки (иконка, установка на домашний экран).',
      fail:
        'Установка/обновление ярлыка админки может сломаться. Сама админка в браузере обычно открывается.',
    },
    'PUB-06': {
      bound:
        'Edge Function публикации: выгрузка дуа/релизов/контента из админки на GitHub → waydean.ru.',
      fail:
        'Кнопка «Опубликовать» не сработает — правки останутся только в Supabase, на сайт не уйдут. Чтение сайта и приложения не ломается.',
    },
    'QF-07': {
      bound:
        'Прокси Quran Foundation — онлайн-мусхаф / таджвид-страницы, когда нет локального пака.',
      fail:
        'Онлайн-загрузка страниц QF и скачивание пака через API не сработают. Офлайн-пак и обычное чтение без QF остаются.',
    },
    'GW-08': {
      bound:
        'Edge Function розыгрыша итогового экзамена Академии (заявки с устройств).',
      fail:
        'Нельзя принять/обработать заявки розыгрыша. Курсы, уроки и остальная Академия работают.',
    },
    'AUD-09': {
      bound:
        'CDN islamic.network — потоковое аудио аятов (например Alafasy) в слушании/чтении.',
      fail:
        'Онлайн-аудио с этого CDN не заиграет. Офлайн-паки чтецов и другие CDN могут ещё работать.',
    },
    'AUD-10': {
      bound:
        'Tarteel audio CDN — gapless/суры для выбранных чтецов.',
      fail:
        'Gapless-режим и эти суры онлайн недоступны. Поаятное аудио с других источников и офлайн-паки — отдельно.',
    },
    'AUD-11': {
      bound:
        'mp3quran — ещё один источник сур/чтецов в приложении.',
      fail:
        'Аудио с mp3quran не загрузится. Другие чтецы/CDN и офлайн-паки не затрагиваются.',
    },
  };

  let timer = null;
  let clockTimer = null;
  let cycle = 0;
  let active = false;
  let audioEnabled = false;
  let audioCtx = null;
  let lastBannerKey = '';
  let selectedTargetId = null;

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

  function ensureAudioContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  }

  function beep(freq, durationMs, type, gainValue) {
    if (!audioEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = gainValue || 0.035;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  function playSweepStart() {
    beep(220, 70, 'sawtooth', 0.02);
    window.setTimeout(() => beep(440, 50, 'square', 0.018), 80);
  }

  function playStatusCue(key) {
    if (!audioEnabled || key === lastBannerKey) return;
    lastBannerKey = key;
    if (key === 'ok') {
      beep(523, 80, 'triangle', 0.03);
      window.setTimeout(() => beep(784, 100, 'triangle', 0.028), 90);
      return;
    }
    if (key === 'warn') {
      beep(360, 120, 'square', 0.03);
      window.setTimeout(() => beep(300, 140, 'square', 0.028), 130);
      return;
    }
    if (key === 'critical') {
      beep(180, 160, 'sawtooth', 0.04);
      window.setTimeout(() => beep(140, 200, 'sawtooth', 0.035), 170);
      window.setTimeout(() => beep(110, 220, 'sawtooth', 0.03), 360);
    }
  }

  function aliveStatuses(status) {
    return status === 200 || status === 204 || status === 401 || status === 403 || status === 405;
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
      const accepted = Boolean(options.acceptStatuses?.includes(response.status));
      const softAlive = !response.ok && aliveStatuses(response.status) && !accepted;
      const ok = response.ok || softAlive || accepted;
      let detail = 'В сети';
      if (!response.ok) {
        detail = softAlive || accepted ? 'Отвечает' : `HTTP ${response.status}`;
      }
      if (typeof options.detailOk === 'function' && response.ok) {
        try {
          detail = (await options.detailOk(response)) || detail;
        } catch {
          // keep default
        }
      }
      return {
        ok,
        soft: softAlive,
        status: response.status,
        ms,
        detail,
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : 'Ошибка';
      return { ok: false, soft: false, status: 0, ms, detail: message.slice(0, 42) };
    }
  }

  async function pingAudio(url) {
    const started = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors',
      });
      if (response.status === 405 || response.status === 403 || response.status === 400) {
        response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
          mode: 'cors',
          headers: { Range: 'bytes=0-1' },
        });
      }
      clearTimeout(timeout);
      const ms = Math.round(performance.now() - started);
      const ok = response.ok || response.status === 206;
      return {
        ok,
        soft: !ok && (response.status === 401 || response.status === 403),
        status: response.status,
        ms,
        detail: ok ? 'Аудио доступно' : `HTTP ${response.status}`,
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : 'Ошибка';
      if (/Failed to fetch|NetworkError|CORS/i.test(message)) {
        return { ok: true, soft: true, status: 0, ms, detail: 'CORS скрыл ответ' };
      }
      return { ok: false, soft: false, status: 0, ms, detail: message.slice(0, 42) };
    }
  }

  async function pingSupabase() {
    const config = global.SUPABASE_CONFIG;
    if (!config?.url || !config?.anonKey) {
      return { ok: false, soft: false, status: 0, ms: 0, detail: 'Не настроено' };
    }
    const started = performance.now();
    try {
      const client = global.AdminSupabase?.getClient?.();
      if (!client) {
        return { ok: false, soft: false, status: 0, ms: 0, detail: 'Нет клиента' };
      }
      const { error } = await client.from('app_release').select('id').limit(1);
      const ms = Math.round(performance.now() - started);
      if (error) {
        return { ok: false, soft: false, status: 500, ms, detail: error.message.slice(0, 42) };
      }
      return { ok: true, soft: false, status: 200, ms, detail: 'В сети' };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      return {
        ok: false,
        soft: false,
        status: 0,
        ms,
        detail: (error instanceof Error ? error.message : 'Ошибка').slice(0, 42),
      };
    }
  }

  async function pingAnalytics() {
    const started = performance.now();
    try {
      const client = global.AdminSupabase?.getClient?.();
      if (!client) {
        return { ok: false, soft: false, status: 0, ms: 0, detail: 'Нет клиента' };
      }
      const { error, count } = await client
        .from('analytics_events')
        .select('id', { count: 'exact', head: true });
      const ms = Math.round(performance.now() - started);
      if (error) {
        const missing = /does not exist|relation/i.test(error.message);
        return {
          ok: false,
          soft: missing,
          status: missing ? 404 : 500,
          ms,
          detail: missing ? 'Таблица не создана' : error.message.slice(0, 42),
        };
      }
      return {
        ok: true,
        soft: false,
        status: 200,
        ms,
        detail: typeof count === 'number' ? `Событий: ${count}` : 'Таблица доступна',
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      return {
        ok: false,
        soft: false,
        status: 0,
        ms,
        detail: (error instanceof Error ? error.message : 'Ошибка').slice(0, 42),
      };
    }
  }

  async function pingPublish() {
    const url = global.SUPABASE_CONFIG?.publishFunctionUrl;
    if (!url) {
      return { ok: false, soft: true, status: 0, ms: 0, detail: 'URL не задан' };
    }
    // GET: 405/401 = функция жива. OPTIONS из браузера часто даёт ложный Failed to fetch.
    const result = await pingUrl(url, {
      method: 'GET',
      timeoutMs: 7000,
      acceptStatuses: [401, 403, 405],
    });
    if (aliveStatuses(result.status)) {
      return { ...result, ok: true, soft: false, detail: 'Функция отвечает' };
    }
    return result;
  }

  async function pingAppRelease() {
    return pingUrl(`${SITE}/data/app-release.json`, {
      detailOk: async (response) => {
        const data = await response.clone().json();
        const android = data?.android?.latestVersion || '—';
        const ios = data?.ios?.latestVersion || '—';
        return `Манифест · Android ${android} · iOS ${ios}`;
      },
    });
  }

  async function loadReleaseManifest() {
    const response = await fetch(`${SITE}/data/app-release.json`, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function pingAppStoreLive() {
    const started = performance.now();
    try {
      const [storeRes, manifest] = await Promise.all([
        fetch(APP_STORE_LOOKUP, { method: 'GET', cache: 'no-store', mode: 'cors' }),
        loadReleaseManifest().catch(() => null),
      ]);
      const ms = Math.round(performance.now() - started);
      if (!storeRes.ok) {
        return { ok: false, soft: false, status: storeRes.status, ms, detail: `HTTP ${storeRes.status}` };
      }
      const payload = await storeRes.json();
      const live = payload?.results?.[0]?.version;
      if (!live) {
        return { ok: false, soft: true, status: 200, ms, detail: 'Версия в ответе пуста' };
      }
      const declared = manifest?.ios?.latestVersion || null;
      if (!declared) {
        return {
          ok: true,
          soft: true,
          status: 200,
          ms,
          detail: `App Store ${live} · манифест iOS нет`,
        };
      }
      if (declared === live) {
        return {
          ok: true,
          soft: false,
          status: 200,
          ms,
          detail: `App Store ${live} = манифест`,
        };
      }
      return {
        ok: true,
        soft: true,
        status: 200,
        ms,
        detail: `App Store ${live} ≠ манифест ${declared}`,
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      return {
        ok: false,
        soft: false,
        status: 0,
        ms,
        detail: (error instanceof Error ? error.message : 'Ошибка').slice(0, 42),
      };
    }
  }

  async function pingRuStoreLive() {
    const started = performance.now();
    const url = global.SUPABASE_CONFIG?.rustoreVersionUrl;
    if (!url) {
      return { ok: false, soft: true, status: 0, ms: 0, detail: 'URL не задан' };
    }
    try {
      const session = await global.AdminSupabase?.getSession?.();
      if (!session?.access_token) {
        return { ok: false, soft: true, status: 401, ms: 0, detail: 'Нужен вход' };
      }
      const [storeRes, manifest] = await Promise.all([
        fetch(url, {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: global.SUPABASE_CONFIG?.anonKey || '',
          },
        }),
        loadReleaseManifest().catch(() => null),
      ]);
      const ms = Math.round(performance.now() - started);
      const payload = await storeRes.json().catch(() => ({}));
      if (!storeRes.ok) {
        return {
          ok: false,
          soft: storeRes.status === 503 || storeRes.status === 401,
          status: storeRes.status,
          ms,
          detail: (payload.error || `HTTP ${storeRes.status}`).slice(0, 48),
        };
      }
      const live = payload.versionName;
      const code = payload.versionCode;
      if (!live) {
        return { ok: false, soft: true, status: 200, ms, detail: 'Версия в ответе пуста' };
      }
      const declared = manifest?.android?.latestVersion || null;
      const declaredCode = manifest?.android?.versionCode;
      const codePart = code != null ? ` · code ${code}` : '';
      if (!declared) {
        return {
          ok: true,
          soft: true,
          status: 200,
          ms,
          detail: `RuStore ${live}${codePart} · манифест нет`,
        };
      }
      const versionMatch = declared === live;
      const codeMatch = declaredCode == null || code == null || Number(declaredCode) === Number(code);
      if (versionMatch && codeMatch) {
        return {
          ok: true,
          soft: false,
          status: 200,
          ms,
          detail: `RuStore ${live}${codePart} = манифест`,
        };
      }
      return {
        ok: true,
        soft: true,
        status: 200,
        ms,
        detail: `RuStore ${live}${codePart} ≠ манифест ${declared}`,
      };
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      return {
        ok: false,
        soft: false,
        status: 0,
        ms,
        detail: (error instanceof Error ? error.message : 'Ошибка').slice(0, 42),
      };
    }
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

  function statusLabel(result) {
    if (result.ok && !result.soft) return 'В норме';
    if (result.ok || result.soft) return 'С предупреждением';
    return 'Не отвечает';
  }

  function showTargetBrief(item) {
    const panel = $('hud-target-brief');
    if (!panel || !item) return;
    const brief = TARGET_BRIEFS[item.id] || {
      bound: 'Служебная проверка доступности.',
      fail: 'Возможен сбой связанного канала. Уточните по ID.',
    };
    const title = $('hud-brief-title');
    const status = $('hud-brief-status');
    const bound = $('hud-brief-bound');
    const fail = $('hud-brief-fail');
    if (title) title.textContent = `${item.id} · ${item.name}`;
    if (status) {
      status.textContent = `${statusLabel(item.result)} · ${item.result.detail} · ${item.result.ms} мс`;
      status.className = `admin-hud-brief-status ${statusClass(item.result)}`;
    }
    if (bound) bound.textContent = brief.bound;
    if (fail) fail.textContent = brief.fail;
    panel.hidden = false;
  }

  function hideTargetBrief() {
    selectedTargetId = null;
    const panel = $('hud-target-brief');
    if (panel) panel.hidden = true;
    const root = $('hud-targets');
    if (root) {
      root.querySelectorAll('.admin-hud-target.is-selected').forEach((el) => {
        el.classList.remove('is-selected');
      });
    }
  }

  function renderTargets(results) {
    const root = $('hud-targets');
    if (!root) return;
    root.innerHTML = '';
    for (const item of results) {
      const card = document.createElement('article');
      card.className = `admin-hud-target ${statusClass(item.result)}`;
      if (selectedTargetId === item.id) card.classList.add('is-selected');
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.setAttribute('aria-pressed', selectedTargetId === item.id ? 'true' : 'false');
      card.dataset.targetId = item.id;
      card.innerHTML = `
        <div class="admin-hud-target-top">
          <span class="admin-hud-glyph">${statusGlyph(item.result)}</span>
          <span class="admin-hud-target-id">${item.id}</span>
        </div>
        <h3>${item.name}</h3>
        <p class="admin-hud-detail">${item.result.detail}</p>
        <div class="admin-hud-metrics">
          <span>ЗАДЕРЖКА ${item.result.ms} мс</span>
          <span>КОД ${item.result.status || '—'}</span>
        </div>
      `;
      const activate = () => {
        if (selectedTargetId === item.id) {
          hideTargetBrief();
          return;
        }
        selectedTargetId = item.id;
        root.querySelectorAll('.admin-hud-target').forEach((el) => {
          const on = el.dataset.targetId === item.id;
          el.classList.toggle('is-selected', on);
          el.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        showTargetBrief(item);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
      root.appendChild(card);
    }

    if (selectedTargetId) {
      const selected = results.find((item) => item.id === selectedTargetId);
      if (selected) showTargetBrief(selected);
      else hideTargetBrief();
    }
  }

  function renderBanner(results) {
    const banner = $('hud-system-banner');
    if (!banner) return;
    const hardFail = results.filter((item) => !item.result.ok && !item.result.soft).length;
    const soft = results.filter((item) => item.result.soft).length;
    banner.classList.remove('is-scanning', 'is-ok', 'is-warn', 'is-critical');
    if (hardFail === 0 && soft === 0) {
      banner.classList.add('is-ok');
      banner.textContent = 'ВСЕ СИСТЕМЫ В НОРМЕ';
      playStatusCue('ok');
      return;
    }
    if (hardFail === 0) {
      banner.classList.add('is-warn');
      banner.textContent = `ЧАСТИЧНО · ${soft} канал(а) с предупреждением`;
      playStatusCue('warn');
      return;
    }
    banner.classList.add('is-critical');
    banner.textContent = `СБОЙ · ${hardFail} цель(ей) недоступны`;
    playStatusCue('critical');
  }

  async function sweep() {
    cycle += 1;
    const cycleEl = $('hud-cycle');
    if (cycleEl) cycleEl.textContent = String(cycle);
    playSweepStart();

    const operator = $('hud-operator');
    if (operator) operator.textContent = OPERATOR_NAME;

    const checks = await Promise.all([
      pingSupabase().then((result) => ({
        id: 'SB-01',
        name: 'Supabase API',
        result,
      })),
      pingAnalytics().then((result) => ({
        id: 'AN-02',
        name: 'Аналитика · таблица',
        result,
      })),
      pingAppRelease().then((result) => ({
        id: 'CDN-03',
        name: 'Сайт · релиз приложения',
        result,
      })),
      pingAppStoreLive().then((result) => ({
        id: 'ST-12',
        name: 'App Store · live',
        result,
      })),
      pingRuStoreLive().then((result) => ({
        id: 'ST-13',
        name: 'RuStore · live',
        result,
      })),
      pingUrl(`${SITE}/data/remote-dua.manifest.json`).then((result) => ({
        id: 'CDN-04',
        name: 'Сайт · манифест дуа',
        result,
      })),
      pingUrl(`${SITE}/admin/manifest.webmanifest`).then((result) => ({
        id: 'PWA-05',
        name: 'Админ · PWA',
        result,
      })),
      pingPublish().then((result) => ({
        id: 'PUB-06',
        name: 'Публикация сайта',
        result,
      })),
      pingUrl(QF_SAMPLE, { method: 'GET', timeoutMs: 8000 }).then((result) => ({
        id: 'QF-07',
        name: 'Прокси Quran Foundation',
        result,
      })),
      pingUrl(GIVEAWAY_FN, {
        method: 'GET',
        timeoutMs: 7000,
        acceptStatuses: [401, 403, 405],
      }).then((result) => {
        if (aliveStatuses(result.status)) {
          return {
            id: 'GW-08',
            name: 'Розыгрыш · функция',
            result: { ...result, ok: true, soft: false, detail: 'Функция отвечает' },
          };
        }
        return { id: 'GW-08', name: 'Розыгрыш · функция', result };
      }),
      pingAudio(AUDIO_CDN_SAMPLE).then((result) => ({
        id: 'AUD-09',
        name: 'Аудио · Islamic CDN',
        result,
      })),
      pingAudio(AUDIO_GAPLESS_SAMPLE).then((result) => ({
        id: 'AUD-10',
        name: 'Аудио · Tarteel',
        result,
      })),
      pingAudio(AUDIO_MP3QURAN_SAMPLE).then((result) => ({
        id: 'AUD-11',
        name: 'Аудио · mp3quran',
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

    const briefClose = $('hud-brief-close');
    if (briefClose) {
      briefClose.addEventListener('click', () => {
        hideTargetBrief();
      });
    }

    const audioToggle = $('hud-audio-enabled');
    if (audioToggle) {
      try {
        audioEnabled = localStorage.getItem(AUDIO_PREF_KEY) === '1';
      } catch {
        audioEnabled = false;
      }
      audioToggle.checked = audioEnabled;
      audioToggle.addEventListener('change', () => {
        audioEnabled = audioToggle.checked;
        try {
          localStorage.setItem(AUDIO_PREF_KEY, audioEnabled ? '1' : '0');
        } catch {
          // ignore
        }
        if (audioEnabled) {
          ensureAudioContext();
          playSweepStart();
          lastBannerKey = '';
        }
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
