(() => {
  "use strict";

  const WRITE_BLOCKED_MESSAGE = "Тестовая версия блокирует изменения в production. Сохраните локальный черновик или вернитесь в редактор.";
  const STORE_READ_BLOCKED_MESSAGE = "Чтение через store-downloads отключено в тестовом просмотре: эта функция может менять схему базы.";
  const originalFetch = window.fetch.bind(window);
  const absoluteUrl = (request) => {
    const value = typeof request === "string" ? request : request?.url;
    try { return new URL(value || "", window.location.href); } catch { return new URL(window.location.href); }
  };
  const requestMethod = (request, init) => String(init?.method || request?.method || "GET").toUpperCase();
  const isSessionAction = (url) => url.pathname.endsWith("/auth/v1/token") || url.pathname.endsWith("/auth/v1/logout");
  // analytics_dashboard currently refreshes daily rollups before returning data.
  // Only allow RPCs that are confirmed side-effect-free in the test preview.
  const READ_ONLY_RPC = new Set(["analytics_all_time_install_count"]);
  const isReadOnlyRpc = (url) => {
    const match = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)\/?$/);
    return Boolean(match && READ_ONLY_RPC.has(decodeURIComponent(match[1])));
  };
  const isStoreDownloads = (url) => /\/functions\/v1\/store-downloads\/?$/i.test(url.pathname);
  const notifyBlocked = (message) => window.parent?.postMessage({ type: "admin-v2:write-blocked", message }, window.location.origin);
  const blockedResponse = (message) => Promise.resolve(new Response(JSON.stringify({ message, code: "ADMIN_V2_TEST_READ_ONLY" }), {
    status: 423,
    statusText: "Test mode is read-only",
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }));

  window.fetch = (request, init = {}) => {
    const url = absoluteUrl(request);
    const method = requestMethod(request, init);
    if (isStoreDownloads(url) && method === "GET") {
      notifyBlocked(STORE_READ_BLOCKED_MESSAGE);
      return blockedResponse(STORE_READ_BLOCKED_MESSAGE);
    }
    if (["GET", "HEAD", "OPTIONS"].includes(method) || isSessionAction(url) || isReadOnlyRpc(url)) return originalFetch(request, init);
    notifyBlocked(WRITE_BLOCKED_MESSAGE);
    return blockedResponse(WRITE_BLOCKED_MESSAGE);
  };

  if (window.XMLHttpRequest) {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__adminV2Method = String(method || "GET").toUpperCase();
      this.__adminV2Url = absoluteUrl(url);
      return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      const method = this.__adminV2Method || "GET";
      const url = this.__adminV2Url || new URL(window.location.href);
      if (isStoreDownloads(url) && method === "GET") {
        notifyBlocked(STORE_READ_BLOCKED_MESSAGE);
        this.abort();
        return undefined;
      }
      if (["GET", "HEAD", "OPTIONS"].includes(method) || isSessionAction(url) || isReadOnlyRpc(url)) return send.apply(this, args);
      notifyBlocked(WRITE_BLOCKED_MESSAGE);
      this.abort();
      return undefined;
    };
  }

  if (navigator.sendBeacon) navigator.sendBeacon = () => false;
  document.addEventListener("submit", (event) => {
    if (event.target?.id === "login-form") {
      // Keep the client-side Supabase login handler; native form submission stays on this test route.
      event.preventDefault();
      return;
    }
    event.preventDefault();
    window.parent?.postMessage({ type: "admin-v2:write-blocked", message: WRITE_BLOCKED_MESSAGE }, window.location.origin);
  }, true);
  window.AdminV2Safety = Object.freeze({ readOnly: true, message: WRITE_BLOCKED_MESSAGE });
})();
