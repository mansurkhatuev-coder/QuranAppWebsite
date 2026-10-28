(function installLegacyDraftModule(root, factory) {
  "use strict";

  const moduleApi = factory();
  if (typeof module === "object" && module.exports) module.exports = moduleApi;
  if (!root) return;

  root.AdminV2LegacyDraftsModule = moduleApi;
  if (root.document && root.AdminSupabase) {
    try {
      const adapter = moduleApi.createLegacyDraftAdapter({
        api: root.AdminSupabase,
        storage: root.localStorage,
        window: root,
        document: root.document,
      });
      adapter.install();
      root.AdminV2LegacyDrafts = adapter;
    } catch (error) {
      root.AdminV2LegacyDraftsError = error instanceof Error ? error.message : String(error);
    }
  }
})(typeof globalThis === "object" ? globalThis : this, function createLegacyDraftModule() {
  "use strict";

  const LEGACY_DRAFT_STORAGE_KEY = "quranapp-admin-v2-legacy-drafts-v1";
  const LEGACY_FORM_SNAPSHOT_KEY = "quranapp-admin-v2-legacy-draft";
  const EXPORT_FORMAT = "quranapp-admin-v2-legacy-drafts";
  const LOCAL_ONLY_MESSAGE =
    "В тестовом предпросмотре внешние изменения запрещены. Сохраните локальный черновик или экспортируйте его.";
  const LOCAL_SAVE_ERROR =
    "Не удалось сохранить локальный черновик: хранилище браузера недоступно или заполнено. Освободите место и повторите попытку.";

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function emptyDraft() {
    return {
      version: 1,
      updatedAt: null,
      duaItems: {},
      deletedDuaIds: [],
      announcements: {},
      deletedAnnouncementIds: [],
      dailyPools: null,
      release: null,
      giveawaySettings: null,
      namedDrafts: {},
      formSnapshot: null,
      lastPreviewPayload: null,
    };
  }

  function normalizeDraft(value) {
    const empty = emptyDraft();
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return empty;
    return {
      ...empty,
      ...value,
      duaItems: value.duaItems && typeof value.duaItems === "object" && !Array.isArray(value.duaItems) ? value.duaItems : {},
      deletedDuaIds: Array.isArray(value.deletedDuaIds) ? value.deletedDuaIds.map(String) : [],
      announcements: value.announcements && typeof value.announcements === "object" && !Array.isArray(value.announcements) ? value.announcements : {},
      deletedAnnouncementIds: Array.isArray(value.deletedAnnouncementIds) ? value.deletedAnnouncementIds.map(String) : [],
      namedDrafts: value.namedDrafts && typeof value.namedDrafts === "object" && !Array.isArray(value.namedDrafts) ? value.namedDrafts : {},
    };
  }

  function identifier(value, fieldName) {
    if (value === undefined || value === null || String(value) === "") {
      throw new Error(`Для локального черновика требуется ${fieldName}.`);
    }
    return String(value);
  }

  function localDraftError(cause) {
    const error = new Error(LOCAL_SAVE_ERROR);
    if (cause) error.cause = cause;
    return error;
  }

  function createLegacyDraftAdapter(options = {}) {
    const api = options.api || {};
    const storage = options.storage;
    const clock = options.now || (() => new Date().toISOString());
    const browserWindow = options.window || (typeof window === "object" ? window : null);
    const documentObject = options.document || browserWindow?.document || null;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw localDraftError(new Error("localStorage недоступен"));
    }

    const originalApi = {};
    for (const [name, value] of Object.entries(api)) {
      if (typeof value === "function") originalApi[name] = value.bind(api);
    }

    let state = emptyDraft();
    let storageReadError = null;
    try {
      const raw = storage.getItem(LEGACY_DRAFT_STORAGE_KEY);
      if (raw) state = normalizeDraft(JSON.parse(raw));
    } catch (error) {
      storageReadError = error;
    }

    function announce(type, extra = {}) {
      if (!browserWindow || browserWindow.parent === browserWindow || !browserWindow.parent?.postMessage) return;
      try {
        browserWindow.parent.postMessage({ type, ...extra }, browserWindow.location?.origin || "*");
      } catch {
        // The local draft is already saved. Parent-frame status is only an enhancement.
      }
    }

    function showMessage(message) {
      const status = documentObject?.getElementById?.("publish-status");
      if (status) {
        status.hidden = false;
        status.textContent = message;
      }
    }

    function persist(mutator, operation) {
      if (storageReadError) throw localDraftError(storageReadError);
      const next = normalizeDraft(clone(state));
      mutator(next);
      next.updatedAt = clock();
      let serialized;
      try {
        serialized = JSON.stringify(next);
        storage.setItem(LEGACY_DRAFT_STORAGE_KEY, serialized);
      } catch (error) {
        throw localDraftError(error);
      }
      state = next;
      announce("admin-v2:saved", { source: "legacy", operation, savedAt: next.updatedAt });
      return clone(state);
    }

    function overlayList(baseValue, localById, deletedIds) {
      const deleted = new Set(deletedIds);
      const seen = new Set();
      const result = [];
      for (const baseItem of Array.isArray(baseValue) ? baseValue : []) {
        const id = String(baseItem?.id ?? "");
        if (!id || deleted.has(id)) continue;
        if (Object.prototype.hasOwnProperty.call(localById, id)) {
          result.push(clone(localById[id]));
          seen.add(id);
        } else {
          result.push(clone(baseItem));
          seen.add(id);
        }
      }
      for (const [id, localItem] of Object.entries(localById)) {
        if (!deleted.has(id) && !seen.has(id)) result.push(clone(localItem));
      }
      return result;
    }

    function overlayCatalog(catalog) {
      const result = clone(catalog || {});
      const allBaseItems = [...(Array.isArray(result.support) ? result.support : []), ...(Array.isArray(result.general) ? result.general : [])];
      const allDuaItems = overlayList(allBaseItems, state.duaItems, state.deletedDuaIds);
      result.support = allDuaItems.filter((item) => item.category === "support_dua");
      result.general = allDuaItems.filter((item) => item.category === "general_dua");
      result.announcements = overlayList(result.announcements, state.announcements, state.deletedAnnouncementIds)
        .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
      if (state.dailyPools) {
        result.dailyAyahPool = clone(state.dailyPools.ayahPool);
        result.dailyDuaPool = clone(state.dailyPools.duaPool);
      }
      if (state.release) result.release = clone(state.release);
      return result;
    }

    function saveNamedDraft(key, payload) {
      const saved = persist((next) => {
        next.namedDrafts[key] = { payload: clone(payload), updated_at: clock(), localDraft: true };
      }, `${key}-draft`);
      return { ok: true, localDraft: true, updated_at: saved.updatedAt };
    }

    function rejectExternalWrite(action) {
      const error = new Error(LOCAL_ONLY_MESSAGE);
      announce("admin-v2:write-blocked", { message: error.message, action });
      showMessage(error.message);
      return Promise.reject(error);
    }

    const adapter = {
      storageKey: LEGACY_DRAFT_STORAGE_KEY,

      async loadCatalog() {
        if (!originalApi.loadCatalog) throw new Error("Не настроено чтение каталога админки.");
        return overlayCatalog(await originalApi.loadCatalog());
      },

      async upsertDuaItem(item) {
        const id = identifier(item?.id, "ID материала");
        if (!new Set(["support_dua", "general_dua"]).has(item?.category)) {
          throw new Error("В локальном предпросмотре можно сохранять только дуа из поддерживаемых разделов.");
        }
        persist((next) => {
          next.duaItems[id] = clone(item);
          next.deletedDuaIds = next.deletedDuaIds.filter((entry) => entry !== id);
        }, "dua-item");
      },

      async deleteDuaItem(idValue) {
        const id = identifier(idValue, "ID материала");
        persist((next) => {
          delete next.duaItems[id];
          if (!next.deletedDuaIds.includes(id)) next.deletedDuaIds.push(id);
        }, "dua-delete");
      },

      async upsertHomeAnnouncement(item) {
        const id = identifier(item?.id, "ID баннера");
        persist((next) => {
          next.announcements[id] = clone(item);
          next.deletedAnnouncementIds = next.deletedAnnouncementIds.filter((entry) => entry !== id);
        }, "home-announcement");
      },

      async deleteHomeAnnouncement(idValue) {
        const id = identifier(idValue, "ID баннера");
        persist((next) => {
          delete next.announcements[id];
          if (!next.deletedAnnouncementIds.includes(id)) next.deletedAnnouncementIds.push(id);
        }, "home-announcement-delete");
      },

      async saveHomeDailyPools(ayahPool, duaPool) {
        persist((next) => { next.dailyPools = { ayahPool: clone(ayahPool), duaPool: clone(duaPool) }; }, "home-daily-pools");
      },

      async saveRelease(release) {
        persist((next) => { next.release = clone(release); }, "release");
      },

      async saveGiveawaySettings(settings) {
        persist((next) => { next.giveawaySettings = clone(settings); }, "giveaway-settings");
        return { localDraft: true };
      },

      async loadNamedDraft(name) {
        const saved = state.namedDrafts[name];
        if (saved) return clone(saved);
        const method = name === "ceLocale" ? "loadCeLocaleDraft" : "loadAzkarTajweedDraft";
        if (!originalApi[method]) return null;
        return originalApi[method]();
      },

      async saveNamedDraft(name, payload) {
        return saveNamedDraft(name, payload);
      },

      async publishContent(payload) {
        const updatedAt = clock();
        persist((next) => { next.lastPreviewPayload = clone(payload); }, "preview-export");
        const result = {
          localPreview: true,
          message: "Локальный предпросмотр сохранён. Production не изменён.",
          exportedAt: updatedAt,
        };
        showMessage(result.message);
        return result;
      },

      async refreshAppleDownloads() { return rejectExternalWrite("refreshAppleDownloads"); },
      async refreshGooglePlayDownloads() { return rejectExternalWrite("refreshGooglePlayDownloads"); },
      async uploadRustoreCsv() { return rejectExternalWrite("uploadRustoreCsv"); },
      async uploadGooglePlayCsv() { return rejectExternalWrite("uploadGooglePlayCsv"); },
      async syncAppRelease() { return rejectExternalWrite("syncAppRelease"); },

      saveFormSnapshot(snapshot) {
        persist((next) => { next.formSnapshot = clone(snapshot); }, "form-snapshot");
        return true;
      },

      captureFormSnapshot() {
        if (!documentObject?.querySelectorAll) return null;
        const controls = [...documentObject.querySelectorAll("input, textarea, select")]
          .filter((field) => field.type !== "password" && !field.closest?.("#login-form"));
        return {
          savedAt: clock(),
          values: controls.map((field, index) => ({
            id: field.id || "",
            name: field.name || "",
            type: field.type || field.tagName.toLowerCase(),
            index,
            value: field.value,
            checked: field.type === "checkbox" || field.type === "radio" ? field.checked : undefined,
          })),
        };
      },

      loadFormSnapshot() {
        return clone(state.formSnapshot);
      },

      exportSnapshot() {
        return {
          format: EXPORT_FORMAT,
          version: 1,
          exportedAt: clock(),
          draft: clone(state),
        };
      },

      async importSnapshot(value) {
        if (!value || value.format !== EXPORT_FORMAT || value.version !== 1 || !value.draft || typeof value.draft !== "object") {
          throw new Error("Файл не является резервной копией локальных черновиков V2.");
        }
        const imported = normalizeDraft(value.draft);
        if (value.draft.version !== 1) throw new Error("Версия резервной копии локальных черновиков не поддерживается.");
        if (storageReadError) throw localDraftError(storageReadError);
        try {
          storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(imported));
        } catch (error) {
          throw localDraftError(error);
        }
        state = imported;
        announce("admin-v2:saved", { source: "legacy", operation: "draft-import", savedAt: state.updatedAt });
        return true;
      },

      getSnapshot() { return clone(state); },

      install(installOptions = {}) {
        const targetWindow = installOptions.window || browserWindow;
        const targetDocument = installOptions.document || documentObject;
        for (const method of [
          "loadCatalog", "upsertDuaItem", "deleteDuaItem", "upsertHomeAnnouncement", "deleteHomeAnnouncement",
          "saveHomeDailyPools", "saveRelease", "publishContent", "refreshAppleDownloads",
          "refreshGooglePlayDownloads", "uploadRustoreCsv", "uploadGooglePlayCsv", "syncAppRelease",
        ]) {
          if (method in adapter) api[method] = adapter[method].bind(adapter);
        }
        if (typeof originalApi.loadCeLocaleDraft === "function") api.loadCeLocaleDraft = () => adapter.loadNamedDraft("ceLocale");
        if (typeof originalApi.saveCeLocaleDraft === "function") api.saveCeLocaleDraft = (payload) => adapter.saveNamedDraft("ceLocale", payload);
        if (typeof originalApi.loadAzkarTajweedDraft === "function") api.loadAzkarTajweedDraft = () => adapter.loadNamedDraft("azkarTajweed");
        if (typeof originalApi.saveAzkarTajweedDraft === "function") api.saveAzkarTajweedDraft = (payload) => adapter.saveNamedDraft("azkarTajweed", payload);

        const sdk = targetWindow?.supabase;
        if (sdk && typeof sdk.createClient === "function" && typeof api.getClient === "function") {
          sdk.from = (table) => {
            const client = api.getClient();
            if (!client?.from) throw new Error("Supabase не настроен.");
            return wrapSupabaseBuilder(client.from(table), String(table));
          };
        }

        function blockedBuilder() {
          const result = { data: null, error: new Error(LOCAL_ONLY_MESSAGE) };
          const promise = Promise.resolve(result);
          return new Proxy(promise, {
            get(target, property) {
              if (property === "then" || property === "catch" || property === "finally") {
                return Reflect.get(target, property, target).bind(target);
              }
              if (property === Symbol.toStringTag) return "Promise";
              return () => blockedBuilder();
            },
          });
        }

        function wrapSupabaseBuilder(builder, table) {
          return new Proxy(builder, {
            get(target, property) {
              if (property === "upsert") {
                return (payload) => {
                  if (table !== "academy_giveaway_settings") {
                    announce("admin-v2:write-blocked", { message: LOCAL_ONLY_MESSAGE, action: `supabase.${table}.upsert` });
                    showMessage(LOCAL_ONLY_MESSAGE);
                    return blockedBuilder();
                  }
                  return adapter.saveGiveawaySettings(Array.isArray(payload) ? payload[0] : payload)
                    .then(() => ({ data: null, error: null }))
                    .catch((error) => ({ data: null, error }));
                };
              }
              if (property === "insert" || property === "update" || property === "delete") {
                return () => {
                  announce("admin-v2:write-blocked", { message: LOCAL_ONLY_MESSAGE, action: `supabase.${table}.${String(property)}` });
                  showMessage(LOCAL_ONLY_MESSAGE);
                  return blockedBuilder();
                };
              }
              if (property === "maybeSingle" && table === "academy_giveaway_settings" && state.giveawaySettings) {
                return async () => ({ data: clone(state.giveawaySettings), error: null });
              }
              const value = Reflect.get(target, property, target);
              if (typeof value !== "function") return value;
              return (...args) => {
                const result = Reflect.apply(value, target, args);
                if (result === target) return wrapSupabaseBuilder(target, table);
                if (result && typeof result === "object" && typeof result.then !== "function") return wrapSupabaseBuilder(result, table);
                return result;
              };
            },
          });
        }

        if (targetDocument?.addEventListener) {
          targetDocument.addEventListener("click", (event) => {
            const target = event.target?.closest?.("#publish-site, #publish-site-dock");
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            try {
              const formSnapshot = adapter.captureFormSnapshot();
              if (formSnapshot) adapter.saveFormSnapshot(formSnapshot);
              const bundle = adapter.exportSnapshot();
              const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = targetDocument.createElement("a");
              link.href = url;
              link.download = `quranapp-admin-v2-local-drafts-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              URL.revokeObjectURL(url);
              const message = "Локальная резервная копия создана. Это предпросмотр; production не изменён.";
              showMessage(message);
              announce("admin-v2:saved", { source: "legacy", operation: "preview-export", savedAt: clock() });
            } catch (error) {
              showMessage(error instanceof Error ? error.message : LOCAL_SAVE_ERROR);
            }
          }, true);
        }

        const publishHelp = targetDocument?.getElementById?.("publish-help");
        if (publishHelp) {
          const localHelp = "Сохранения остаются в локальных черновиках. Эта кнопка создаёт резервную копию предпросмотра и не меняет production.";
          const applyLocalHelp = () => {
            if (publishHelp.textContent !== localHelp) publishHelp.textContent = localHelp;
          };
          applyLocalHelp();
          if (targetWindow?.MutationObserver) {
            const helpObserver = new targetWindow.MutationObserver(applyLocalHelp);
            helpObserver.observe(publishHelp, { childList: true, subtree: true, characterData: true });
          }
        }
        const poolsStatus = targetDocument?.getElementById?.("home-pools-status");
        if (poolsStatus && targetWindow?.MutationObserver) {
          const localizePoolsStatus = () => {
            if (/сохранены в Supabase/i.test(poolsStatus.textContent || "")) {
              poolsStatus.textContent = "Пулы сохранены как локальный черновик. Production не изменён.";
            }
          };
          const poolsObserver = new targetWindow.MutationObserver(localizePoolsStatus);
          poolsObserver.observe(poolsStatus, { childList: true, subtree: true, characterData: true });
        }
        const publishBrief = targetDocument?.getElementById?.("hud-brief-fail");
        if (publishBrief && targetWindow?.MutationObserver) {
          const localizePublishBrief = () => {
            if (/правки останутся только в Supabase/i.test(publishBrief.textContent || "")) {
              publishBrief.textContent = "В тестовой V2 кнопка публикации создаёт локальную резервную копию. Сетевые изменения заблокированы.";
            }
          };
          const briefObserver = new targetWindow.MutationObserver(localizePublishBrief);
          briefObserver.observe(publishBrief, { childList: true, subtree: true, characterData: true });
        }
        if (typeof targetWindow?.confirm === "function") {
          try {
            const confirm = targetWindow.confirm.bind(targetWindow);
            targetWindow.confirm = (message) => confirm(String(message)
              .replace(
                "Запись исчезнет из Supabase. Чтобы убрать её из приложения, нажмите «Опубликовать на waydean.ru».",
                "Удаление сохранится только как локальный черновик; production останется без изменений.",
              )
              .replace(
                "После удаления нажмите «Опубликовать на сайте».",
                "Удаление сохранится только как локальный черновик; production останется без изменений.",
              ));
          } catch {
            // The network write fence still protects this preview if a host disallows patching confirm().
          }
        }
        return adapter;
      },
    };

    return adapter;
  }

  return {
    LEGACY_DRAFT_STORAGE_KEY,
    LEGACY_FORM_SNAPSHOT_KEY,
    LOCAL_ONLY_MESSAGE,
    createLegacyDraftAdapter,
  };
});
