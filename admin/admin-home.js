(function initAdminHome(global) {
  const ANNOUNCEMENT_FIELDS = [
    { key: 'titleRu', label: 'Заголовок RU', full: false, required: true },
    { key: 'titleEn', label: 'Title EN', full: false },
    { key: 'bodyRu', label: 'Текст RU', full: true, textarea: true },
    { key: 'bodyEn', label: 'Text EN', full: true, textarea: true },
    { key: 'actionUrl', label: 'Ссылка (необязательно)', full: true },
    { key: 'actionLabelRu', label: 'Кнопка RU', full: false },
    { key: 'actionLabelEn', label: 'Button EN', full: false },
    { key: 'startsAt', label: 'Начало (YYYY-MM-DD)', full: false },
    { key: 'endsAt', label: 'Конец (YYYY-MM-DD)', full: false },
    { key: 'priority', label: 'Приоритет', full: false, number: true },
  ];

  let api = null;
  let editingAnnouncementId = '';

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function generateAnnouncementId(title, reservedIds) {
    const seed = slugify(title) || 'announcement';
    let candidate = seed;
    let suffix = 2;
    while (reservedIds.has(candidate)) {
      candidate = `${seed}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function publishedAnnouncements(state) {
    return state.announcements.filter((item) => item.status !== 'draft');
  }

  function buildHomeManifest(state) {
    const current = state.homeManifest ?? {};
    const announcements = publishedAnnouncements(state);
    return {
      version: typeof current.version === 'number' ? current.version + 1 : 1,
      publishedAt: new Date().toISOString(),
      packs: {
        announcements: {
          version:
            typeof current.packs?.announcements?.version === 'number'
              ? current.packs.announcements.version + 1
              : 1,
          url: '/data/home-announcements.json',
          itemCount: announcements.length,
        },
        daily_ayah_pool: {
          version:
            typeof current.packs?.daily_ayah_pool?.version === 'number'
              ? current.packs.daily_ayah_pool.version + 1
              : 1,
          url: '/data/daily-ayah-pool.json',
          itemCount: state.dailyAyahPool.length,
        },
        daily_dua_pool: {
          version:
            typeof current.packs?.daily_dua_pool?.version === 'number'
              ? current.packs.daily_dua_pool.version + 1
              : 1,
          url: '/data/daily-dua-pool.json',
          itemCount: state.dailyDuaPool.length,
        },
      },
    };
  }

  function serializeAnnouncements(state) {
    return publishedAnnouncements(state).map((item) => ({
      id: item.id,
      titleRu: item.titleRu,
      titleEn: item.titleEn || undefined,
      bodyRu: item.bodyRu || undefined,
      bodyEn: item.bodyEn || undefined,
      actionUrl: item.actionUrl || undefined,
      actionLabelRu: item.actionLabelRu || undefined,
      actionLabelEn: item.actionLabelEn || undefined,
      startsAt: item.startsAt || undefined,
      endsAt: item.endsAt || undefined,
      priority: item.priority ?? 0,
    }));
  }

  function renderAnnouncementList() {
    const container = api.$('#announcement-list');
    const items = api.state.announcements;
    container.innerHTML = '';

    if (!items.length) {
      container.innerHTML = '<p class="admin-muted">Пока нет объявлений.</p>';
      return;
    }

    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'admin-item';
      card.innerHTML = `
        <div>
          <h3>${item.titleRu || item.id}</h3>
          <p>${(item.bodyRu || '').slice(0, 140)}</p>
          <p class="admin-muted">${item.startsAt || 'без даты'} → ${item.endsAt || 'без даты'} · priority ${item.priority ?? 0}</p>
        </div>
      `;

      const actions = document.createElement('div');
      actions.className = 'admin-item-actions';

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'admin-button';
      editButton.textContent = 'Изменить';
      editButton.addEventListener('click', () => openAnnouncementEditor(item.id));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'admin-button admin-button-danger';
      deleteButton.textContent = 'Удалить';
      deleteButton.addEventListener('click', () => {
        if (
          !window.confirm(
            `Удалить объявление «${item.titleRu || item.id}»?\n\nПосле удаления нажмите «Опубликовать на waydean.ru».`
          )
        ) {
          return;
        }
        void (async () => {
          try {
            await global.AdminSupabase.deleteHomeAnnouncement(item.id);
            api.state.announcements = api.state.announcements.filter((entry) => entry.id !== item.id);
            renderAnnouncementList();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Не удалось удалить объявление.');
          }
        })();
      });

      actions.append(editButton, deleteButton);
      card.append(actions);
      container.append(card);
    }
  }

  function renderDailyPools() {
    api.$('#daily-ayah-pool').value = JSON.stringify(api.state.dailyAyahPool, null, 2);
    api.$('#daily-dua-pool').value = JSON.stringify(api.state.dailyDuaPool, null, 2);
  }

  function renderAll() {
    renderAnnouncementList();
    renderDailyPools();
  }

  function openAnnouncementEditor(id) {
    editingAnnouncementId = id;
    const item = id
      ? api.state.announcements.find((entry) => entry.id === id)
      : {
          titleRu: '',
          titleEn: '',
          bodyRu: '',
          bodyEn: '',
          actionUrl: '',
          actionLabelRu: '',
          actionLabelEn: '',
          startsAt: '',
          endsAt: '',
          priority: 0,
        };

    api.$('#announcement-editor-title').textContent = id ? 'Редактирование объявления' : 'Новое объявление';
    const fields = api.$('#announcement-editor-fields');
    fields.innerHTML = '';

    for (const field of ANNOUNCEMENT_FIELDS) {
      const label = document.createElement('label');
      label.className = `admin-field-label${field.full ? ' admin-full' : ''}`;
      label.textContent = field.label;

      let input;
      if (field.textarea) {
        input = document.createElement('textarea');
        input.value = item[field.key] ?? '';
      } else {
        input = document.createElement('input');
        input.type = field.number ? 'number' : 'text';
        input.value = item[field.key] ?? (field.number ? 0 : '');
      }
      input.name = field.key;
      if (field.required) input.required = true;
      label.append(input);
      fields.append(label);
    }

    api.$('#announcement-editor-dialog').showModal();
  }

  function closeAnnouncementEditor() {
    api.$('#announcement-editor-dialog').close();
    editingAnnouncementId = '';
  }

  async function saveAnnouncementEditor(formData) {
    const titleRu = String(formData.get('titleRu') || '').trim();
    if (!titleRu) {
      window.alert('Заполните заголовок RU.');
      return;
    }

    const reservedIds = new Set(api.state.announcements.map((entry) => entry.id));
    if (editingAnnouncementId) reservedIds.delete(editingAnnouncementId);

    const nextItem = {
      id: editingAnnouncementId || generateAnnouncementId(titleRu, reservedIds),
      titleRu,
      titleEn: String(formData.get('titleEn') || '').trim() || undefined,
      bodyRu: String(formData.get('bodyRu') || '').trim() || undefined,
      bodyEn: String(formData.get('bodyEn') || '').trim() || undefined,
      actionUrl: String(formData.get('actionUrl') || '').trim() || undefined,
      actionLabelRu: String(formData.get('actionLabelRu') || '').trim() || undefined,
      actionLabelEn: String(formData.get('actionLabelEn') || '').trim() || undefined,
      startsAt: String(formData.get('startsAt') || '').trim() || undefined,
      endsAt: String(formData.get('endsAt') || '').trim() || undefined,
      priority: Number(formData.get('priority')) || 0,
      status: 'published',
    };

    try {
      await global.AdminSupabase.upsertHomeAnnouncement(nextItem);
      const list = api.state.announcements.filter((entry) => entry.id !== nextItem.id);
      list.push(nextItem);
      list.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.titleRu.localeCompare(right.titleRu, 'ru'));
      api.state.announcements = list;
      renderAnnouncementList();
      closeAnnouncementEditor();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить объявление.');
    }
  }

  async function saveDailyPoolsFromForm() {
    let ayahPool;
    let duaPool;
    try {
      ayahPool = JSON.parse(api.$('#daily-ayah-pool').value);
      duaPool = JSON.parse(api.$('#daily-dua-pool').value);
    } catch {
      window.alert('Проверьте JSON в пулах дня.');
      return;
    }

    if (!Array.isArray(ayahPool) || !Array.isArray(duaPool)) {
      window.alert('Пулы должны быть JSON-массивами.');
      return;
    }

    try {
      await global.AdminSupabase.saveHomeDailyPools(ayahPool, duaPool);
      api.state.dailyAyahPool = ayahPool;
      api.state.dailyDuaPool = duaPool;
      api.$('#home-pools-status').textContent = 'Пулы сохранены в Supabase.';
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить пулы.');
    }
  }

  function bind(homeApi) {
    api = homeApi;

    api.$('#add-announcement').addEventListener('click', () => openAnnouncementEditor(''));
    api.$('#announcement-editor-close').addEventListener('click', closeAnnouncementEditor);
    api.$('#announcement-editor-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void saveAnnouncementEditor(new FormData(event.currentTarget));
    });
    api.$('#save-daily-pools').addEventListener('click', () => {
      void saveDailyPoolsFromForm();
    });
    api.$('#download-home-announcements').addEventListener('click', () =>
      api.downloadJson('home-announcements.json', serializeAnnouncements(api.state))
    );
    api.$('#download-daily-ayah-pool').addEventListener('click', () =>
      api.downloadJson('daily-ayah-pool.json', api.state.dailyAyahPool)
    );
    api.$('#download-daily-dua-pool').addEventListener('click', () =>
      api.downloadJson('daily-dua-pool.json', api.state.dailyDuaPool)
    );
  }

  global.AdminHome = {
    bind,
    renderAll,
    buildHomeManifest,
    serializeAnnouncements,
    applyCatalog(state, catalog) {
      state.announcements = catalog.announcements ?? [];
      state.dailyAyahPool = catalog.dailyAyahPool ?? [];
      state.dailyDuaPool = catalog.dailyDuaPool ?? [];
      state.homeManifest = catalog.homeManifest ?? null;
    },
    extendState(state) {
      state.announcements = state.announcements ?? [];
      state.dailyAyahPool = state.dailyAyahPool ?? [];
      state.dailyDuaPool = state.dailyDuaPool ?? [];
      state.homeManifest = state.homeManifest ?? null;
      return state;
    },
  };
})(window);
