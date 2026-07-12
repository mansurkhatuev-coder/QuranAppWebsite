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
      'id,course_id,lesson_id,rating,comment,display_name,locale,app_version,platform,created_at,updated_at';
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
  };
})(window);
