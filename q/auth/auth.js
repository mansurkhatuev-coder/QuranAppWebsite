(function () {
  const A = window.AcademyLive;
  const form = document.getElementById('auth-form');
  const recoveryForm = document.getElementById('recovery-form');
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
  const recoveryPassword = document.getElementById('recovery-password');
  const recoveryPassword2 = document.getElementById('recovery-password2');
  const recoveryError = document.getElementById('recovery-error');
  const recoveryOk = document.getElementById('recovery-ok');
  const recoverySubmit = document.getElementById('recovery-submit');
  const tabs = document.querySelector('.q-auth-tabs');

  const token = A.resolveHubToken();
  if (token) backHub.href = '/q/?t=' + encodeURIComponent(token);

  let mode = 'login';
  let recoveryMode = false;

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

  function showRecoveryError(message) {
    recoveryError.hidden = !message;
    recoveryError.textContent = message || '';
    if (message) recoveryOk.hidden = true;
  }

  function showRecoveryOk(message) {
    recoveryOk.hidden = !message;
    recoveryOk.textContent = message || '';
    if (message) recoveryError.hidden = true;
  }

  function setRecoveryMode(on) {
    recoveryMode = on;
    form.hidden = on;
    recoveryForm.hidden = !on;
    if (tabs) tabs.hidden = on;
    recoverBtn.hidden = on || mode === 'register';
    showError('');
    showOk('');
    showRecoveryError('');
    showRecoveryOk('');
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
    recoverBtn.hidden = register || recoveryMode;
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

  function hashLooksLikeRecovery() {
    try {
      const hash = (location.hash || '').replace(/^#/, '');
      const params = new URLSearchParams(hash);
      return params.get('type') === 'recovery';
    } catch (_) {
      return false;
    }
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
      const redirectTo =
        location.origin + '/q/auth/' + (token ? `?t=${encodeURIComponent(token)}` : '');
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      showOk('Если аккаунт есть, письмо для сброса пароля отправлено.');
    } catch (err) {
      showError(A.humanizeError(err?.message || err, 'Не удалось отправить письмо.'));
    } finally {
      recoverBtn.disabled = false;
    }
  });

  recoveryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showRecoveryError('');
    showRecoveryOk('');
    const p1 = recoveryPassword.value;
    const p2 = recoveryPassword2.value;
    if (p1.length < 6) {
      showRecoveryError('Пароль — минимум 6 символов.');
      return;
    }
    if (p1 !== p2) {
      showRecoveryError('Пароли не совпадают.');
      return;
    }
    if (!A.canCreateClient()) {
      showRecoveryError('Сервис временно недоступен.');
      return;
    }
    const client = A.getStudentClient();
    recoverySubmit.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password: p1 });
      if (error) throw error;
      showRecoveryOk('Пароль обновлён. Переходим…');
      setTimeout(() => {
        if (token) location.replace('/q/?t=' + encodeURIComponent(token));
        else location.replace('/q/cabinet/');
      }, 700);
    } catch (err) {
      showRecoveryError(A.humanizeError(err?.message || err, 'Не удалось сохранить пароль.'));
    } finally {
      recoverySubmit.disabled = false;
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

    client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });

    if (hashLooksLikeRecovery()) {
      setRecoveryMode(true);
      return;
    }

    const { data } = await client.auth.getSession();
    if (data?.session && !recoveryMode) {
      if (token) location.replace('/q/?t=' + encodeURIComponent(token));
      else location.replace('/q/cabinet/');
    }
  }

  setMode('login');
  boot();
})();
