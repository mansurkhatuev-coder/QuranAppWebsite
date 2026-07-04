const SESSION_KEY = 'waydean_admin_session_v1';

const state = {
  support: [],
  general: [],
  manifest: null,
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

const EDITOR_FIELDS = [
  { key: 'id', label: 'ID (не менять после публикации)', full: false },
  { key: 'title', label: 'Заголовок', full: false },
  { key: 'navTitle', label: 'Короткий заголовок', full: false },
  { key: 'text', label: 'Арабский текст', full: true, textarea: true },
  { key: 'translation', label: 'Перевод', full: true, textarea: true },
  { key: 'transliteration', label: 'Транслитерация', full: true, textarea: true },
  { key: 'targetCount', label: 'Количество', full: false, number: true },
  { key: 'group', label: 'Группа', full: false },
  { key: 'authenticity', label: 'Достоверность', full: false, select: ['quran', 'sahih', 'hasan', 'disputed', 'weak'] },
  { key: 'importance', label: 'Важность', full: false, select: ['core', 'recommended', 'extra'] },
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
    id: item.id ?? '',
    title: item.title ?? '',
    navTitle: item.navTitle ?? '',
    text: item.text ?? '',
    translation: item.translation ?? '',
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

function formToItem(form, category) {
  const id = form.id.trim() || `${category}-${slugify(form.title || 'dua')}`;
  return {
    id,
    title: form.title.trim() || form.navTitle.trim() || id,
    navTitle: form.navTitle.trim() || form.title.trim() || id,
    text: form.text.trim(),
    translation: form.translation.trim() || undefined,
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
    container.innerHTML = '<p class="admin-muted">Пока нет записей.</p>';
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'admin-item';
    card.innerHTML = `
      <div>
        <h3>${item.title || item.id}</h3>
        <p class="admin-muted">${item.id}</p>
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
      if (!window.confirm('Удалить эту запись?')) return;
      state[packKey] = state[packKey].filter((entry) => entry.id !== item.id);
      renderList(packKey);
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
    const label = document.createElement('label');
    label.className = field.full ? 'admin-full' : '';
    label.textContent = field.label;

    let input;
    if (field.select) {
      input = document.createElement('select');
      for (const optionValue of field.select) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        if (formValues[field.key] === optionValue) option.selected = true;
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
  const nextItem = formToItem(Object.fromEntries(formData.entries()), pack.category);
  if (!nextItem.text) {
    window.alert('Арабский текст обязателен.');
    return;
  }

  const list = state[editing.packKey].filter((item) => item.id !== editing.itemId);
  if (list.some((item) => item.id === nextItem.id) && (editing.isNew || editing.itemId !== nextItem.id)) {
    window.alert('ID уже используется.');
    return;
  }

  list.push(nextItem);
  list.sort((left, right) => left.title.localeCompare(right.title, 'ru'));
  state[editing.packKey] = list;
  renderList(editing.packKey);
  closeEditor();
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
  sessionStorage.removeItem(SESSION_KEY);
  $('#login-screen').hidden = false;
  $('#app-screen').hidden = true;
}

async function loadContent() {
  const [support, general, manifest, release] = await Promise.all([
    fetchJson('../data/support-dua.json'),
    fetchJson('../data/general-dua.json'),
    fetchJson('../data/remote-dua.manifest.json'),
    fetchJson('../data/app-release.json'),
  ]);

  state.support = Array.isArray(support) ? support : [];
  state.general = Array.isArray(general) ? general : [];
  state.manifest = manifest;
  state.release = release;
  renderAllLists();
  renderReleaseForm();
}

function bindEvents() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#login-password').value;
    if (password !== window.ADMIN_CONFIG.password) {
      $('#login-error').hidden = false;
      return;
    }
    $('#login-error').hidden = true;
    sessionStorage.setItem(SESSION_KEY, '1');
    showApp();
    await loadContent().catch(() => window.alert('Не удалось загрузить data/*.json с сайта.'));
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
  $('#download-manifest').addEventListener('click', () => downloadJson('remote-dua.manifest.json', buildManifest()));
  $('#download-release').addEventListener('click', () => downloadJson('app-release.json', state.release));
}

async function init() {
  bindEvents();
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    showApp();
    await loadContent().catch(() => {});
  }
}

init();
