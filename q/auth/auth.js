(function () {
  const A = window.AcademyLive;
  const form = document.getElementById('auth-form');
  const nameField = document.getElementById('name-field');
  const nameInput = document.getElementById('auth-name');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const errorEl = document.getElementById('auth-error');
  const okEl = document.getElementById('auth-ok');
  const submitBtn = document.getElementById('auth-submit');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const toggleBtn = document.getElementById('btn-toggle-password');
  const recoverBtn = document.getElementById('btn-recover');
  const backHub = document.getElementById('back-hub');

  const token = A.resolveHubToken();
  if (token) backHub.href = '/q/?t=' + encodeURIComponent(token);

  let mode = 'login';

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || '';
    if (message) okEl.hidden = true;
  }

  function showOk(message) {
    okEl.hidden = !message;
    okEl.textContent = message || '';
    if (message) errorEl.hidden = true;
  }

  function setMode(next) {
    mode = next;
    const register = mode === 'register';
    nameField.hidden = !register;
    nameInput.required = register;
    passwordInput.autocomplete = register ? 'new-password' : 'current-password';
    submitBtn.textContent = register ? 'Зарегистрироваться' : 'Войти';
    tabLogin.classList.toggle('academy-btn--primary', !register);
    tabRegister.classList.toggle('academy-btn--primary', register);
    recoverBtn.hidden = register;
    showError('');
    showOk('');
  }

  function validate() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Укажите корректный email.';
    }
    if (password.length < 6) return 'Пароль — минимум 6 символов.';
    if (mode === 'register') {
      const name = nameInput.value.trim();
      if (name.length < 2) return 'Укажите имя (хотя бы 2 буквы).';
    }
    return '';
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));

  toggleBtn.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? 'Скрыть' : 'Показать';
  });

  recoverBtn.addEventListener('click', async () => {
    showError('');
    showOk('');
    const email = emailInput.value.trim();
    if (!email) {
      showError('Сначала введите email.');
      return;
    }
    if (!A.canCreateClient()) {
      showError('Сервис временно недоступен.');
      return;
    }
    const client = A.getStudentClient();
    recoverBtn.disabled = true;
    try {
      const redirectTo = location.origin + '/q/auth/';
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      showOk('Если аккаунт есть, письмо для сброса пароля отправлено.');
    } catch (err) {
      showError(A.humanizeError(err?.message || err, 'Не удалось отправить письмо.'));
    } finally {
      recoverBtn.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    showOk('');
    const bad = validate();
    if (bad) {
      showError(bad);
      return;
    }
    if (!A.canCreateClient()) {
      showError('Сервис временно недоступен.');
      return;
    }
    const client = A.getStudentClient();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    submitBtn.disabled = true;
    try {
      if (mode === 'register') {
        const displayName = nameInput.value.trim();
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName, academy_role: 'student' } },
        });
        if (error) throw error;
        if (!data.session) {
          showOk('Проверьте почту и подтвердите email, затем войдите.');
          setMode('login');
          return;
        }
        await A.callLive(
          'ensure_student',
          { display_name: displayName },
          { accessToken: data.session.access_token }
        );
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await A.callLive(
          'ensure_student',
          { display_name: data.user?.user_metadata?.display_name || '' },
          { accessToken: data.session.access_token }
        );
      }
      if (token) location.href = '/q/?t=' + encodeURIComponent(token);
      else location.href = '/q/cabinet/';
    } catch (err) {
      showError(A.humanizeError(err?.message || err, 'Не удалось войти.'));
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function boot() {
    if (!A.canCreateClient()) return;
    const client = A.getStudentClient();
    const { data } = await client.auth.getSession();
    if (data?.session) {
      if (token) location.replace('/q/?t=' + encodeURIComponent(token));
      else location.replace('/q/cabinet/');
    }
  }

  setMode('login');
  boot();
})();
