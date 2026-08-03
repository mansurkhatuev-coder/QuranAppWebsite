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

const ADMIN_TAB_STORAGE_KEY = 'waydean_admin_active_tab_v1';
const CONTENT_TABS = new Set(['support', 'general', 'home', 'release']);
const listFilters = {
  support: '',
  general: '',
};

const PUBLISH_HELP_BY_TAB = {
  support: 'Изменения в дуа «Поддержка» сохраняются в Supabase сразу. Нажмите «Опубликовать», чтобы обновить JSON на waydean.ru.',
  general: 'Изменения в дуа «На случаи жизни» сохраняются в Supabase сразу. Нажмите «Опубликовать», чтобы обновить JSON на waydean.ru.',
  home: 'Баннеры и пулы «аят/дуа дня» попадут на сайт после публикации. Сначала сохраните пулы, если меняли их.',
  release: 'Версия Store сохранится в Supabase и на waydean.ru/data/app-release.json после публикации.',
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

function bindClick(selector, handler) {
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`Admin: element not found: ${selector}`);
    return false;
  }
  element.addEventListener('click', handler);
  return true;
}

function showInitError(error) {
  const banner = $('#admin-init-error');
  if (!banner) return;
  banner.hidden = false;
  banner.textContent =
    error instanceof Error
      ? `Ошибка инициализации админки: ${error.message}`
      : 'Ошибка инициализации админки.';
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
      updateEditorPreview();
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
    updateEditorPreview();
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
  const query = (listFilters[packKey] || '').trim().toLowerCase();
  const items = !query
    ? state[packKey]
    : state[packKey].filter((item) => {
        const haystack = [
          item.id,
          item.title,
          item.navTitle,
          item.translation,
          item.text,
          item.transliteration,
          ...(Array.isArray(item.tags) ? item.tags : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
  container.innerHTML = '';

  if (!items.length) {
    if (!query) {
      container.innerHTML = '<p class="admin-muted admin-empty">Пока нет записей.</p>';
      return;
    }
    const empty = document.createElement('p');
    empty.className = 'admin-muted admin-empty';
    empty.textContent = `Ничего не найдено по запросу «${query}».`;
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'admin-item';
    const preview = (item.translation || item.text || '').slice(0, 140);
    card.innerHTML = `
      <div class="admin-item-main">
        <h3>${item.title || item.id}</h3>
        <p class="admin-item-meta">${item.id}${item.category ? ` · ${item.category}` : ''}</p>
        <p class="admin-item-preview">${preview}</p>
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
  const rustore = release.android?.rustore ?? {};
  const apk = release.android?.apk ?? {};
  form.innerHTML = `
    <div class="admin-full admin-release-toolbar">
      <button type="button" id="release-pull-rustore" class="admin-button">Обновить из сторов сейчас</button>
      <p id="release-rustore-status" class="admin-muted">Автопроверка сторов каждые несколько секунд — кнопка не обязательна.</p>
    </div>
    <label>RuStore version<input name="rustoreLatestVersion" value="${rustore.latestVersion ?? release.android?.latestVersion ?? ''}" /></label>
    <label>RuStore versionCode<input name="rustoreVersionCode" type="number" value="${rustore.versionCode ?? release.android?.versionCode ?? ''}" /></label>
    <label>RuStore URL<input name="rustoreUrl" value="${rustore.url ?? release.android?.rustoreUrl ?? ''}" /></label>
    <label>APK version<input name="apkLatestVersion" value="${apk.latestVersion ?? release.android?.latestVersion ?? ''}" /></label>
    <label>APK versionCode<input name="apkVersionCode" type="number" value="${apk.versionCode ?? release.android?.versionCode ?? ''}" /></label>
    <label>APK URL<input name="apkUrl" value="${apk.url ?? release.android?.apkUrl ?? ''}" /></label>
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
        rustore: {
          latestVersion: String(data.get('rustoreLatestVersion') || '').trim(),
          versionCode: Number(data.get('rustoreVersionCode')) || undefined,
          url: String(data.get('rustoreUrl') || '').trim(),
        },
        apk: {
          latestVersion: String(data.get('apkLatestVersion') || '').trim(),
          versionCode: Number(data.get('apkVersionCode')) || undefined,
          url: String(data.get('apkUrl') || '').trim(),
        },
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

  const pullBtn = form.querySelector('#release-pull-rustore');
  const statusEl = form.querySelector('#release-rustore-status');
  if (pullBtn) {
    pullBtn.addEventListener('click', () => {
      void (async () => {
        await syncReleaseFormFromStores({ force: true, statusEl, form });
        if (!window.AdminSupabase?.syncAppRelease) return;

        if (statusEl) statusEl.textContent = 'Синхронизация app-release.json…';
        const result = await window.AdminSupabase.syncAppRelease();
        if (result?.release) {
          state.release = result.release;
          await persistReleaseState().catch(() => {});
          renderReleaseForm();
        }

        const nextStatus = $('#release-rustore-status');
        if (nextStatus) {
          const changed = result?.changed ?? {};
          nextStatus.textContent =
            changed.ios || changed.rustore
              ? 'app-release.json обновлён на GitHub.'
              : 'app-release.json уже актуален.';
        }
      })().catch((error) => {
        const nextStatus = $('#release-rustore-status') || statusEl;
        if (nextStatus) {
          nextStatus.textContent =
            error instanceof Error ? error.message : 'Не удалось синхронизировать app-release.json';
        }
      });
    });
  }
}

let storeSyncInFlight = false;
let lastStoreSyncKey = '';
let lastStoreSyncAt = 0;

function updateStoreDriftBanner(detail, syncState = null) {
  const banner = $('#admin-store-drift');
  if (!banner) return;
  const parts = [];
  if (detail?.rustore?.drift) {
    parts.push(
      `RuStore ${detail.rustore.live}${detail.rustore.versionCode != null ? ` (${detail.rustore.versionCode})` : ''} ≠ сайт ${detail.rustore.declared || '—'}`
    );
  }
  if (detail?.appStore?.drift) {
    parts.push(`App Store ${detail.appStore.live} ≠ сайт ${detail.appStore.declared || '—'}`);
  }
  if (!parts.length) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  if (syncState === 'syncing') {
    banner.innerHTML = `<strong>Новая версия в сторе</strong> — ${parts.join(' · ')}. Публикую на сайт автоматически…`;
    return;
  }
  if (syncState === 'done') {
    banner.innerHTML = `<strong>Версия опубликована</strong> — ${parts.join(' · ')}. Через 1–2 минуты баннер в приложении подтянет новую.`;
    return;
  }
  if (syncState === 'error') {
    banner.innerHTML = `<strong>Не удалось опубликовать автоматически</strong> — ${parts.join(' · ')}. Нажмите «Обновить из сторов сейчас».`;
    return;
  }
  banner.innerHTML = `<strong>Новая версия в сторе</strong> — ${parts.join(' · ')}. Публикую на сайт автоматически…`;
}

async function autoPublishStoreVersions(detail) {
  const hasDrift = Boolean(detail?.rustore?.drift || detail?.appStore?.drift);
  if (!hasDrift || !window.AdminSupabase?.syncAppRelease) return;

  const syncKey = [
    detail?.rustore?.live || '',
    detail?.rustore?.versionCode ?? '',
    detail?.appStore?.live || '',
  ].join('|');
  const now = Date.now();
  if (storeSyncInFlight) return;
  if (syncKey && syncKey === lastStoreSyncKey && now - lastStoreSyncAt < 5 * 60 * 1000) return;

  storeSyncInFlight = true;
  updateStoreDriftBanner(detail, 'syncing');
  const statusEl = $('#release-rustore-status');
  if (statusEl) statusEl.textContent = 'Автопубликация app-release.json…';

  try {
    await syncReleaseFormFromStores({
      force: true,
      form: $('#release-form'),
      statusEl,
    });
    const result = await window.AdminSupabase.syncAppRelease();
    if (result?.release) {
      state.release = result.release;
      await persistReleaseState().catch(() => {});
      renderReleaseForm();
    }
    lastStoreSyncKey = syncKey;
    lastStoreSyncAt = Date.now();
    updateStoreDriftBanner(detail, 'done');
    const nextStatus = $('#release-rustore-status');
    if (nextStatus) {
      const changed = result?.changed ?? {};
      nextStatus.textContent =
        changed.ios || changed.rustore
          ? 'Авто: app-release.json обновлён на сайте.'
          : 'Авто: app-release.json уже актуален.';
    }
    // Через минуту перепроверим HUD — баннер исчезнет, когда сайт догонит стор.
    window.setTimeout(() => {
      if (window.AdminCommandCenter?.sweep) void window.AdminCommandCenter.sweep();
    }, 90_000);
  } catch (error) {
    updateStoreDriftBanner(detail, 'error');
    const nextStatus = $('#release-rustore-status');
    if (nextStatus) {
      nextStatus.textContent =
        error instanceof Error ? error.message : 'Автопубликация версии не удалась';
    }
  } finally {
    storeSyncInFlight = false;
  }
}

async function syncReleaseFormFromStores({ force = false, statusEl = null, form = null } = {}) {
  const releaseForm = form || $('#release-form');
  const status = statusEl || $('#release-rustore-status');
  if (!window.AdminSupabase?.loadRuStoreVersion) return;

  try {
    if (status && force) status.textContent = 'Запрос в сторы…';
    const [rustore, appStoreRes] = await Promise.all([
      window.AdminSupabase.loadRuStoreVersion().catch((error) => ({ error })),
      fetch(`https://itunes.apple.com/lookup?id=6782619598&_=${Date.now()}`, {
        cache: 'no-store',
        mode: 'cors',
      })
        .then((r) => r.json())
        .then((json) => ({ version: json?.results?.[0]?.version || null }))
        .catch((error) => ({ error })),
    ]);

    let changed = false;
    if (releaseForm && rustore && !rustore.error) {
      const versionInput = releaseForm.querySelector('[name="rustoreLatestVersion"]');
      const codeInput = releaseForm.querySelector('[name="rustoreVersionCode"]');
      const msgRu = releaseForm.querySelector('[name="messageRu"]');
      if (versionInput && rustore.versionName && (force || versionInput.value !== String(rustore.versionName))) {
        if (force || versionInput.value !== String(rustore.versionName)) {
          versionInput.value = String(rustore.versionName);
          changed = true;
        }
      }
      if (codeInput && rustore.versionCode != null) {
        const next = String(rustore.versionCode);
        if (force || codeInput.value !== next) {
          codeInput.value = next;
          changed = true;
        }
      }
      if (msgRu && rustore.whatsNew && (force || !String(msgRu.value || '').trim())) {
        if (!String(msgRu.value || '').trim()) {
          msgRu.value = String(rustore.whatsNew);
          changed = true;
        }
      }
    }

    if (releaseForm && appStoreRes?.version) {
      const iosInput = releaseForm.querySelector('[name="iosLatestVersion"]');
      if (iosInput && (force || iosInput.value !== String(appStoreRes.version))) {
        if (force || iosInput.value !== String(appStoreRes.version)) {
          iosInput.value = String(appStoreRes.version);
          changed = true;
        }
      }
    }

    if (changed && releaseForm) {
      releaseForm.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (status) {
      const rs = rustore?.error
        ? `RuStore: ${rustore.error instanceof Error ? rustore.error.message : rustore.error}`
        : rustore?.versionName
          ? `RuStore ${rustore.versionName} (code ${rustore.versionCode ?? '—'})`
          : 'RuStore —';
      const as = appStoreRes?.error
        ? 'App Store: ошибка'
        : appStoreRes?.version
          ? `App Store ${appStoreRes.version}`
          : 'App Store —';
      status.textContent = changed
        ? `Автообновлено · ${rs} · ${as}`
        : `Актуально · ${rs} · ${as}`;
    }
  } catch (error) {
    if (status) {
      status.textContent = error instanceof Error ? error.message : 'Не удалось получить версии сторов';
    }
  }
}

function bindStoreVersionAutoSync() {
  window.addEventListener('waydean-store-versions', (event) => {
    const detail = event.detail || {};
    updateStoreDriftBanner(detail);
    if (detail.rustore?.drift || detail.appStore?.drift) {
      void autoPublishStoreVersions(detail);
      return;
    }
    const form = $('#release-form');
    if (!form) return;
    if (detail.rustore?.live || detail.appStore?.live) {
      void syncReleaseFormFromStores({ force: false, form, statusEl: $('#release-rustore-status') });
    }
  });
}

function authenticityPreviewLabel(value) {
  const option = AUTHENTICITY_OPTIONS.find((entry) => entry.value === value);
  return option ? option.label : value || '';
}

function readEditorPreviewState() {
  const form = $('#editor-form');
  if (!form) {
    return {
      title: '',
      text: '',
      transliteration: '',
      targetCount: 1,
      authenticity: '',
      translation: '',
      benefit: '',
    };
  }
  const data = new FormData(form);
  const translationFields = translationsToItemFields(collectTranslationRows());
  const title =
    String(data.get('title') || '').trim() ||
    String(data.get('navTitle') || '').trim() ||
    'Без названия';
  return {
    title,
    text: String(data.get('text') || '').trim(),
    transliteration: String(data.get('transliteration') || '').trim(),
    targetCount: Math.max(1, Number(data.get('targetCount')) || 1),
    authenticity: String(data.get('authenticity') || '').trim(),
    translation: translationFields.translation || '',
    benefit: String(data.get('benefitSummary') || '').trim(),
  };
}

function updateEditorPreview() {
  const root = $('#editor-preview-card');
  if (!root) return;
  const preview = readEditorPreviewState();
  root.replaceChildren();

  const title = document.createElement('h3');
  title.className = 'admin-preview-title';
  title.textContent = preview.title;
  root.append(title);

  if (preview.authenticity) {
    const meta = document.createElement('p');
    meta.className = 'admin-preview-meta';
    meta.textContent = authenticityPreviewLabel(preview.authenticity);
    root.append(meta);
  }

  const arabic = document.createElement('p');
  arabic.className = 'admin-preview-arabic';
  arabic.dir = 'rtl';
  arabic.lang = 'ar';
  arabic.textContent = preview.text || 'أدخل النص العربي';
  if (!preview.text) arabic.classList.add('is-placeholder');
  root.append(arabic);

  if (preview.transliteration) {
    const translit = document.createElement('p');
    translit.className = 'admin-preview-translit';
    translit.textContent = preview.transliteration;
    root.append(translit);
  }

  if (preview.translation) {
    const translation = document.createElement('p');
    translation.className = 'admin-preview-translation';
    translation.textContent = preview.translation;
    root.append(translation);
  }

  if (preview.benefit) {
    const benefit = document.createElement('p');
    benefit.className = 'admin-preview-benefit';
    benefit.textContent = preview.benefit;
    root.append(benefit);
  }

  const counter = document.createElement('div');
  counter.className = 'admin-preview-counter';
  const ring = document.createElement('div');
  ring.className = 'admin-preview-counter-ring';
  ring.textContent = `0 / ${preview.targetCount}`;
  const hint = document.createElement('span');
  hint.className = 'admin-preview-counter-hint';
  hint.textContent = 'счётчик';
  counter.append(ring, hint);
  root.append(counter);
}

function bindEditorPreview() {
  const form = $('#editor-form');
  if (!form || form.dataset.previewBound === '1') return;
  form.dataset.previewBound = '1';
  form.addEventListener('input', () => updateEditorPreview());
  form.addEventListener('change', () => updateEditorPreview());
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
  bindEditorPreview();
  updateEditorPreview();

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
  const root = $('#app-screen');
  if (!root || !tabName) return;

  root.querySelectorAll('.admin-tab[data-tab]').forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  root.querySelectorAll('.admin-panel[data-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === tabName);
  });

  const publishBlock = $('#admin-publish-block');
  if (publishBlock) {
    publishBlock.classList.toggle('is-active', CONTENT_TABS.has(tabName));
  }

  const publishDock = $('#admin-publish-dock');
  if (publishDock) {
    const showDock = CONTENT_TABS.has(tabName);
    publishDock.hidden = !showDock;
    publishDock.classList.toggle('is-visible', showDock);
  }

  const publishHelp = $('#publish-help');
  if (publishHelp && PUBLISH_HELP_BY_TAB[tabName]) {
    publishHelp.innerHTML = PUBLISH_HELP_BY_TAB[tabName];
  }

  try {
    localStorage.setItem(ADMIN_TAB_STORAGE_KEY, tabName);
  } catch {
    // ignore quota / private mode
  }

  if (tabName === 'command' && window.AdminCommandCenter) {
    window.AdminCommandCenter.start();
  }
  // Центр продолжает опрос в фоне — версии сторов подтягиваются без ручного «Обновить».
  if (tabName === 'academy-feedback' && window.AdminAcademyFeedback) {
    void window.AdminAcademyFeedback.loadAndRender();
  }
  if (tabName === 'analytics' && window.AdminAnalytics) {
    void window.AdminAnalytics.loadAndRender();
  }
  if (tabName === 'academy-giveaway' && typeof window.initAcademyGiveawayAdmin === 'function') {
    void window.initAcademyGiveawayAdmin();
  }
}

function getInitialTab() {
  try {
    const saved = localStorage.getItem(ADMIN_TAB_STORAGE_KEY);
    if (saved && document.querySelector(`.admin-tab[data-tab="${saved}"]`)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'command';
}

function bindAppScreenDelegation() {
  const root = $('#app-screen');
  if (!root) return;

  root.querySelectorAll('.admin-tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab);
      tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const addItem = target.closest('[data-action="add-item"]');
    if (addItem && root.contains(addItem) && addItem.dataset.pack) {
      openEditor(addItem.dataset.pack, '');
    }
  });
}

function bindListSearch() {
  const pairs = [
    ['#support-search', 'support'],
    ['#general-search', 'general'],
  ];
  for (const [selector, packKey] of pairs) {
    const input = $(selector);
    if (!input) continue;
    input.addEventListener('input', () => {
      listFilters[packKey] = input.value || '';
      renderList(packKey);
    });
  }
}

function bindDownloadButtons() {
  bindClick('#download-support', () => downloadJson('support-dua.json', state.support));
  bindClick('#download-general', () => downloadJson('general-dua.json', state.general));
  bindClick('#download-home-announcements', () => {
    if (!window.AdminHome) return;
    downloadJson('home-announcements.json', window.AdminHome.serializeAnnouncements(state));
  });
  bindClick('#download-daily-ayah-pool', () => downloadJson('daily-ayah-pool.json', state.dailyAyahPool));
  bindClick('#download-daily-dua-pool', () => downloadJson('daily-dua-pool.json', state.dailyDuaPool));
  bindClick('#download-manifest-dua', () => downloadJson('remote-dua.manifest.json', buildManifest()));
  bindClick('#download-manifest-home', () => {
    if (!window.AdminHome) return;
    downloadJson('remote-home.manifest.json', window.AdminHome.buildHomeManifest(state));
  });
  bindClick('#download-release', () => downloadJson('app-release.json', state.release));
}

function showBootOverlay(message) {
  const overlay = $('#admin-boot-overlay');
  const text = $('#admin-boot-text');
  if (text) text.textContent = message || 'Загрузка…';
  if (overlay) overlay.hidden = false;
  document.body.classList.add('is-booting');
}

function hideBootOverlay() {
  const overlay = $('#admin-boot-overlay');
  if (overlay) overlay.hidden = true;
  document.body.classList.remove('is-booting');
}

function setLoginBusy(busy, message) {
  const submitButton = $('#login-submit') || $('#login-form button[type="submit"]');
  const status = $('#login-status');
  if (submitButton) {
    submitButton.disabled = busy || !isSupabaseReady();
    submitButton.textContent = busy ? 'Подождите…' : 'Войти';
    submitButton.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
  if (status) {
    if (busy && message) {
      status.hidden = false;
      status.textContent = message;
    } else if (!busy) {
      status.hidden = true;
      status.textContent = '';
    }
  }
  if (busy) showBootOverlay(message || 'Вход…');
  else hideBootOverlay();
}

async function rememberLoginCredentials(email, password) {
  if (!email || !password) return;
  try {
    if (window.PasswordCredential && navigator.credentials?.store) {
      const cred = new window.PasswordCredential({
        id: email,
        password,
        name: email,
      });
      await navigator.credentials.store(cred);
    }
  } catch {
    // Browser may decline — native form autocomplete still applies.
  }
}

function showApp() {
  $('#login-screen').hidden = true;
  $('#app-screen').hidden = false;
  setActiveTab(getInitialTab());
}

function showLogin() {
  if (window.AdminCommandCenter) {
    window.AdminCommandCenter.stop();
  }
  hideBootOverlay();
  void window.AdminSupabase.signOut().catch(() => {});
  $('#login-screen').hidden = false;
  $('#app-screen').hidden = true;
  setLoginBusy(false);
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
  const loginForm = $('#login-form');
  if (!loginForm) throw new Error('login-form not found');
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#login-error').hidden = true;

    if (!isSupabaseReady()) {
      $('#login-error').textContent = 'Supabase не настроен. Проверьте supabase-config.js на сайте.';
      $('#login-error').hidden = false;
      return;
    }

    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email) {
      $('#login-error').textContent = 'Введите email пользователя из Supabase → Authentication → Users.';
      $('#login-error').hidden = false;
      return;
    }
    if (!password) {
      $('#login-error').textContent = 'Введите пароль.';
      $('#login-error').hidden = false;
      return;
    }

    try {
      setLoginBusy(true, 'Вход…');
      await window.AdminSupabase.signIn(email, password);
      await rememberLoginCredentials(email, password);
      setLoginBusy(true, 'Загрузка данных…');
      showApp();
      await loadContent();
      hideBootOverlay();
      setLoginBusy(false);
    } catch (error) {
      hideBootOverlay();
      setLoginBusy(false);
      $('#login-error').hidden = false;
      $('#login-error').textContent =
        error instanceof Error ? error.message : 'Неверный email или пароль Supabase';
    }
  });

  bindClick('#logout-button', showLogin);
  bindClick('#editor-close', closeEditor);

  const editorForm = $('#editor-form');
  if (editorForm) {
    editorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveEditor(new FormData(event.currentTarget));
    });
  }

  bindAppScreenDelegation();
  bindStoreVersionAutoSync();
  bindListSearch();
  bindDownloadButtons();

  if (window.AdminCommandCenter) {
    window.AdminCommandCenter.bind();
  }
  if (window.AdminAcademyFeedback) {
    window.AdminAcademyFeedback.bind({ $ });
  }
  if (window.AdminAnalytics) {
    window.AdminAnalytics.bind({ $ });
  }

  const runPublish = () => {
    void (async () => {
      const status = $('#publish-status');
      if (status) {
        status.hidden = false;
        status.textContent = 'Публикация...';
      }
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
        if (status) {
          status.textContent = `Опубликовано: ${result.publishedAt ?? 'ok'}. Файлы обновятся на waydean.ru через 1–2 минуты.`;
        }
      } catch (error) {
        if (status) {
          status.textContent = error instanceof Error ? error.message : 'Ошибка публикации';
        }
      }
    })();
  };

  bindClick('#publish-site', runPublish);
  bindClick('#publish-site-dock', runPublish);
}

async function restoreSession() {
  if (!isSupabaseReady()) return;

  showBootOverlay('Проверка сессии…');
  try {
    const session = await window.AdminSupabase.getSession().catch(() => null);
    if (!session) {
      hideBootOverlay();
      return;
    }
    showBootOverlay('Загрузка данных…');
    showApp();
    await loadContent();
  } catch (error) {
    showInitError(error);
    showLogin();
  } finally {
    hideBootOverlay();
  }
}

function configureLoginUi() {
  const ready = isSupabaseReady();
  $('#login-setup-notice').hidden = ready;
  const submit = $('#login-submit') || $('#login-form button[type="submit"]');
  if (submit) submit.disabled = !ready;
}

async function init() {
  configureLoginUi();
  showBootOverlay('Запуск админки…');
  try {
    bindEvents();
    if (window.AdminHome) {
      window.AdminHome.bind({ $, state, downloadJson });
    }
    setActiveTab(getInitialTab());
  } catch (error) {
    console.error(error);
    showInitError(error);
    hideBootOverlay();
    return;
  }
  await restoreSession();
}

init();
