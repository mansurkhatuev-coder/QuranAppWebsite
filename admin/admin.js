function isSupabaseReady() {
  return Boolean(window.AdminSupabase?.isEnabled?.());
}

const state = {
  support: [],
  general: [],
  announcements: [],
  dailyAyahPool: [],
  dailyDuaPool: [],
  manifest: null,
  homeManifest: null,
  release: null,
  editing: null,
};

const PACKS = {
  support: {
    listId: 'support-list',
    category: 'support_dua',
    fileName: 'support-dua.json',
    manifestKey: 'support_dua',
  },
  general: {
    listId: 'general-list',
    category: 'general_dua',
    fileName: 'general-dua.json',
    manifestKey: 'general_dua',
  },
};

const AUTHENTICITY_OPTIONS = [
  { value: 'quran', label: 'Коран (quran)' },
  { value: 'sahih', label: 'Достоверный (sahih)' },
  { value: 'hasan', label: 'Хороший (hasan)' },
  { value: 'disputed', label: 'Есть разногласия (disputed)' },
  { value: 'weak', label: 'Слабый (weak)' },
];

const IMPORTANCE_OPTIONS = [
  { value: 'core', label: 'Основное (core)' },
  { value: 'recommended', label: 'Рекомендуемое (recommended)' },
  { value: 'extra', label: 'Дополнительное (extra)' },
];

const FIELD_HINTS = {
  title: 'Полный заголовок в карточке и списке.',
  navTitle: 'Короткий заголовок для навигации и узких экранов.',
  text: 'Арабский текст дуа. Обязательное поле.',
  transliteration: 'Произношение латиницей или на чеченском — как в приложении.',
  targetCount: 'Сколько раз рекомендуется прочитать (счётчик в приложении).',
  group: 'Группа в списке, например «За угнетённых».',
  authenticity: 'Степень достоверности. В режиме «Проверенные» слабые и спорные скрываются.',
  importance: 'Приоритет в подборках. core — главные дуа раздела.',
  tags: 'Теги через запятую: palestine, distress, daily. Используются для фильтрации.',
  sourceSummary: 'Краткий источник: книга, сура, хадис или «Общая мольба».',
  sourceUrl: 'Ссылка на sunnah.com, quran.com и т.п.',
  benefitSummary: 'Зачем читать это дуа — польза или контекст.',
  benefitSource: 'Откуда взято пояснение о пользе.',
  benefitUrl: 'Ссылка на источник пользы (необязательно).',
};

const EDITOR_FIELDS = [
  { key: 'title', label: 'Заголовок', full: false },
  { key: 'navTitle', label: 'Короткий заголовок', full: false },
  { key: 'text', label: 'Арабский текст', full: true, textarea: true },
  { key: 'transliteration', label: 'Транслитерация', full: true, textarea: true },
  { key: 'targetCount', label: 'Количество', full: false, number: true },
  { key: 'group', label: 'Группа', full: false },
  { key: 'authenticity', label: 'Достоверность', full: false, select: AUTHENTICITY_OPTIONS },
  { key: 'importance', label: 'Важность', full: false, select: IMPORTANCE_OPTIONS },
  { key: 'tags', label: 'Теги через запятую', full: true },
  { key: 'sourceSummary', label: 'Источник (кратко)', full: false },
  { key: 'sourceUrl', label: 'Ссылка на источник', full: true },
  { key: 'benefitSummary', label: 'Польза / пояснение', full: true, textarea: true },
  { key: 'benefitSource', label: 'Источник пользы', full: false },
  { key: 'benefitUrl', label: 'Ссылка на пользу', full: true },
];

function $(selector) {
  return document.querySelector(selector);
}

function closeOpenHints(exceptButton = null) {
  document.querySelectorAll('.admin-hint-popover.is-open').forEach((popover) => {
    const button = popover.closest('.admin-field-label')?.querySelector('.admin-hint-button');
    if (button && button === exceptButton) return;
    popover.classList.remove('is-open');
    if (button) button.setAttribute('aria-expanded', 'false');
  });
}

