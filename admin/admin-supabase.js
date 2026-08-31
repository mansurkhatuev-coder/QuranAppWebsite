(function initAdminSupabase(global) {
  const config = global.SUPABASE_CONFIG;

  function isEnabled() {
    return Boolean(config?.url && config?.anonKey && global.supabase?.createClient);
  }

  function getClient() {
    if (!isEnabled()) return null;
    if (!getClient.instance) {
      getClient.instance = global.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return getClient.instance;
  }

  function rowToItem(row) {
    const source = row.source && typeof row.source === 'object' ? row.source : undefined;
    const benefitHadith =
      row.benefit_hadith && typeof row.benefit_hadith === 'object' ? row.benefit_hadith : undefined;
    return {
      id: row.id,
      title: row.title,
      navTitle: row.nav_title ?? row.title,
      text: row.text,
      translation: row.translation ?? undefined,
      translationChechen: row.translation_chechen ?? undefined,
      extraTranslations: Array.isArray(row.extra_translations) ? row.extra_translations : undefined,
      transliteration: row.transliteration ?? undefined,
      targetCount: row.target_count ?? 3,
      audio: Array.isArray(row.audio) ? row.audio : [],
      group: row.group ?? undefined,
      category: row.category,
      authenticity: row.authenticity,
      source,
      benefitHadith,
      tags: Array.isArray(row.tags) ? row.tags : [],
      importance: row.importance ?? undefined,
      placementFit: row.placement_fit ?? undefined,
      status: row.status ?? 'published',
    };
  }

  function itemToRow(item) {
    return {
      id: item.id,
      category: item.category,
      title: item.title,
      nav_title: item.navTitle ?? item.title,
      text: item.text,
      translation: item.translation ?? null,
      translation_chechen: item.translationChechen ?? null,
      extra_translations: item.extraTranslations ?? [],
      transliteration: item.transliteration ?? null,
      target_count: item.targetCount ?? 3,
      audio: item.audio ?? [],
      group: item.group ?? null,
      authenticity: item.authenticity,
      source: item.source ?? null,
      benefit_hadith: item.benefitHadith ?? null,
      tags: item.tags ?? [],
      importance: item.importance ?? null,
      placement_fit: item.placementFit ?? null,
      status: item.status ?? 'published',
      updated_at: new Date().toISOString(),
    };
  }

  function announcementRowToState(row) {
    return {
      id: row.id,
      titleRu: row.title_ru,
      titleEn: row.title_en ?? undefined,
      bodyRu: row.body_ru ?? undefined,
      bodyEn: row.body_en ?? undefined,
      actionUrl: row.action_url ?? undefined,
      actionLabelRu: row.action_label_ru ?? undefined,
      actionLabelEn: row.action_label_en ?? undefined,
      startsAt: row.starts_at ?? undefined,
      endsAt: row.ends_at ?? undefined,
      priority: row.priority ?? 0,
      status: row.status ?? 'published',
    };
  }

  function announcementStateToRow(item) {
    return {
      id: item.id,
      title_ru: item.titleRu,
      title_en: item.titleEn ?? null,
      body_ru: item.bodyRu ?? null,
      body_en: item.bodyEn ?? null,
      action_url: item.actionUrl ?? null,
      action_label_ru: item.actionLabelRu ?? null,
      action_label_en: item.actionLabelEn ?? null,
      starts_at: item.startsAt ?? null,
      ends_at: item.endsAt ?? null,
      priority: item.priority ?? 0,
      status: item.status ?? 'published',
      updated_at: new Date().toISOString(),
    };
  }

  function releaseRowToState(row) {
    if (!row) {
      return {
        android: {},
        ios: {},
        messageRu: '',
        messageEn: '',
      };
    }
    return {
      android: row.android ?? {},
      ios: row.ios ?? {},
      messageRu: row.message_ru ?? '',
      messageEn: row.message_en ?? '',
    };
  }

  function releaseStateToRow(release) {
    return {
      id: 1,
      android: release.android ?? {},
      ios: release.ios ?? {},
      message_ru: release.messageRu ?? null,
      message_en: release.messageEn ?? null,
      updated_at: new Date().toISOString(),
    };
  }

  async function getSession() {
    const client = getClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signIn(email, password) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  }

  async function signOut() {
    const client = getClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function loadCatalog() {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');

    const [duaResult, releaseResult, manifestResult, announcementsResult, poolsResult] = await Promise.all([
      client.from('dua_items').select('*').order('title', { ascending: true }),
      client.from('app_release').select('*').eq('id', 1).maybeSingle(),
      client.from('content_manifest').select('*').eq('id', 1).maybeSingle(),
      client.from('home_announcements').select('*').order('priority', { ascending: false }),
      client.from('home_daily_pools').select('*').eq('id', 1).maybeSingle(),
    ]);

    if (duaResult.error) throw duaResult.error;
    if (releaseResult.error) throw releaseResult.error;
    if (manifestResult.error) throw manifestResult.error;
    if (announcementsResult.error) throw announcementsResult.error;
    if (poolsResult.error) throw poolsResult.error;

    const items = (duaResult.data ?? []).map(rowToItem);
    const poolsRow = poolsResult.data;
    return {
      support: items.filter((item) => item.category === 'support_dua'),
      general: items.filter((item) => item.category === 'general_dua'),
      release: releaseRowToState(releaseResult.data),
      manifest: manifestResult.data?.remote_dua ?? null,
      homeManifest: manifestResult.data?.remote_home ?? null,
      announcements: (announcementsResult.data ?? []).map(announcementRowToState),
      dailyAyahPool: Array.isArray(poolsRow?.ayah_pool) ? poolsRow.ayah_pool : [],
      dailyDuaPool: Array.isArray(poolsRow?.dua_pool) ? poolsRow.dua_pool : [],
    };
  }

  async function upsertDuaItem(item) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { error } = await client.from('dua_items').upsert(itemToRow(item), { onConflict: 'id' });
    if (error) throw error;
  }

  async function deleteDuaItem(id) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { error } = await client.from('dua_items').delete().eq('id', id);
    if (error) throw error;
  }

  async function upsertHomeAnnouncement(item) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { error } = await client
      .from('home_announcements')
      .upsert(announcementStateToRow(item), { onConflict: 'id' });
    if (error) throw error;
  }

  async function deleteHomeAnnouncement(id) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { error } = await client.from('home_announcements').delete().eq('id', id);
    if (error) throw error;
  }

  async function saveHomeDailyPools(ayahPool, duaPool) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { error } = await client.from('home_daily_pools').upsert(
      {
        id: 1,
        ayah_pool: ayahPool,
        dua_pool: duaPool,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) throw error;
  }

  async function saveRelease(release) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { error } = await client.from('app_release').upsert(releaseStateToRow(release), { onConflict: 'id' });
    if (error) throw error;
  }

  async function loadAcademyCourseFeedback() {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');

    const fullSelect =
      'id,course_id,lesson_id,rating,comment,display_name,client_id,locale,app_version,platform,created_at,updated_at';
    const legacySelect = 'id,course_id,lesson_id,rating,comment,locale,app_version,platform,created_at';

    let result = await client
      .from('academy_course_feedback')
      .select(fullSelect)
      .order('created_at', { ascending: false })
      .limit(200);

    if (result.error && /column/i.test(result.error.message)) {
      result = await client
        .from('academy_course_feedback')
        .select(legacySelect)
        .order('created_at', { ascending: false })
        .limit(200);
    }

    if (result.error) throw result.error;
    return result.data ?? [];
  }

  async function loadAnalyticsEvents() {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const EVENT_LIMIT = 5000;
    const result = await client
      .from('analytics_events')
      .select('id,event,props,installation_id,app_version,platform,locale,created_at')
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    return { rows, limit: EVENT_LIMIT, truncated: rows.length >= EVENT_LIMIT };
  }

  async function loadAnalyticsInstallations() {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const LIST_LIMIT = 20000;
    const [listResult, countResult] = await Promise.all([
      client
        .from('analytics_installations')
        .select('installation_id,first_seen_at,last_seen_at,platform,app_version,locale')
        .order('last_seen_at', { ascending: false })
        .limit(LIST_LIMIT),
      client
        .from('analytics_installations')
        .select('installation_id', { count: 'exact', head: true }),
    ]);
    if (listResult.error) throw listResult.error;
    if (countResult.error) throw countResult.error;
    const rows = listResult.data ?? [];
    const total = typeof countResult.count === 'number' ? countResult.count : rows.length;
    return { rows, total };
  }

  /**
   * Server-side product dashboard (full tables, not last-5000 events).
   * Requires admin/supabase-migration-analytics-dashboard.sql
   */
  async function loadAnalyticsDashboard(days = 7) {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');
    const { data, error } = await client.rpc('analytics_dashboard', {
      p_days: Number(days) || 0,
    });
    if (error) throw error;
    return data && typeof data === 'object' ? data : null;
  }

  async function loadAnalyticsAllTimeInstallCount() {
    const client = getClient();
    if (!client) throw new Error('Supabase не настроен');

    const rpc = await client.rpc('analytics_all_time_install_count');
    if (!rpc.error && rpc.data != null) {
      const n = Number(rpc.data);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }

    let registryCount = 0;
    try {
      const counted = await client
        .from('analytics_installations')
        .select('installation_id', { count: 'exact', head: true });
      if (!counted.error && typeof counted.count === 'number') registryCount = counted.count;
    } catch {
      // table may be missing
    }

    const ids = new Set();
    const page = 1000;
    for (let from = 0; from < 300000; from += page) {
      const { data, error } = await client
        .from('analytics_events')
        .select('installation_id')
        .order('created_at', { ascending: true })
        .range(from, from + page - 1);
      if (error) {
        if (/does not exist|relation/i.test(error.message)) break;
        throw error;
      }
      if (!data?.length) break;
      for (const row of data) {
        if (row.installation_id) ids.add(row.installation_id);
      }
      if (data.length < page) break;
    }

    return Math.max(registryCount, ids.size);
  }

  async function loadRuStoreVersion() {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Нужен вход в Supabase');

    const url = config.rustoreVersionUrl;
    if (!url) throw new Error('Не задан rustoreVersionUrl в supabase-config.js');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.anonKey || '',
      },
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || `RuStore version failed (${response.status})`);
    }
    return json;
  }

  async function syncAppRelease() {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Нужен вход в Supabase');

    const url = config.syncAppReleaseUrl;
    if (!url) throw new Error('Не задан syncAppReleaseUrl в supabase-config.js');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: config.anonKey || '',
      },
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || `Sync app release failed (${response.status})`);
    }
    return json;
  }

  async function callStoreDownloads(payload, query = '', opts = {}) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Нужен вход в Supabase');
    const url = config.storeDownloadsUrl;
    if (!url) throw new Error('Не задан storeDownloadsUrl в supabase-config.js');

    const timeoutMs = Number(opts.timeoutMs) || (payload?.action === 'refresh-apple' ? 90000 : 45000);
    const attempts = payload?.action === 'refresh-apple' ? 2 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
      try {
        const response = await fetch(`${url}${query}`, {
          method: payload ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: config.anonKey || '',
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
          },
          cache: 'no-store',
          body: payload ? JSON.stringify(payload) : undefined,
          signal: controller ? controller.signal : undefined,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(json.error || `Store downloads failed (${response.status})`);
        }
        return json;
      } catch (error) {
        const aborted = error && (error.name === 'AbortError' || /abort/i.test(String(error.message || '')));
        lastError = aborted
          ? new Error(
              payload?.action === 'refresh-apple'
                ? 'Apple не ответил вовремя. На iPhone так бывает — нажмите «Обновить» ещё раз, не уходя со страницы.'
                : 'Сервер не ответил вовремя. Попробуйте ещё раз.'
            )
          : error;
        // One retry only for flaky mobile networks on Apple refresh.
        if (attempt >= attempts || aborted) break;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw lastError || new Error('Store downloads failed');
  }

  async function loadStoreDownloads() {
    return callStoreDownloads(null);
  }

  async function uploadRustoreCsv(csv) {
    return callStoreDownloads({ action: 'upload-rustore', csv });
  }

  async function refreshAppleDownloads() {
    return callStoreDownloads({ action: 'refresh-apple' });
  }

  async function publishContent(payload) {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Нужен вход в Supabase');

    const publishUrl = config.publishFunctionUrl;
    if (!publishUrl) throw new Error('Не задан publishFunctionUrl в supabase-config.js');

    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.error || `Публикация не удалась (${response.status})`);
    }
    return json;
  }

  global.AdminSupabase = {
    isEnabled,
    getClient,
    getSession,
    signIn,
    signOut,
    loadCatalog,
    upsertDuaItem,
    deleteDuaItem,
    upsertHomeAnnouncement,
    deleteHomeAnnouncement,
    saveHomeDailyPools,
    saveRelease,
    publishContent,
    loadAcademyCourseFeedback,
    loadAnalyticsEvents,
    loadAnalyticsInstallations,
    loadAnalyticsDashboard,
    loadAnalyticsAllTimeInstallCount,
    loadRuStoreVersion,
    syncAppRelease,
    loadStoreDownloads,
    uploadRustoreCsv,
    refreshAppleDownloads,
  };
})(window);
