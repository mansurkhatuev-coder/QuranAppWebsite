(() => {
  const trigger = document.getElementById('mobile-menu-trigger');
  const sidebar = document.getElementById('admin-sidebar');
  if (!trigger || !sidebar) return;
  let open = false;
  function setOpen(value) {
    open = value;
    sidebar.classList.toggle('is-mobile-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }
  trigger.addEventListener('click', () => setOpen(!open));
  document.addEventListener('click', (event) => {
    if (sidebar.contains(event.target) && event.target.closest('[data-view], [data-legacy-tab], [data-view-link]')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
})();