function createFieldLabel(field) {
  const label = document.createElement('label');
  label.className = `admin-field-label${field.full ? ' admin-full' : ''}`;

  const row = document.createElement('div');
  row.className = 'admin-field-label-row';

  const title = document.createElement('span');
  title.className = 'admin-field-label-text';
  title.textContent = field.label;
  row.append(title);

  const hintText = FIELD_HINTS[field.key];
  if (hintText) {
    const hintWrap = document.createElement('div');
    hintWrap.className = 'admin-hint-wrap';

    const hintButton = document.createElement('button');
    hintButton.type = 'button';
    hintButton.className = 'admin-hint-button';
    hintButton.setAttribute('aria-label', `Подсказка: ${field.label}`);
    hintButton.setAttribute('aria-expanded', 'false');
    hintButton.textContent = '?';

    const popover = document.createElement('div');
    popover.className = 'admin-hint-popover';
    popover.setAttribute('role', 'tooltip');
    popover.textContent = hintText;

    hintButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !popover.classList.contains('is-open');
      closeOpenHints(hintButton);
      popover.classList.toggle('is-open', willOpen);
      hintButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    hintWrap.append(hintButton, popover);
    row.append(hintWrap);
  }

  label.append(row);
  return label;
}

document.addEventListener('click', () => closeOpenHints());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOpenHints();
});

function downloadJson(fileName, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const CYRILLIC_TO_LATIN = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function transliterateCyrillic(value) {
  return value
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('');
}

function categoryIdPrefix(category) {
  return category === 'support_dua' ? 'support' : 'general';
}

function idSeedFromForm(form) {
  for (const source of [form.transliteration, form.title, form.navTitle]) {
    const slug = slugify(transliterateCyrillic(source));
    if (slug) return slug;
  }
  return 'dua';
}

function generateDuaId(form, category, reservedIds) {
  const prefix = categoryIdPrefix(category);
  const seed = idSeedFromForm(form);
  let candidate = `${prefix}-${seed}`.slice(0, 64);
  if (!reservedIds.has(candidate)) return candidate;

  let suffix = 2;
  while (reservedIds.has(`${candidate}-${suffix}`)) {
    suffix += 1;
  }
  return `${candidate}-${suffix}`;
}

function translationsFromItem(item) {
  const rows = [];
  if (item.translation?.trim()) {
    rows.push({ label: 'Русский перевод', text: item.translation.trim() });
  }
  if (item.translationChechen?.trim()) {
    rows.push({ label: 'Чеченский перевод', text: item.translationChechen.trim() });
  }
  if (Array.isArray(item.extraTranslations)) {
    for (const entry of item.extraTranslations) {
      const text = entry?.text?.trim();
      if (!text) continue;
      rows.push({
        label: entry.label?.trim() || 'Перевод',
        text,
      });
    }
  }
  if (rows.length === 0) {
    rows.push({ label: 'Русский перевод', text: '' });
  }
  return rows;
}

function translationsToItemFields(rows) {
  let translation;
  let translationChechen;
  const extraTranslations = [];

  const normalized = rows
    .map((row) => ({
      label: (row.label || 'Перевод').trim(),
      text: (row.text || '').trim(),
    }))
    .filter((row) => row.text);

  for (const row of normalized) {
    const lower = row.label.toLowerCase();
    if (!translation && (lower.includes('рус') || lower === 'перевод')) {
      translation = row.text;
      continue;
    }
    if (!translationChechen && lower.includes('чечен')) {
      translationChechen = row.text;
      continue;
    }
    extraTranslations.push({ label: row.label, text: row.text });
  }

  if (!translation && normalized.length === 1 && !normalized[0].label.toLowerCase().includes('чечен')) {
    translation = normalized[0].text;
    return {
      translation,
      translationChechen: undefined,
      extraTranslations: undefined,
    };
  }

  return {
    translation,
    translationChechen,
    extraTranslations: extraTranslations.length > 0 ? extraTranslations : undefined,
  };
}

function collectTranslationRows() {
  const container = $('#editor-translations');
  if (!container) return [];
  return [...container.querySelectorAll('.admin-translation-row')].map((row) => ({
    label: row.querySelector('[data-field="label"]')?.value ?? '',
    text: row.querySelector('[data-field="text"]')?.value ?? '',
  }));
}

function createTranslationRow(row, { canRemove }) {
  const article = document.createElement('article');
  article.className = 'admin-translation-row admin-full';

  const header = document.createElement('div');
  header.className = 'admin-translation-row-header';

  const labelField = document.createElement('label');
  labelField.className = 'admin-translation-label-field';
  labelField.textContent = 'Язык / подпись';
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'Например: Чеченский перевод';
  labelInput.value = row.label ?? '';
  labelInput.dataset.field = 'label';
  labelField.append(labelInput);

  if (canRemove) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'admin-button admin-button-ghost admin-translation-remove';
    removeButton.textContent = 'Удалить';
    removeButton.addEventListener('click', () => {
      article.remove();
    });
    header.append(labelField, removeButton);
  } else {
    header.append(labelField);
  }

  const textField = document.createElement('label');
  textField.className = 'admin-translation-text-field admin-full';
  textField.textContent = 'Текст перевода';
  const textInput = document.createElement('textarea');
  textInput.rows = 4;
  textInput.value = row.text ?? '';
  textInput.dataset.field = 'text';
  textField.append(textInput);

  article.append(header, textField);
  return article;
}

