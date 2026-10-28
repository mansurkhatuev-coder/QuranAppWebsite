(() => {
  "use strict";

  const app = document.getElementById("app-frame");
  const gate = document.getElementById("access-gate");
  const message = document.getElementById("access-gate-message");
  const actions = document.getElementById("access-gate-actions");
  const localPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  function revealApp() {
    app.hidden = false;
    document.querySelector(".mobile-nav")?.removeAttribute("hidden");
    gate.hidden = true;
  }

  async function checkAccess() {
    actions.hidden = true;
    message.textContent = "Проверяем доступ…";
    if (localPreview) {
      revealApp();
      return;
    }

    const admin = window.AdminSupabase;
    if (!admin?.isEnabled?.()) {
      message.textContent = "Не удалось проверить вход. Откройте админку через старый вариант.";
      actions.hidden = false;
      return;
    }
    try {
      const session = await admin.getSession();
      if (session?.access_token) {
        revealApp();
        return;
      }
      const login = window.AdminReturnRouting?.loginUrl("/admin-v2/", window.location.origin);
      window.location.replace(login || "/admin/");
    } catch {
      message.textContent = "Не удалось проверить вход. Проверьте соединение или откройте старую админку.";
      actions.hidden = false;
    }
  }

  document.getElementById("access-gate-retry")?.addEventListener("click", () => void checkAccess());
  void checkAccess();
})();
