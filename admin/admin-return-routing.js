(() => {
  "use strict";

  function resolveTarget(requested, origin) {
    if (!requested) return null;
    try {
      const target = new URL(requested, origin);
      if (target.origin !== origin || target.pathname !== "/admin-v2/" || target.search || target.hash) return null;
      return target.href;
    } catch {
      return null;
    }
  }

  function loginUrl(returnTarget, origin) {
    const target = resolveTarget(returnTarget, origin);
    const login = new URL("/admin/", origin);
    if (target) login.searchParams.set("returnTo", new URL(target).pathname);
    return login.href;
  }

  window.AdminReturnRouting = Object.freeze({ resolveTarget, loginUrl });
})();