function renderTranslationFields(item) {
  const fields = $('#editor-fields');
  const section = document.createElement('section');
  section.id = 'editor-translations';
  section.className = 'admin-translations admin-full';

  const heading = document.createElement('div');
  heading.className = 'admin-translation-heading';
  heading.innerHTML = `
    <div>
      <p class="admin-field-label-text">Переводы</p>
      <p class="admin-muted">Подпись видна в приложении над текстом. «Русский» и «Чеченский» — стандартные поля.</p>
    </div>
  `;

  const list = document.createElement('div');
  list.className = 'admin-translation-list';

  const rows = translationsFromItem(item);
  rows.forEach((row, index) => {
    list.append(createTranslationRow(row, { canRemove: index > 0 }));
  });

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'admin-button';
  addButton.textContent = '+ Добавить перевод';
  addButton.addEventListener('click', () => {
    list.append(createTranslationRow({ label: '', text: '' }, { canRemove: true }));
  });

  section.append(heading, list, addButton);
  fields.append(section);
}

function tagsToString(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function tagsFromString(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function itemToForm(item) {
  return {
    title: item.title ?? '',
    navTitle: item.navTitle ?? '',
    text: item.text ?? '',
    transliteration: item.transliteration ?? '',
    targetCount: item.targetCount ?? 3,
    group: item.group ?? '',
    authenticity: item.authenticity ?? 'hasan',
    importance: item.importance ?? 'core',
    tags: tagsToString(item.tags),
    sourceSummary: item.source?.book || item.source?.summary || item.source?.type || '',
    sourceUrl: item.source?.url ?? '',
    benefitSummary: item.benefitHadith?.summary ?? '',
    benefitSource: item.benefitHadith?.source ?? '',
    benefitUrl: item.benefitHadith?.url ?? '',
  };
}

function formToItem(form, category, existingId, reservedIds, translationRows) {
  const id = existingId || generateDuaId(form, category, reservedIds);
  const translationFields = translationsToItemFields(translationRows);
  return {
    id,
    title: form.title.trim() || form.navTitle.trim() || id,
    navTitle: form.navTitle.trim() || form.title.trim() || id,
    text: form.text.trim(),
    translation: translationFields.translation,
    translationChechen: translationFields.translationChechen,
    extraTranslations: translationFields.extraTranslations,
    transliteration: form.transliteration.trim() || undefined,
    targetCount: Number(form.targetCount) > 0 ? Number(form.targetCount) : 1,
    audio: [],
    group: form.group.trim() || undefined,
    category,
    authenticity: form.authenticity,
    source: form.sourceSummary.trim() || form.sourceUrl.trim()
      ? {
          type: 'dua',
          book: form.sourceSummary.trim() || undefined,
          url: form.sourceUrl.trim() || undefined,
        }
      : undefined,
    benefitHadith:
      form.benefitSummary.trim() || form.benefitSource.trim() || form.benefitUrl.trim()
        ? {
            summary: form.benefitSummary.trim() || undefined,
            source: form.benefitSource.trim() || undefined,
            url: form.benefitUrl.trim() || undefined,
          }
        : undefined,
    tags: tagsFromString(form.tags),
    importance: form.importance,
    placementFit: category === 'support_dua' ? 'support' : 'general',
  };
}

async function fetchJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

function nextVersion(current) {
  return typeof current === 'number' ? current + 1 : 1;
}

function buildManifest() {
  const current = state.manifest ?? {};
  return {
    version: nextVersion(current.version),
    publishedAt: new Date().toISOString(),
    packs: {
      support_dua: {
        version: nextVersion(current.packs?.support_dua?.version),
        url: '/data/support-dua.json',
        itemCount: state.support.length,
      },
      general_dua: {
        version: nextVersion(current.packs?.general_dua?.version),
        url: '/data/general-dua.json',
        itemCount: state.general.length,
      },
    },
  };
}

function renderList(packKey) {
  const pack = PACKS[packKey];
  const container = document.getElementById(pack.listId);
  const items = state[packKey];
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<p class="admin-muted admin-empty">Пока нет записей.</p>';
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'admin-item';
    card.innerHTML = `
      <div>
        <h3>${item.title || item.id}</h3>
        <p>${(item.translation || item.text || '').slice(0, 140)}</p>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'admin-item-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'admin-button';
    editButton.textContent = 'Изменить';
    editButton.addEventListener('click', () => openEditor(packKey, item.id));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'admin-button admin-button-danger';
    deleteButton.textContent = 'Удалить';
    deleteButton.addEventListener('click', () => {
      const title = item.title || item.id;
      if (
        !window.confirm(
          `Удалить «${title}»?\n\nЗапись исчезнет из Supabase. Чтобы убрать её из приложения, нажмите «Опубликовать на waydean.ru».`
        )
      ) {
        return;
      }
      void (async () => {
        try {
          await window.AdminSupabase.deleteDuaItem(item.id);
          state[packKey] = state[packKey].filter((entry) => entry.id !== item.id);
          renderList(packKey);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Не удалось удалить запись.');
        }
      })();
    });

    actions.append(editButton, deleteButton);
    card.append(actions);
    container.append(card);
  }
}

function renderAllLists() {
  renderList('support');
  renderList('general');
}

function renderReleaseForm() {
  const form = $('#release-form');
  const release = state.release ?? {};
  form.innerHTML = `
    <label>Android version<input name="androidLatestVersion" value="${release.android?.latestVersion ?? ''}" /></label>
    <label>Android versionCode<input name="androidVersionCode" type="number" value="${release.android?.versionCode ?? ''}" /></label>
    <label>RuStore URL<input name="rustoreUrl" value="${release.android?.rustoreUrl ?? ''}" /></label>
    <label>APK URL<input name="apkUrl" value="${release.android?.apkUrl ?? ''}" /></label>
    <label>iOS version<input name="iosLatestVersion" value="${release.ios?.latestVersion ?? ''}" /></label>
    <label>iOS buildNumber<input name="iosBuildNumber" type="number" value="${release.ios?.buildNumber ?? ''}" /></label>
    <label>App Store URL<input name="appStoreUrl" value="${release.ios?.appStoreUrl ?? ''}" /></label>
    <label class="admin-full">Сообщение RU<textarea name="messageRu">${release.messageRu ?? ''}</textarea></label>
    <label class="admin-full">Message EN<textarea name="messageEn">${release.messageEn ?? ''}</textarea></label>
  `;

  form.oninput = () => {
    const data = new FormData(form);
    state.release = {
      android: {
        latestVersion: String(data.get('androidLatestVersion') || '').trim(),
        versionCode: Number(data.get('androidVersionCode')) || undefined,
        rustoreUrl: String(data.get('rustoreUrl') || '').trim(),
        apkUrl: String(data.get('apkUrl') || '').trim(),
      },
      ios: {
        latestVersion: String(data.get('iosLatestVersion') || '').trim(),
        buildNumber: Number(data.get('iosBuildNumber')) || undefined,
        appStoreUrl: String(data.get('appStoreUrl') || '').trim(),
      },
      messageRu: String(data.get('messageRu') || '').trim(),
      messageEn: String(data.get('messageEn') || '').trim(),
    };
    void persistReleaseState().catch(() => {});
  };
}

function openEditor(packKey, itemId) {
  const pack = PACKS[packKey];
  const existing = state[packKey].find((item) => item.id === itemId) ?? {
    id: '',
    category: pack.category,
    authenticity: 'hasan',
    importance: 'core',
    targetCount: 3,
    text: '',
    audio: [],
    tags: [pack.category],
  };

  state.editing = { packKey, itemId, isNew: !itemId };
  $('#editor-title').textContent = itemId ? 'Редактирование дуа' : 'Новая дуа';

  const fields = $('#editor-fields');
  fields.innerHTML = '';
  const formValues = itemToForm(existing);

  for (const field of EDITOR_FIELDS) {
    const label = createFieldLabel(field);

    let input;
    if (field.select) {
      input = document.createElement('select');
      for (const optionValue of field.select) {
        const option = document.createElement('option');
        const value = typeof optionValue === 'string' ? optionValue : optionValue.value;
        option.value = value;
        option.textContent = typeof optionValue === 'string' ? optionValue : optionValue.label;
        if (formValues[field.key] === value) option.selected = true;
        input.append(option);
      }
    } else if (field.textarea) {
      input = document.createElement('textarea');
      input.value = formValues[field.key] ?? '';
    } else {
      input = document.createElement('input');
      input.type = field.number ? 'number' : 'text';
      input.value = formValues[field.key] ?? '';
    }

    input.name = field.key;
    label.append(input);
    fields.append(label);
  }

  renderTranslationFields(existing);

  $('#editor-dialog').showModal();
}

function closeEditor() {
  $('#editor-dialog').close();
  state.editing = null;
}

function saveEditor(formData) {
  const editing = state.editing;
  if (!editing) return;
  const pack = PACKS[editing.packKey];
  const reservedIds = new Set(state[editing.packKey].map((item) => item.id));
  const nextItem = formToItem(
    Object.fromEntries(formData.entries()),
    pack.category,
    editing.isNew ? null : editing.itemId,
    reservedIds,
    collectTranslationRows()
  );
  if (!nextItem.text) {
    window.alert('Арабский текст обязателен.');
    return;
  }

  const list = state[editing.packKey].filter((item) => item.id !== editing.itemId);
  void (async () => {
    try {
        await window.AdminSupabase.upsertDuaItem(nextItem);
      list.push(nextItem);
      list.sort((left, right) => left.title.localeCompare(right.title, 'ru'));
      state[editing.packKey] = list;
      renderList(editing.packKey);
      closeEditor();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить запись.');
    }
  })();
}

function setActiveTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  });
  document.querySelectorAll('.admin-panel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabName;
  });
}

function showApp() {
  $('#login-screen').hidden = true;
  $('#app-screen').hidden = false;
}

function showLogin() {
  void window.AdminSupabase.signOut().catch(() => {});
  $('#login-screen').hidden = false;
  $('#app-screen').hidden = true;
}

async function loadContent() {
  const catalog = await window.AdminSupabase.loadCatalog();
  state.support = catalog.support;
  state.general = catalog.general;
  state.manifest = catalog.manifest;
  state.release = catalog.release;
  if (window.AdminHome) {
    window.AdminHome.applyCatalog(state, catalog);
    window.AdminHome.renderAll();
  }
  renderAllLists();
  renderReleaseForm();
}

async function persistReleaseState() {
  await window.AdminSupabase.saveRelease(state.release);
}

function bindEvents() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#login-error').hidden = true;

    if (!isSupabaseReady()) {
      $('#login-error').textContent = 'Supabase не настроен. Проверьте supabase-config.js на сайте.';
      $('#login-error').hidden = false;
      return;
    }

    try {
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      const submitButton = $('#login-form button[type="submit"]');
      if (!email) {
        $('#login-error').textContent = 'Введите email пользователя из Supabase → Authentication → Users.';
        $('#login-error').hidden = false;
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = 'Вход...';
      await window.AdminSupabase.signIn(email, password);

      showApp();
      await loadContent();
    } catch (error) {
      $('#login-error').hidden = false;
      $('#login-error').textContent =
        error instanceof Error ? error.message : 'Неверный email или пароль Supabase';
    } finally {
      const submitButton = $('#login-form button[type="submit"]');
      submitButton.disabled = !isSupabaseReady();
      submitButton.textContent = 'Войти';
    }
  });

  $('#logout-button').addEventListener('click', showLogin);
  $('#editor-close').addEventListener('click', closeEditor);

  $('#editor-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveEditor(new FormData(event.currentTarget));
  });

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
  });

  document.querySelectorAll('[data-action="add-item"]').forEach((button) => {
    button.addEventListener('click', () => openEditor(button.dataset.pack, ''));
  });

  $('#download-support').addEventListener('click', () => downloadJson('support-dua.json', state.support));
  $('#download-general').addEventListener('click', () => downloadJson('general-dua.json', state.general));
  $('#download-manifest-dua').addEventListener('click', () =>
    downloadJson('remote-dua.manifest.json', buildManifest())
  );
  $('#download-manifest-home').addEventListener('click', () => {
    if (!window.AdminHome) return;
    downloadJson('remote-home.manifest.json', window.AdminHome.buildHomeManifest(state));
  });
  $('#download-release').addEventListener('click', () => downloadJson('app-release.json', state.release));

  $('#publish-site').addEventListener('click', () => {
    void (async () => {
      const status = $('#publish-status');
      status.hidden = false;
      status.textContent = 'Публикация...';
      try {
        await persistReleaseState();
        if (window.AdminHome) {
          await window.AdminSupabase.saveHomeDailyPools(state.dailyAyahPool, state.dailyDuaPool);
        }
        const manifest = buildManifest();
        const homeManifest = window.AdminHome ? window.AdminHome.buildHomeManifest(state) : null;
        const result = await window.AdminSupabase.publishContent({
          supportDua: state.support,
          generalDua: state.general,
          manifest,
          homeManifest,
          homeAnnouncements: window.AdminHome ? window.AdminHome.serializeAnnouncements(state) : [],
          dailyAyahPool: state.dailyAyahPool,
          dailyDuaPool: state.dailyDuaPool,
          appRelease: state.release,
        });
        state.manifest = manifest;
        if (homeManifest) state.homeManifest = homeManifest;
        status.textContent = `Опубликовано: ${result.publishedAt ?? 'ok'}. Файлы обновятся на waydean.ru через 1–2 минуты.`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Ошибка публикации';
      }
    })();
  });
}

async function restoreSession() {
  if (!isSupabaseReady()) return;

  const session = await window.AdminSupabase.getSession().catch(() => null);
  if (session) {
    showApp();
    await loadContent().catch(() => {});
  }
}

function configureLoginUi() {
  const ready = isSupabaseReady();
  $('#login-setup-notice').hidden = ready;
  $('#login-form button[type="submit"]').disabled = !ready;
}

async function init() {
  configureLoginUi();
  bindEvents();
  if (window.AdminHome) {
    window.AdminHome.bind({ $, state, downloadJson });
  }
  await restoreSession();
}

init();
