(() => {
  "use strict";

  const location = window.location;
  const adminV2Route = /^\/admin-v2(?:\/|$)/.test(String(location.pathname || ""));
  const isProduction = location.origin === "https://waydean.ru" && adminV2Route;
  const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(location.hostname) && adminV2Route;

  window.AdminV2Runtime = Object.freeze({
    mode: isProduction ? "production" : isLocalPreview ? "preview" : "read-only",
    isProduction,
    isPreview: !isProduction,
    adminV2Route,
  });
})();
