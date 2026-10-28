(() => {
  "use strict";

  const embedded = window.parent !== window;
  const announce = (type) => {
    if (embedded) window.parent.postMessage({ type }, window.location.origin);
  };

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("input:not([type='password']), textarea, select")) announce("admin-v2:dirty");
  }, true);
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("input:not([type='password']), textarea, select")) announce("admin-v2:dirty");
  }, true);

  window.addEventListener("message", async (event) => {
    if (!embedded || event.origin !== window.location.origin || event.data?.type !== "admin-v2:save-draft") return;
    try {
      const saved = await window.CeWorkbench?.save();
      announce(saved === true ? "admin-v2:saved" : "admin-v2:dirty");
    } catch {
      announce("admin-v2:dirty");
    }
  });
})();
