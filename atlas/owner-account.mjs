import { groups } from './catalog.mjs';

export const OWNER_AUTH_STORAGE_KEY = 'drewo-owner-auth-v1';
const OWNER_EMAIL_KEY = 'drewo-owner-email-v1';
const CREATE_REQUEST_PREFIX = 'drewo-owner-create-request-v1:';

export function normalizeOwnerTreeInput(value = {}) {
  return {
    title: String(value.title ?? '').trim(),
    firstName: String(value.firstName ?? '').trim(),
    groupId: String(value.groupId ?? '').trim(),
    teipId: String(value.teipId ?? '').trim(),
  };
}

export function validateOwnerTreeInput(value = {}) {
  const draft = normalizeOwnerTreeInput(value);
  if (draft.title.length < 1 || draft.title.length > 100) return 'Название древа должно содержать от 1 до 100 символов.';
  if (draft.firstName.length < 1 || draft.firstName.length > 100) return 'Имя первого родственника должно содержать от 1 до 100 символов.';
  if (draft.teipId && !draft.groupId) return 'Сначала выберите тухум или оставьте происхождение пустым.';
  if (draft.groupId && !groups.some(group => group.id === draft.groupId)) return 'Выберите тухум из каталога или оставьте поле пустым.';
  if (draft.teipId && !groups.find(group => group.id === draft.groupId)?.teips.some(teip => teip.id === draft.teipId)) {
    return 'Выберите тейп из выбранного тухума или оставьте поле пустым.';
  }
  return null;
}

export function buildOwnerTreeRequest(value, requestId) {
  const draft = normalizeOwnerTreeInput(value);
  const error = validateOwnerTreeInput(draft);
  if (error) throw new Error(error);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId ?? ''))) {
    throw new Error('Не удалось подготовить безопасный запрос. Обновите страницу и повторите попытку.');
  }
  return {
    p_title: draft.title,
    p_first_name: draft.firstName,
    p_request_id: requestId,
    p_atlas_group_id: draft.groupId || null,
    p_atlas_teip_id: draft.teipId || null,
  };
}

export async function createOwnerTree(client, value, requestId) {
  const { data, error } = await client.rpc('drewo_plus_create_tree', buildOwnerTreeRequest(value, requestId));
  if (error) throw error;
  if (typeof data !== 'string' || !/^[0-9a-f-]{36}$/i.test(data)) {
    throw new Error('Сервис вернул неверный номер древа. Повторите попытку; второй раз древо не создастся.');
  }
  return data;
}

export function ownerAccountErrorMessage(error) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  if (code === '23505' || /у аккаунта уже есть древо/i.test(message)) return 'У этого аккаунта уже есть древо. Откройте его или войдите в другой аккаунт.';
  if (/достигнут лимит древа/i.test(message)) return 'Достигнут лимит людей для этого тарифа.';
  if (error?.status === 429 || /too many|rate limit|rate_limit/i.test(message)) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  if (/invalid login credentials/i.test(message)) return 'Неверная почта или пароль.';
  return message || 'Не удалось выполнить запрос. Проверьте соединение и повторите попытку.';
}

export function maxOwnerTreeDepth(people = []) {
  const byId = new Map(people.map(person => [String(person.id), person]));
  let maxDepth = 0;
  for (const person of people) {
    let current = person;
    const seen = new Set();
    let depth = 0;
    while (current && !seen.has(String(current.id)) && depth <= people.length) {
      seen.add(String(current.id));
      depth += 1;
      current = current.parent_id ? byId.get(String(current.parent_id)) : null;
    }
    maxDepth = Math.max(maxDepth, depth);
  }
  return maxDepth;
}

