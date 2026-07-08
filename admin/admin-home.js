(function initAdminHome(global) {
  const ANNOUNCEMENT_CORE_FIELDS = [
    {
      key: 'titleRu',
      label: 'Заголовок',
      full: true,
      required: true,
      hint: 'Жирная строка на баннере. Обязательно.',
    },
    {
      key: 'bodyRu',
      label: 'Текст',
      full: true,
      textarea: true,
      hint: 'Под заголовком. Можно оставить пустым.',
    },
    {
      key: 'startsAt',
      label: 'Показывать с',
      type: 'date',
      hint: 'Пусто — сразу после публикации.',
    },
    {
      key: 'endsAt',
      label: 'Показывать до',
      type: 'date',
      hint: 'Пусто — без срока, пока не уберёте баннер.',
    },
  ];

  const ANNOUNCEMENT_LINK_FIELDS = [
    {
      key: 'actionUrl',
      label: 'Ссылка',
      full: true,
      hint: 'RuStore, waydean.ru, Telegram и т.п.',
    },
    {
      key: 'actionLabelRu',
      label: 'Подпись кнопки',
      hint: 'Если пусто — в приложении будет «Подробнее».',
    },
  ];

  const ANNOUNCEMENT_EN_FIELDS = [
    { key: 'titleEn', label: 'Title (English)', full: true },
    { key: 'bodyEn', label: 'Text (English)', full: true, textarea: true },
    { key: 'actionLabelEn', label: 'Button label (English)' },
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

  function formatDateLabel(value) {
    if (!value?.trim()) return 'без срока';
    const parts = value.trim().split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return value.trim();
  }

  function createAnnouncementField(field, item) {
    const label = document.createElement('label');
    label.className = `admin-field-label${field.full ? ' admin-full' : ''}`;

    const title = document.createElement('span');
    title.className = 'admin-field-label-text';
    title.textContent = field.label;
    label.append(title);

    if (field.hint) {
      const hint = document.createElement('p');
      hint.className = 'admin-field-hint';
      hint.textContent = field.hint;
      label.append(hint);
    }

    let input;
    if (field.textarea) {
      input = document.createElement('textarea');
      input.rows = 4;
      input.value = item[field.key] ?? '';
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.value = item[field.key] ?? '';
    }
    input.name = field.key;
    if (field.required) input.required = true;
    label.append(input);
    return label;
  }

  function appendAnnouncementFields(container, fields, item) {
    for (const field of fields) {
      container.append(createAnnouncementField(field, item));
    }
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
      container.innerHTML = '<p class="admin-muted admin-empty">Пока нет баннеров.</p>';
      return;
    }

    for (const item of items) {
      const card = document.createElement('article');
      card.className = 'admin-item';
      card.innerHTML = `
        <div>
          <h3>${item.titleRu || item.id}</h3>
          <p>${(item.bodyRu || '').slice(0, 140)}</p>
          <p class="admin-muted">${formatDateLabel(item.startsAt)} → ${formatDateLabel(item.endsAt)}</p>
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
            `Удалить баннер «${item.titleRu || item.id}»?\n\nПосле удаления нажмите «Опубликовать на сайте».`
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

    api.$('#announcement-editor-title').textContent = id ? 'Редактирование баннера' : 'Новый баннер';
    const fields = api.$('#announcement-editor-fields');
    fields.innerHTML = '';

    appendAnnouncementFields(fields, ANNOUNCEMENT_CORE_FIELDS, item);

    const linkDetails = document.createElement('details');
    linkDetails.className = 'admin-details admin-full';
    linkDetails.innerHTML = '<summary>Кнопка со ссылкой (необязательно)</summary>';
    const linkGrid = document.createElement('div');
    linkGrid.className = 'admin-details-grid';
    appendAnnouncementFields(linkGrid, ANNOUNCEMENT_LINK_FIELDS, item);
    linkDetails.append(linkGrid);
    fields.append(linkDetails);

    const enDetails = document.createElement('details');
    enDetails.className = 'admin-details admin-full';
    enDetails.innerHTML = '<summary>English (необязательно)</summary>';
    const enGrid = document.createElement('div');
    enGrid.className = 'admin-details-grid';
    appendAnnouncementFields(enGrid, ANNOUNCEMENT_EN_FIELDS, item);
    enDetails.append(enGrid);
    fields.append(enDetails);

    api.$('#announcement-editor-dialog').showModal();
  }

  function closeAnnouncementEditor() {
    api.$('#announcement-editor-dialog').close();
    editingAnnouncementId = '';
  }

  async function saveAnnouncementEditor(formData) {
    const titleRu = String(formData.get('titleRu') || '').trim();
    if (!titleRu) {
      window.alert('Заполните заголовок.');
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
      priority: editingAnnouncementId
        ? api.state.announcements.find((entry) => entry.id === editingAnnouncementId)?.priority ?? 0
        : 0,
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

  function bindClick(selector, handler) {
    const element = document.querySelector(selector);
    if (!element) {
      console.warn(`AdminHome: element not found: ${selector}`);
      return;
    }
    element.addEventListener('click', handler);
  }

  function bind(homeApi) {
    api = homeApi;

    bindClick('#add-announcement', () => openAnnouncementEditor(''));
    bindClick('#announcement-editor-close', closeAnnouncementEditor);

    const announcementForm = document.querySelector('#announcement-editor-form');
    if (announcementForm) {
      announcementForm.addEventListener('submit', (event) => {
        event.preventDefault();
        void saveAnnouncementEditor(new FormData(event.currentTarget));
      });
    }

    bindClick('#save-daily-pools', () => {
      void saveDailyPoolsFromForm();
    });
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
