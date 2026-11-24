(() => {
  const login = document.querySelector('#family-access');
  const create = document.querySelector('#create-access');
  const enterButton = document.querySelector('#atlas-login');
  const createButton = document.querySelector('#create-tree');
  const params = new URLSearchParams(location.search);
  const familyInvite = ['u', 'c', 'code'].some(key => params.has(key));
  const oldRoute = location.hash;
  function openLogin() {
    login.showModal();
    const field = document.querySelector('#login-input');
    (field.value ? document.querySelector('#password-input') : field).focus();
  }
  enterButton.addEventListener('click', openLogin);
  createButton.addEventListener('click', () => create.showModal());
  if (familyInvite || params.get('login') === '1' || oldRoute === '#/nek/login') openLogin();
  if (oldRoute === '#/nek/register') create.showModal();
})();