const make = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function initAtlasOwnerAccount({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  const dialog = documentRef?.querySelector('#owner-account-dialog');
  const content = documentRef?.querySelector('#owner-account-content');
  if (!dialog || !content || !windowRef) return { open: async () => {}, start: async () => {} };

  const config = () => windowRef.SUPABASE_CONFIG || {};
  let activeClient = null;
  let activeUser = null;
  let ownedTree = null;
  let people = [];
  let actionButton = null;
  let requestBusy = false;
  let sdkPromise = null;

  function storage(scope) {
    try { return scope === 'remember' ? windowRef.localStorage : windowRef.sessionStorage; }
    catch { return null; }
  }

  function clearOtherScopes(keepScope) {
    for (const scope of ['remember', 'tab']) {
      if (scope === keepScope) continue;
      try { storage(scope)?.removeItem(OWNER_AUTH_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    }
  }

  function clearSavedOwnerSessions() {
    for (const scope of ['remember', 'tab']) {
      try { storage(scope)?.removeItem(OWNER_AUTH_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    }
  }

  function rememberedEmail() {
    try { return storage('remember')?.getItem(OWNER_EMAIL_KEY) || ''; }
    catch { return ''; }
  }

  function storedScope() {
    const queryScope = new URLSearchParams(windowRef.location.search).get('remember');
    if (queryScope === '1') return 'remember';
    if (queryScope === '0') return 'tab';
    try {
      const local = JSON.parse(storage('remember')?.getItem(OWNER_AUTH_STORAGE_KEY) || 'null');
      if (local?.access_token) return 'remember';
      const tab = JSON.parse(storage('tab')?.getItem(OWNER_AUTH_STORAGE_KEY) || 'null');
      if (tab?.access_token) return 'tab';
    } catch { /* An invalid saved session will be ignored by Supabase. */ }
    return 'tab';
  }

  async function ensureSupabaseSdk() {
    if (windowRef.supabase?.createClient) return;
    if (windowRef.drewoSupabaseClientPromise) return windowRef.drewoSupabaseClientPromise;
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = documentRef.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => windowRef.supabase?.createClient
        ? resolve()
        : reject(new Error('Не удалось загрузить модуль входа.'));
      script.onerror = () => reject(new Error('Не удалось подключиться к службе аккаунтов.'));
      documentRef.head.append(script);
    });
    windowRef.drewoSupabaseClientPromise = sdkPromise;
    return sdkPromise;
  }

  function clientFor(scope) {
    if (!windowRef.supabase?.createClient) throw new Error('Сервис аккаунтов не загрузился.');
    const value = config();
    if (!value.url || !value.anonKey) throw new Error('Сервис аккаунтов не настроен.');
    const authStorage = storage(scope);
    if (!authStorage) throw new Error('Хранилище входа недоступно. Разрешите хранилище сайта и повторите попытку.');
    return windowRef.supabase.createClient(value.url, value.anonKey, {
      auth: {
        storage: authStorage,
        storageKey: OWNER_AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  async function resolveSession(preferred = storedScope()) {
    await ensureSupabaseSdk();
    const scopes = preferred === 'remember' ? ['remember', 'tab'] : ['tab', 'remember'];
    for (const scope of scopes) {
      const client = clientFor(scope);
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) continue;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData?.user || userData.user.is_anonymous) continue;
      clearOtherScopes(scope);
      activeClient = client;
      activeUser = userData.user;
      addOwnerAction();
      return activeUser;
    }
    activeClient = null;
    activeUser = null;
    removeOwnerAction();
    return null;
  }

  function openDialog() {
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.hidden = false;
  }

  function closeDialog() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.hidden = true;
  }

  function resetContent() { content.replaceChildren(); }

  function addOwnerAction() {
    if (actionButton || !activeUser) return;
    const actions = documentRef.querySelector('.top-actions');
    if (!actions) return;
    actionButton = make(documentRef, 'button', 'top-action');
    actionButton.type = 'button';
    actionButton.setAttribute('aria-label', 'Открыть личный аккаунт и своё древо');
    const icon = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    const use = documentRef.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '/assets/drewo-icons.svg#people');
    icon.append(use);
    actionButton.append(icon, make(documentRef, 'span', '', 'Мой аккаунт'));
    actionButton.addEventListener('click', () => void open('home'));
    actions.append(actionButton);
  }

  function removeOwnerAction() {
    actionButton?.remove();
    actionButton = null;
  }

  function shell({ eyebrow = 'ЛИЧНЫЙ АККАУНТ', title, description = '' }) {
    resetContent();
    content.append(make(documentRef, 'p', 'eyebrow owner-eyebrow', eyebrow));
    const heading = make(documentRef, 'h2', 'owner-title', title);
    heading.id = 'owner-account-title';
    content.append(heading);
    if (description) content.append(make(documentRef, 'p', 'owner-description', description));
    return content;
  }

  function status(parent, text = '', role = 'status') {
    const node = make(documentRef, 'p', `owner-message${role === 'alert' ? ' is-error' : ''}`, text);
    node.setAttribute('role', role);
    node.hidden = !text;
    parent.append(node);
    return node;
  }

  function action(label, className, callback) {
    const button = make(documentRef, 'button', className || 'access-primary', label);
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }

  function setBusy(form, busy, label) {
    const submit = form.querySelector('[type="submit"]');
    if (!submit) return;
    if (busy) {
      submit.dataset.previousText = submit.textContent;
      submit.textContent = label;
    } else if (submit.dataset.previousText) {
      submit.textContent = submit.dataset.previousText;
      delete submit.dataset.previousText;
    }
    submit.disabled = busy;
  }

  function ownerAuthForm(mode, { email = mode === 'login' ? rememberedEmail() : '', notice = '' } = {}) {
    const register = mode === 'register';
    const root = shell({
      title: register ? 'Создать аккаунт' : 'Войти в аккаунт',
      description: register
        ? 'После регистрации вы сможете создать одно личное древо. Происхождение можно указать позже.'
        : 'Личный аккаунт хранит ваше древо отдельно от семейного входа по логину и паролю.',
    });
    const tabs = make(documentRef, 'div', 'owner-tabs');
    const registerTab = action('Регистрация', register ? 'owner-tab is-current' : 'owner-tab', () => ownerAuthForm('register'));
    registerTab.setAttribute('aria-pressed', String(register));
    const loginTab = action('Войти', !register ? 'owner-tab is-current' : 'owner-tab', () => ownerAuthForm('login'));
    loginTab.setAttribute('aria-pressed', String(!register));
    tabs.append(registerTab, loginTab);
    root.append(tabs);

    const form = make(documentRef, 'form', 'owner-form');
    form.noValidate = true;
    const emailLabel = make(documentRef, 'label', 'owner-field');
    emailLabel.append(make(documentRef, 'span', '', 'Электронная почта'));
    const emailInput = make(documentRef, 'input');
    emailInput.type = 'email'; emailInput.name = 'email'; emailInput.autocomplete = 'email';
    emailInput.required = true; emailInput.maxLength = 254; emailInput.value = email;
    emailLabel.append(emailInput); form.append(emailLabel);

    const passwordLabel = make(documentRef, 'label', 'owner-field');
    passwordLabel.append(make(documentRef, 'span', '', 'Пароль'));
    const passwordInput = make(documentRef, 'input');
    passwordInput.type = 'password'; passwordInput.name = 'password';
    passwordInput.autocomplete = register ? 'new-password' : 'current-password';
    passwordInput.required = true; passwordInput.minLength = register ? 15 : 1; passwordInput.maxLength = 128;
    passwordLabel.append(passwordInput); form.append(passwordLabel);

    let confirmInput = null;
    if (register) {
      const confirmLabel = make(documentRef, 'label', 'owner-field');
      confirmLabel.append(make(documentRef, 'span', '', 'Повторите пароль'));
      confirmInput = make(documentRef, 'input');
      confirmInput.type = 'password'; confirmInput.name = 'password-confirm';
      confirmInput.autocomplete = 'new-password'; confirmInput.required = true; confirmInput.maxLength = 128;
      confirmLabel.append(confirmInput); form.append(confirmLabel);
    }

    const rememberLabel = make(documentRef, 'label', 'remember owner-remember');
    const rememberInput = make(documentRef, 'input');
    rememberInput.type = 'checkbox'; rememberInput.name = 'remember';
    rememberInput.checked = storedScope() === 'remember';
    rememberLabel.append(rememberInput, make(documentRef, 'span', '', 'Запомнить меня на этом устройстве'));
    form.append(rememberLabel);
    form.append(make(documentRef, 'small', 'owner-hint', 'Без галочки вход сохранится только в этой вкладке.'));

    const feedback = status(form, notice, notice ? 'status' : 'alert');
    const submit = make(documentRef, 'button', 'access-primary owner-submit', register ? 'Создать аккаунт' : 'Войти');
    submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (requestBusy) return;
      const address = emailInput.value.trim();
      const password = passwordInput.value;
      if (!address || !emailInput.validity.valid) {
        feedback.textContent = 'Укажите действующий адрес электронной почты.'; feedback.hidden = false; feedback.setAttribute('role', 'alert'); emailInput.focus(); return;
      }
      if (register && password.length < 15) {
        feedback.textContent = 'Используйте пароль длиной не менее 15 символов.'; feedback.hidden = false; feedback.setAttribute('role', 'alert'); passwordInput.focus(); return;
      }
      if (register && password !== confirmInput.value) {
        feedback.textContent = 'Пароли не совпадают.'; feedback.hidden = false; feedback.setAttribute('role', 'alert'); confirmInput.focus(); return;
      }
      requestBusy = true; setBusy(form, true, register ? 'Создаю аккаунт…' : 'Вхожу…');
      feedback.hidden = true;
      const scope = rememberInput.checked ? 'remember' : 'tab';
      try {
        await ensureSupabaseSdk();
        activeClient = clientFor(scope);
        if (rememberInput.checked) {
          try { windowRef.localStorage.setItem(OWNER_EMAIL_KEY, address); } catch {}
        } else {
          try { windowRef.localStorage.removeItem(OWNER_EMAIL_KEY); } catch {}
        }
        if (register) {
          const redirect = new URL('/atlas/', windowRef.location.origin);
          redirect.searchParams.set('owner', 'continue');
          redirect.searchParams.set('remember', rememberInput.checked ? '1' : '0');
          const options = { emailRedirectTo: redirect.toString() };
          const captchaToken = windowRef.drewoOwnerCaptchaToken;
          if (typeof captchaToken === 'string' && captchaToken) options.captchaToken = captchaToken;
          const { data, error } = await activeClient.auth.signUp({ email: address, password, options });
          if (error) throw error;
          clearOtherScopes(scope);
          passwordInput.value = ''; if (confirmInput) confirmInput.value = '';
          if (data?.session?.access_token) {
            activeUser = data.user;
            await finishSignIn();
          } else {
            renderEmailConfirmation(address);
          }
        } else {
          const { data, error } = await activeClient.auth.signInWithPassword({ email: address, password });
          if (error) throw error;
          clearOtherScopes(scope);
          if (!data?.session?.access_token) throw new Error('Подтвердите адрес электронной почты по ссылке из письма, затем войдите снова.');
          passwordInput.value = '';
          activeUser = data.user;
          await finishSignIn();
        }
      } catch (error) {
        feedback.textContent = ownerAccountErrorMessage(error); feedback.hidden = false; feedback.setAttribute('role', 'alert');
      } finally {
        requestBusy = false; setBusy(form, false);
      }
    });
    root.append(form);
    const close = action('Закрыть', 'owner-secondary', closeDialog);
    root.append(close);
    requestAnimationFrame(() => emailInput.focus());
  }

  function renderEmailConfirmation(email) {
    const root = shell({
      eyebrow: 'ПОДТВЕРЖДЕНИЕ ПОЧТЫ',
      title: 'Проверьте почту',
      description: `Если адрес ${email} новый, на него отправлена ссылка для подтверждения. После перехода по ссылке вернитесь сюда — создание древа продолжится.`,
    });
    root.append(action('Я подтвердил почту — войти', 'access-primary', () => ownerAuthForm('login', { email })));
    root.append(action('Вернуться', 'owner-secondary', () => ownerAuthForm('register', { email })));
  }

  async function finishSignIn() {
    if (!activeClient || !activeUser) throw new Error('Не удалось проверить аккаунт. Войдите ещё раз.');
    const { error } = await activeClient.rpc('drewo_plus_ensure_account', { p_display_name: '' });
    if (error) throw error;
    addOwnerAction();
    await loadOwnedTree();
  }

  async function loadOwnedTree() {
    const root = shell({ title: 'Загружаю ваше древо', description: 'Проверяю аккаунт и доступ к данным.' });
    status(root, 'Загрузка…');
    const { data, error } = await activeClient
      .from('drewo_plus_trees')
      .select('id,title,atlas_group_id,atlas_teip_id,created_at')
      .limit(1)
      .maybeSingle();
    if (error) {
      ownerMessage(error);
      return;
    }
    ownedTree = data || null;
    if (!ownedTree) {
      renderCreateTree();
      return;
    }
    const peopleResult = await activeClient
      .from('drewo_plus_people')
      .select('id,parent_id,name,born,died,note,revision,created_at')
      .eq('tree_id', ownedTree.id)
      .order('created_at', { ascending: true });
    if (peopleResult.error) {
      ownerMessage(peopleResult.error);
      return;
    }
    people = Array.isArray(peopleResult.data) ? peopleResult.data : [];
    renderOwnerTree();
  }

  function ownerMessage(error) {
    const root = shell({ title: 'Не удалось загрузить древо' });
    status(root, ownerAccountErrorMessage(error), 'alert');
    root.append(action('Повторить', 'access-primary', () => void loadOwnedTree()));
    root.append(action('Выйти', 'owner-secondary', () => void leaveAccount(false)));
  }

  function renderCreateTree() {
    const root = shell({
      title: 'Создайте своё древо',
      description: 'На один аккаунт можно создать одно древо. Достаточно названия и имени первого родственника; сведения о происхождении необязательны.',
    });
    const form = make(documentRef, 'form', 'owner-form');
    form.noValidate = true;
    const title = inputField('Название древа', 'title', { required: true, maxLength: 100, placeholder: 'Например, Семья Хьоти' });
    const first = inputField('Имя первого родственника', 'firstName', { required: true, maxLength: 100, placeholder: 'Ахмад' });
    form.append(title.wrapper, first.wrapper);

    const groupLabel = make(documentRef, 'label', 'owner-field');
    groupLabel.append(make(documentRef, 'span', '', 'Тухум · необязательно'));
    const groupSelect = make(documentRef, 'select'); groupSelect.name = 'groupId';
    const noGroup = make(documentRef, 'option', '', 'Не указывать сейчас'); noGroup.value = ''; groupSelect.append(noGroup);
    for (const group of groups) {
      const option = make(documentRef, 'option', '', group.name); option.value = group.id; groupSelect.append(option);
    }
    groupLabel.append(groupSelect); form.append(groupLabel);

    const teipLabel = make(documentRef, 'label', 'owner-field');
    teipLabel.append(make(documentRef, 'span', '', 'Тейп · необязательно'));
    const teipSelect = make(documentRef, 'select'); teipSelect.name = 'teipId'; teipSelect.disabled = true;
    const noTeip = make(documentRef, 'option', '', 'Не указывать сейчас'); noTeip.value = ''; teipSelect.append(noTeip);
    teipLabel.append(teipSelect); form.append(teipLabel);
    groupSelect.addEventListener('change', () => {
      teipSelect.replaceChildren();
      const blank = make(documentRef, 'option', '', 'Не указывать сейчас'); blank.value = ''; teipSelect.append(blank);
      const selected = groups.find(group => group.id === groupSelect.value);
      for (const teip of selected?.teips ?? []) {
        const option = make(documentRef, 'option', '', teip.name); option.value = teip.id; teipSelect.append(option);
      }
      teipSelect.disabled = !selected;
    });
    const privateNote = make(documentRef, 'p', 'owner-private-note', 'Древо привязано к вашему аккаунту и не публикуется в открытом каталоге.');
    form.append(privateNote);
    const feedback = status(form);
    const submit = make(documentRef, 'button', 'access-primary owner-submit', 'Создать древо'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (requestBusy) return;
      const draft = { title: title.input.value, firstName: first.input.value, groupId: groupSelect.value, teipId: teipSelect.value };
      const validationError = validateOwnerTreeInput(draft);
      if (validationError) {
        feedback.textContent = validationError; feedback.hidden = false; feedback.setAttribute('role', 'alert');
        (draft.title.trim().length < 1 || draft.title.trim().length > 100 ? title.input : first.input).focus();
        return;
      }
      requestBusy = true; setBusy(form, true, 'Создаю древо…'); feedback.hidden = true;
      try {
        const id = await createOwnerTree(activeClient, draft, createRequestId(activeUser.id));
        ownedTree = { id, title: draft.title.trim(), atlas_group_id: draft.groupId || null, atlas_teip_id: draft.teipId || null };
        try { storage('tab')?.removeItem(CREATE_REQUEST_PREFIX + activeUser.id); } catch {}
        await loadOwnedTree();
      } catch (error) {
        feedback.textContent = ownerAccountErrorMessage(error); feedback.hidden = false; feedback.setAttribute('role', 'alert');
        if (String(error?.code) === '23505') await loadOwnedTree();
      } finally {
        requestBusy = false; setBusy(form, false);
      }
    });
    root.append(form);
    root.append(action('Сменить аккаунт', 'owner-secondary', () => void leaveAccount(true)));
  }

  function inputField(label, name, { value = '', required = false, maxLength, placeholder = '', type = 'text' } = {}) {
    const wrapper = make(documentRef, 'label', 'owner-field');
    wrapper.append(make(documentRef, 'span', '', label));
    const input = make(documentRef, 'input');
    input.name = name; input.type = type; input.value = value; input.required = required;
    input.maxLength = maxLength; input.placeholder = placeholder; input.autocomplete = 'off';
    wrapper.append(input);
    return { wrapper, input };
  }

  function createRequestId(userId) {
    const key = CREATE_REQUEST_PREFIX + userId;
    const requestStorage = storage('tab');
    try {
      const existing = requestStorage?.getItem(key);
      if (existing) return existing;
      if (!windowRef.crypto?.randomUUID) throw new Error('Безопасная генерация запроса недоступна. Откройте сайт по HTTPS.');
      const next = windowRef.crypto.randomUUID();
      requestStorage?.setItem(key, next);
      return next;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Безопасная')) throw error;
      if (!windowRef.crypto?.randomUUID) throw new Error('Безопасная генерация запроса недоступна. Откройте сайт по HTTPS.');
      return windowRef.crypto.randomUUID();
    }
  }

  function buildPeopleTree() {
    const byParent = new Map();
    const byId = new Map(people.map(person => [String(person.id), person]));
    for (const person of people) {
      const key = person.parent_id ? String(person.parent_id) : '';
      const bucket = byParent.get(key) || [];
      bucket.push(person); byParent.set(key, bucket);
    }
    const list = make(documentRef, 'ul', 'owner-tree-list');
    const visited = new Set();
    const appendPerson = (person, depth, ancestors) => {
      const id = String(person.id);
      const item = make(documentRef, 'li', 'owner-tree-person');
      item.style.setProperty('--person-depth', String(Math.min(depth, 12)));
      if (ancestors.has(id)) {
        item.append(make(documentRef, 'p', 'owner-person-name', person.name));
        item.append(make(documentRef, 'small', 'owner-hint', 'Связь не удалось отобразить из-за циклической записи.'));
        return item;
      }
      visited.add(id);
      const head = make(documentRef, 'div', 'owner-person-head');
      const name = make(documentRef, 'p', 'owner-person-name', person.name);
      const dates = [person.born, person.died].filter(value => value != null).join(' — ');
      head.append(name);
      if (dates) head.append(make(documentRef, 'span', 'owner-person-dates', dates));
      item.append(head);
      if (person.note) item.append(make(documentRef, 'p', 'owner-person-note', person.note));
      const tools = make(documentRef, 'div', 'owner-person-tools');
      tools.append(action('Добавить родственника', 'owner-small-action', () => renderPersonForm(person.id)));
      tools.append(action('Изменить', 'owner-small-action', () => renderPersonForm(null, person)));
      item.append(tools);
      const children = (byParent.get(id) || []).filter(child => child.id !== person.id);
      if (children.length) {
        const nested = make(documentRef, 'ul', 'owner-tree-list');
        const nextAncestors = new Set(ancestors); nextAncestors.add(id);
        children.forEach(child => nested.append(appendPerson(child, depth + 1, nextAncestors)));
        item.append(nested);
      }
      return item;
    };
    const roots = byParent.get('') || [];
    roots.forEach(person => list.append(appendPerson(person, 1, new Set())));
    for (const person of people) {
      if (!visited.has(String(person.id))) list.append(appendPerson(person, 1, new Set()));
    }
    return list;
  }

  function renderOwnerTree() {
    const groupName = groups.find(group => group.id === ownedTree.atlas_group_id)?.name;
    const teipName = groups.find(group => group.id === ownedTree.atlas_group_id)?.teips.find(teip => teip.id === ownedTree.atlas_teip_id)?.name;
    const origin = [groupName, teipName].filter(Boolean).join(' · ');
    const root = shell({ title: ownedTree.title, description: origin || 'Происхождение не указано — его можно добавить позже.' });
    const stats = make(documentRef, 'dl', 'owner-tree-stats');
    const count = make(documentRef, 'div'); count.append(make(documentRef, 'dt', '', 'Людей'), make(documentRef, 'dd', '', new Intl.NumberFormat('ru-RU').format(people.length)));
    const depth = make(documentRef, 'div'); depth.append(make(documentRef, 'dt', '', 'Поколений'), make(documentRef, 'dd', '', new Intl.NumberFormat('ru-RU').format(maxOwnerTreeDepth(people))));
    stats.append(count, depth); root.append(stats);
    root.append(make(documentRef, 'h3', 'owner-section-title', 'Родословная'));
    root.append(people.length ? buildPeopleTree() : make(documentRef, 'p', 'owner-private-note', 'Добавьте первого родственника, чтобы начать.'));
    const footer = make(documentRef, 'div', 'owner-account-actions');
    footer.append(action('Выйти', 'owner-secondary', () => void leaveAccount(false)));
    footer.append(action('Сменить аккаунт', 'owner-secondary', () => void leaveAccount(true)));
    root.append(footer);
    root.append(make(documentRef, 'p', 'owner-private-note', 'Доступ к данным проверяется по вашему аккаунту. Это древо не публикуется в открытом каталоге.'));
  }

  function renderPersonForm(parentId = null, person = null) {
    const root = shell({ title: person ? 'Изменить сведения' : 'Добавить родственника', description: 'Связь с родителем можно не указывать, если вы пока её не знаете.' });
    const form = make(documentRef, 'form', 'owner-form'); form.noValidate = true;
    const name = inputField('Имя', 'name', { value: person?.name ?? '', required: true, maxLength: 100 });
    const born = inputField('Год рождения · необязательно', 'born', { value: person?.born ?? '', maxLength: 4, type: 'number' });
    born.input.min = '1'; born.input.max = '9999';
    const died = inputField('Год смерти · необязательно', 'died', { value: person?.died ?? '', maxLength: 4, type: 'number' });
    died.input.min = '1'; died.input.max = '9999';
    form.append(name.wrapper, born.wrapper, died.wrapper);
    const parentLabel = make(documentRef, 'label', 'owner-field');
    parentLabel.append(make(documentRef, 'span', '', 'Родитель · необязательно'));
    const parent = make(documentRef, 'select'); parent.name = 'parentId';
    const noParent = make(documentRef, 'option', '', 'Не указывать'); noParent.value = ''; parent.append(noParent);
    for (const candidate of people) {
      if (candidate.id === person?.id) continue;
      const option = make(documentRef, 'option', '', candidate.name); option.value = candidate.id;
      option.selected = String(candidate.id) === String(person?.parent_id ?? parentId ?? ''); parent.append(option);
    }
    if (person && parentId == null) noParent.selected = true;
    parentLabel.append(parent); form.append(parentLabel);
    const noteLabel = make(documentRef, 'label', 'owner-field'); noteLabel.append(make(documentRef, 'span', '', 'Заметка · необязательно'));
    const note = make(documentRef, 'textarea'); note.name = 'note'; note.maxLength = 2000; note.rows = 3; note.value = person?.note ?? '';
    noteLabel.append(note); form.append(noteLabel);
    const feedback = status(form);
    const save = make(documentRef, 'button', 'access-primary owner-submit', person ? 'Сохранить' : 'Добавить'); save.type = 'submit'; form.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (requestBusy) return;
      const personName = name.input.value.trim();
      const birth = born.input.value ? Number(born.input.value) : null;
      const death = died.input.value ? Number(died.input.value) : null;
      if (!personName || personName.length > 100) { feedback.textContent = 'Введите имя длиной не более 100 символов.'; feedback.hidden = false; name.input.focus(); return; }
      if ((birth != null && (!Number.isInteger(birth) || birth < 1 || birth > 9999)) || (death != null && (!Number.isInteger(death) || death < 1 || death > 9999)) || (birth != null && death != null && birth > death)) {
        feedback.textContent = 'Проверьте годы рождения и смерти.'; feedback.hidden = false; born.input.focus(); return;
      }
      requestBusy = true; setBusy(form, true, 'Сохраняю…'); feedback.hidden = true;
      const values = { name: personName, born: birth, died: death, parent_id: parent.value || null, note: note.value.trim() };
      try {
        const query = person
          ? activeClient.from('drewo_plus_people').update(values).eq('id', person.id).eq('tree_id', ownedTree.id)
          : activeClient.from('drewo_plus_people').insert({ ...values, tree_id: ownedTree.id });
        const { error } = await query;
        if (error) throw error;
        await loadOwnedTree();
      } catch (error) {
        feedback.textContent = ownerAccountErrorMessage(error); feedback.hidden = false; feedback.setAttribute('role', 'alert');
      } finally {
        requestBusy = false; setBusy(form, false);
      }
    });
    root.append(form);
    root.append(action('Назад к древу', 'owner-secondary', () => renderOwnerTree()));
  }

  async function leaveAccount(switchAccount) {
    if (!activeClient || requestBusy) return;
    requestBusy = true;
    let signOutError = null;
    try {
      const { error } = await activeClient.auth.signOut({ scope: 'local' });
      if (error) signOutError = error;
    } catch (error) {
      signOutError = error;
    } finally {
      clearSavedOwnerSessions();
      if (signOutError) activeClient.auth.stopAutoRefresh?.();
      activeClient = null; activeUser = null; ownedTree = null; people = [];
      removeOwnerAction();
      requestBusy = false;
    }
    if (switchAccount) {
      ownerAuthForm('login', {
        notice: signOutError
          ? 'Сеанс удалён с этого устройства, но сервер не подтвердил его обновление. Проверьте соединение.'
          : '',
      });
    } else if (signOutError) {
      const root = shell({ title: 'Вы вышли на этом устройстве' });
      status(root, 'Сеанс удалён с этого устройства, но сервер не подтвердил его обновление. Проверьте соединение.', 'alert');
      root.append(action('Закрыть', 'owner-secondary', closeDialog));
    } else {
      closeDialog();
    }
  }

  async function open(mode = 'home') {
    openDialog();
    shell({ title: 'Загрузка аккаунта', description: 'Проверяю вход.' });
    try {
      if (!activeUser) await resolveSession();
      if (activeUser) {
        await finishSignIn();
      } else {
        ownerAuthForm(mode === 'login' ? 'login' : 'register');
      }
    } catch (error) {
      const root = shell({ title: 'Аккаунт пока недоступен' });
      status(root, ownerAccountErrorMessage(error), 'alert');
      root.append(action('Повторить', 'access-primary', () => void open(mode)));
      root.append(action('Войти', 'owner-secondary', () => ownerAuthForm('login')));
    }
  }

  async function start() {
    const params = new URLSearchParams(windowRef.location.search);
    const shouldResume = params.get('owner') === 'continue';
    let stored = false;
    for (const scope of ['remember', 'tab']) {
      try {
        const value = JSON.parse(storage(scope)?.getItem(OWNER_AUTH_STORAGE_KEY) || 'null');
        if (value?.access_token) stored = true;
      } catch {}
    }
    if (!shouldResume && !stored) return;
    try {
      await resolveSession(storedScope());
      if (shouldResume) await open(activeUser ? 'home' : 'login');
    } catch {
      if (shouldResume) await open('login');
    }
  }

  return { open, start, hasSession: () => Boolean(activeUser) };
}
