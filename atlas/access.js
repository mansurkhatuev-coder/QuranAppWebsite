(() => {
  const login = document.querySelector('#family-access');
  const create = document.querySelector('#create-access');
  const enterButton = document.querySelector('#atlas-login');
  const createButton = document.querySelector('#create-tree');
  const theme = document.querySelector('#theme-toggle');
  function syncTheme() {
    const light = document.documentElement.dataset.colorScheme === 'light';
    theme.setAttribute('aria-pressed', String(light));
    document.querySelector('meta[name="theme-color"]').content = light ? '#eef0e7' : '#102b29';
  }
  theme.addEventListener('click', () => {
    const next = theme.getAttribute('aria-pressed') === 'true' ? 'dark' : 'light';
    document.documentElement.dataset.colorScheme = next;
    try { localStorage.setItem('drewo-color-scheme-v2',next); } catch {}
    syncTheme();
  });
  syncTheme();
  const params = new URLSearchParams(location.search);
  const familyInvite = ['u', 'c', 'code'].some(key => params.has(key));
  const oldRoute = location.hash;
  function fitDialog() {
    const view = window.visualViewport;
    if (!view) return;
    document.documentElement.style.setProperty("--access-height", view.height + "px");
    document.documentElement.style.setProperty("--access-top", view.offsetTop + "px");
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  fitDialog();
  window.visualViewport?.addEventListener("resize", fitDialog);
  window.visualViewport?.addEventListener("scroll", fitDialog);
  function openLogin() {
    login.showModal();
    const field = document.querySelector('#login-input');
    (field.value ? document.querySelector('#password-input') : field).focus();
  }
  // A local session is only a shortcut. The editor revalidates it on arrival.
  let familyPath = '';
  let managerSession = false;
  try {
    const recent = JSON.parse(localStorage.getItem('nek:lastTree') || 'null');
    if (/^\/drewo(?:-[a-z0-9-]+)?\/$/.test(recent?.path)) {
      const dir = recent.path.split('/')[1];
      if (sessionStorage.getItem('nek-session:' + dir)) familyPath = recent.path;
    }
    const session = JSON.parse(localStorage.getItem('waydean-trees-auth') || 'null');
    managerSession = Number(session?.expires_at) > Date.now() / 1000;
  } catch {}
  if (familyPath || managerSession) {
    enterButton.textContent = familyPath ? 'Моё древо' : 'Мои древа';
    const switcher = document.createElement('button');
    switcher.className = 'top-action';
    switcher.textContent = 'Другой вход';
    switcher.addEventListener('click',openLogin);
    document.querySelector('.top-actions').append(switcher);
  }
  enterButton.addEventListener('click', () => {
    if (familyPath || managerSession) location.assign(familyPath || '/trees/');
    else openLogin();
  });
  createButton.addEventListener('click', () => managerSession ? location.assign('/trees/#create') : create.showModal());
  if (familyInvite || params.get('login') === '1' || oldRoute === '#/nek/login') openLogin();
  if (oldRoute === '#/nek/register') create.showModal();
})();
