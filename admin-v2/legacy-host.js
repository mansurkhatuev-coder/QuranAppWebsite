(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const embedded = params.get("embed") === "1" && window.parent !== window;
  const DRAFT_KEY = "quranapp-admin-v2-legacy-draft";
  const getEditableSnapshot = () => {
    const controls = [...document.querySelectorAll("input, textarea, select")]
      .filter((field) => field.type !== "password" && !field.closest("#login-form"));
    return {
      savedAt: new Date().toISOString(),
      values: controls.map((field, index) => ({
        id: field.id || "",
        name: field.name || "",
        type: field.type || field.tagName.toLowerCase(),
        index,
        value: field.value,
        checked: field.type === "checkbox" || field.type === "radio" ? field.checked : undefined,
      })),
    };
  };

  if (embedded) {
    document.body.classList.add("admin-v2-embedded");
    const note = document.createElement("div");
    note.className = "admin-v2-safety-note";
    note.innerHTML = '<span class="safety-note-dot"></span><span><strong>Тестовая копия</strong> · production заблокирован · изменения сохраняются как локальные черновики</span>';
    document.body.prepend(note);

    const announce = (type, extra = {}) => window.parent.postMessage({ type, ...extra }, window.location.origin);
    const activateSection = (section) => {
      if (typeof window.setActiveTab === "function") window.setActiveTab(String(section || "command"));
      if (section === "analytics") {
        const range = document.getElementById("analytics-range");
        if (range && range.dataset.adminV2AllTime !== "true") {
          range.dataset.adminV2AllTime = "true";
          range.value = "0";
          range.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };
    const saveDraft = () => {
      try {
        const snapshot = getEditableSnapshot();
        if (window.AdminV2LegacyDrafts?.saveFormSnapshot) window.AdminV2LegacyDrafts.saveFormSnapshot(snapshot);
        else localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
        return true;
      } catch (error) {
        const status = document.getElementById("publish-status");
        if (status) {
          status.hidden = false;
          status.textContent = error instanceof Error ? error.message : "Не удалось сохранить локальный черновик.";
        }
        return false;
      }
    };
    let didRestoreDraft = false;
    let restoreObserver = null;
    const restoreDraft = () => {
      let snapshot;
      try {
        snapshot = window.AdminV2LegacyDrafts?.loadFormSnapshot?.();
        if (!snapshot) snapshot = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      } catch { return; }
      if (!Array.isArray(snapshot?.values)) { didRestoreDraft = true; restoreObserver?.disconnect(); return; }
      const controls = [...document.querySelectorAll("input, textarea, select")]
        .filter((field) => field.type !== "password" && !field.closest("#login-form"));
      for (const entry of snapshot.values) {
        let field = entry.id ? document.getElementById(entry.id) : null;
        if (!field && controls[entry.index]?.name === entry.name && controls[entry.index]?.type === entry.type) field = controls[entry.index];
        if (!field || field.type === "password") continue;
        if (field.type === "checkbox" || field.type === "radio") field.checked = Boolean(entry.checked);
        else field.value = String(entry.value ?? "");
      }
      didRestoreDraft = true;
      restoreObserver?.disconnect();
    };
    let restoreTimer = 0;
    const queueRestore = () => {
      const appScreen = document.getElementById("app-screen");
      if (didRestoreDraft || appScreen?.hidden) return;
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => {
        const releaseFormReady = Boolean(document.querySelector("#release-form input, #release-form textarea, #release-form select"));
        const initError = document.getElementById("admin-init-error");
        if (!releaseFormReady && initError?.hidden !== false) return;
        restoreDraft();
      }, 300);
    };
    let saveTimer = 0;
    const queueSave = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveDraft, 300);
    };
    restoreObserver = new MutationObserver(queueRestore);
    restoreObserver.observe(document.getElementById("app-screen") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    queueRestore();
    document.addEventListener("input", (event) => {
      if (event.target?.matches?.("input:not([type='password']), textarea, select")) { announce("admin-v2:dirty"); queueSave(); }
    }, true);
    document.addEventListener("change", (event) => {
      if (event.target?.matches?.("input:not([type='password']), textarea, select")) { announce("admin-v2:dirty"); queueSave(); }
    }, true);

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "admin-v2:navigate") {
        activateSection(event.data.section);
      }
      if (event.data.type === "admin-v2:load-overview-analytics") {
        void window.AdminAnalytics?.loadOverviewSeries?.();
      }
      if (event.data.type === "admin-v2:save-draft" || event.data.type === "admin-v2:capture-draft") {
        announce(saveDraft() ? "admin-v2:saved" : "admin-v2:dirty");
      }
    });

    document.addEventListener("DOMContentLoaded", () => {
      const section = params.get("section");
      if (section) activateSection(section);
      announce("admin-v2:ready", { section });
    }, { once: true });
  }
})();
