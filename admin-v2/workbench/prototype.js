(() => {
  "use strict";

  const editorOnlyPreview = new URLSearchParams(window.location.search).get("editorOnly") === "1";
  const embeddedWorkbench = new URLSearchParams(window.location.search).get("embedded") === "1";
  const production = window.AdminV2Runtime?.isProduction === true;
  const DRAFT_STORAGE_KEY = "quranapp-admin-v2-workbench-ui-v1";
  const LEGACY_DRAFT_STORAGE_KEY = "quranapp-admin-v2-drafts";
  const TAJWEED_DRAFTS_STORAGE_KEY = "quranapp-admin-v2-workbench-tajweed-docs-v1";
  function readDraftState() {
    try {
      const current = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
      if (current && typeof current === "object") return current;
      const legacy = JSON.parse(localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY) || "null");
      if (legacy && typeof legacy === "object" && (legacy.kind || legacy.materials || legacy.localEdits)) return legacy;
      return {};
    } catch { return {}; }
  }
  const restoredDraft = readDraftState();
  if (embeddedWorkbench) document.body.classList.add("embedded-workbench");
  if (editorOnlyPreview) {
    document.body.classList.add("editor-only-preview");
    document.title = "Таджвид · отдельный тестовый просмотр";
  }

  const RULES = [
    { id: "madd2", label: "Мадд 2", color: "#b27a4a", key: "1" },
    { id: "madd246", label: "Мадд 2–4–6", color: "#e27b24", key: "2" },
    { id: "madd45", label: "Мадд 4–5", color: "#c63b43", key: "3" },
    { id: "madd6", label: "Мадд 6", color: "#8b1e2d", key: "4" },
    { id: "ghunna", label: "Гунна", color: "#3f9a55", key: "5" },
    { id: "qalqala", label: "Калькаля", color: "#4fb6d3", key: "6" },
    { id: "tafkheem", label: "Тафхим", color: "#173f73", key: "7" },
    { id: "silent", label: "Слияние", color: "#8f959b", key: "8" },
    { id: "interdental", label: "Межзубные", color: "#8a6a28", key: "9", strip: false },
  ];
  const TAJWEED_SCHEMA_VERSION = 2;
  const RULE_IDS = new Set(RULES.map((rule) => rule.id));
  const state = {
    kind: editorOnlyPreview ? "tajweed" : "azkar",
    editorTab: editorOnlyPreview ? "markup" : "content",
    filter: "all",
    query: "",
    sortDescending: false,
    duas: [],
    sourceSupportDua: [],
    sourceGeneralDua: [],
    duaManifest: null,
    tajweedDocs: [],
    localTajweedDocs: [],
    sourceAzkarCatalog: [],
    azkarCatalog: [],
    azkarLinks: [],
    materials: [],
    legacyMaterials: Array.isArray(restoredDraft.materials) ? restoredDraft.materials : [],
    localEdits: Object.assign(Object.create(null), restoredDraft.localEdits || {}),
    activeId: String(restoredDraft.activeId || ""),
    activeRef: String(restoredDraft.activeRef || ""),
    toastTimer: null,
    history: [],
    future: [],
    lastHistoryAt: 0,
    lastHistoryKey: "",
  };

  let materialStore = null;
  let materialStoreError = "";
  const pendingTajweedSaves = new Map();
  let tajweedSaveSequence = 0;
  try {
    materialStore = window.AdminV2MaterialDrafts?.createStore(localStorage);
    if (!materialStore) materialStoreError = "Хранилище черновиков не загрузилось.";
  } catch (error) {
    materialStoreError = error.message || "Не удалось прочитать локальные черновики.";
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  function setMobileKeyboardMode(open) {
    const active = Boolean(open && window.matchMedia?.("(max-width: 620px)").matches);
    document.body.classList.toggle("mobile-arabic-keyboard-open", active);
    window.parent?.postMessage({ type: "admin-v2:keyboard-mode", open: active, mobile: true }, window.location.origin);
  }
  window.addEventListener("admin-v2:keyboard-mode", (event) => setMobileKeyboardMode(event.detail?.open));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

  function requestEmbeddedTajweedSave({ saveCloudDraft = false } = {}) {
    const frame = $(".tajweed-editor-embed");
    if (!frame?.contentWindow || !frame.contentDocument?.getElementById("docTranslit")) return Promise.resolve(true);
    const requestId = `tajweed-${Date.now()}-${++tajweedSaveSequence}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingTajweedSaves.delete(requestId);
        resolve(false);
      }, saveCloudDraft ? 20000 : 1200);
      pendingTajweedSaves.set(requestId, { resolve, timer, frame });
      frame.contentWindow.postMessage({ type: "admin-v2:save-tajweed-document", requestId, saveCloudDraft }, window.location.origin);
    });
  }
  const runAfterEmbeddedTajweedSave = window.AdminV2TransitionGuard.create(
    requestEmbeddedTajweedSave,
    { onFailure: () => showToast("Не удалось сохранить таджвид-разметку. Переход отменён, повторите его после проверки места в браузере.") },
  );

  async function persistLocalDraftState({ explicit = false, requestId = "" } = {}) {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        kind: state.kind,
        activeId: state.activeId,
        activeRef: state.activeRef,
        localEdits: state.localEdits,
      }));
    } catch {
      showToast("Браузер не разрешил сохранить локальный черновик.");
      return false;
    }
    if (explicit) {
      const saveCloudTajweed = production && (state.kind === "tajweed" || state.editorTab === "markup");
      const tajweedSaved = await requestEmbeddedTajweedSave({ saveCloudDraft: saveCloudTajweed });
      if (!tajweedSaved) {
        showToast("Не удалось подтвердить сохранение таджвид-разметки. Повторите сохранение.");
        return false;
      }
      try {
        if (production && state.kind === "dua" && state.editorTab !== "markup") {
          const record = editableRecord();
          if (!record?.id || !String(record.text || "").trim()) throw new Error("Перед сохранением заполните ID и арабский текст.");
          await window.AdminSupabase.upsertDuaItem({ ...record, authenticity: record.authenticity || "unknown", status: record.status || "draft" });
          showToast("Дуа сохранено в Supabase как черновик. Для обновления пакетов нажмите «Опубликовать дуа».");
        } else if (saveCloudTajweed) {
          showToast("Черновик таджвида сохранён в Supabase.");
        } else if (production) {
          showToast("Черновик сохранён в браузере. Классические азкары изменятся в приложении только после его обновления.");
        } else {
          showToast("Черновик сохранён на этом устройстве.");
        }
      } catch (error) {
        showToast(error.message || "Не удалось сохранить запись в Supabase.");
        return false;
      }
      const savedToProduction = production && (state.kind === "dua" || saveCloudTajweed);
      window.parent?.postMessage({ type: "admin-v2:saved", requestId: String(requestId || ""), storage: savedToProduction ? "production" : "browser" }, window.location.origin);
    }
    return true;
  }

  function clampMark(mark, length) {
    const start = Math.max(0, Math.min(Number(mark?.start) || 0, length));
    const end = Math.max(0, Math.min(Number(mark?.end) || 0, length));
    if (end <= start) return null;
    const rules = Array.isArray(mark.rules) ? mark.rules.filter((id) => RULE_IDS.has(id)) : [];
    return { start, end, rules, accent: Boolean(mark.accent), hidden: Boolean(mark.hidden), note: String(mark.note || "") };
  }

  function normalizeTajweedDoc(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const doc = {
      version: TAJWEED_SCHEMA_VERSION,
      id: String(source.id || ""),
      title: String(source.title || ""),
      azkarIds: Array.isArray(source.azkarIds) ? source.azkarIds.map(String).filter(Boolean) : [],
      arabic: String(source.arabic || ""),
      transliteration: String(source.transliteration ?? source.text ?? ""),
      marks: [],
    };
    const marks = Array.isArray(source.marks) ? source.marks : [];
    doc.marks = marks.map((mark) => {
      const rules = Array.isArray(mark?.rules) ? mark.rules : mark?.rule ? [mark.rule] : [];
      return clampMark({ ...mark, rules }, doc.transliteration.length);
    }).filter(Boolean);
    return doc;
  }

  function normalizedMarks(doc) {
    return normalizeTajweedDoc(doc).marks.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function collectionForItem(item, kind = state.kind) {
    return window.AdminV2RecordIdentity.collectionOf(item, kind);
  }

  function itemReference(item, kind = state.kind) {
    if (!item?.id || !window.AdminV2RecordIdentity) return "";
    try { return window.AdminV2RecordIdentity.create(collectionForItem(item, kind), item.id); }
    catch { return ""; }
  }

  function setActiveItem(item, kind = state.kind) {
    state.activeId = item?.id == null ? "" : String(item.id);
    state.activeRef = item ? itemReference(item, kind) : "";
  }

  function activeItem() {
    const items = listItems();
    const selected = window.AdminV2RecordIdentity?.find(items, state.activeRef, (item) => collectionForItem(item, state.kind));
    if (selected) return selected;
    const legacySelection = state.activeId ? items.find((item) => String(item.id) === state.activeId) : null;
    if (legacySelection) {
      setActiveItem(legacySelection);
      return legacySelection;
    }
    const first = items[0] || null;
    if (first) setActiveItem(first);
    return first;
  }

  function draftKey(fieldKey, itemId = state.activeId, kind = state.kind) {
    const item = activeItem();
    const collection = item && String(item.id) === String(itemId) ? collectionForItem(item, kind) : collectionForItem({ id: itemId }, kind);
    return `${window.AdminV2RecordIdentity.create(collection, itemId)}:${fieldKey}`;
  }

  function draftValue(fieldKey, fallback = "", itemId = state.activeId, kind = state.kind) {
    const key = draftKey(fieldKey, itemId, kind);
    return Object.prototype.hasOwnProperty.call(state.localEdits, key) ? state.localEdits[key] : String(fallback ?? "");
  }

  function collectionForRecord(record, kind = state.kind) {
    if (kind === "azkar") {
      const selected = activeItem();
      if (selected && azkarRecord(selected) === record) return collectionForItem(selected, kind);
    }
    return collectionForItem(record, kind);
  }

  function editableRecord(item = activeItem()) {
    if (state.kind === "azkar") return azkarRecord(item) || item;
    return item;
  }

  function setRecordInState(collection, record) {
    const id = String(record?.id || "");
    if (!id) return;
    if (collection.startsWith("dua")) window.AdminV2RecordIdentity.tag(record, collection);
    if (collection.startsWith("dua")) {
      const index = state.duas.findIndex((entry) => String(entry.id) === id && collectionForItem(entry, "dua") === collection);
      if (index >= 0) state.duas[index] = record;
      else state.duas.unshift(record);
      state.azkarLinks = buildAzkarLinks(state.tajweedDocs, state.azkarCatalog, state.duas);
    } else if (collection === "azkar") {
      const index = state.azkarCatalog.findIndex((entry) => String(entry.id) === id);
      if (index >= 0) state.azkarCatalog[index] = record;
      else state.azkarCatalog.unshift(record);
      state.azkarLinks = buildAzkarLinks(state.tajweedDocs, state.azkarCatalog, state.duas);
    } else if (collection === "materials") {
      const index = state.materials.findIndex((entry) => String(entry.id) === id);
      if (index >= 0) state.materials[index] = record;
      else state.materials.unshift(record);
    }
  }

  function persistRecord(record, collection = collectionForRecord(record)) {
    if (!materialStore) throw new Error(materialStoreError || "Локальное хранилище недоступно.");
    const saved = materialStore.save(collection, record);
    setRecordInState(collection, saved);
    return saved;
  }

  function relatedDoc(item = activeItem()) {
    if (!item) return null;
    if (state.kind === "tajweed") return item;
    return window.AdminV2TajweedLinks?.findRelated(
      state.kind,
      item,
      state.tajweedDocs,
      itemReference(item, state.kind),
    ) || null;
  }

  function loadLocalTajweedDocs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TAJWEED_DRAFTS_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((doc) => doc && typeof doc.id === "string" && doc.id) : [];
    } catch {
      return [];
    }
  }

  function createRelatedTajweedDoc() {
    return runAfterEmbeddedTajweedSave(() => {
      const item = activeItem();
      if (!item) return;
      const reference = itemReference(item, state.kind);
      let created;
      try {
        created = window.AdminV2TajweedLinks.createDraft({
          kind: state.kind,
          item,
          reference,
          documents: state.tajweedDocs,
        });
        if (!state.localTajweedDocs.some((doc) => String(doc.id) === String(created.id))) {
          state.localTajweedDocs.push(created);
        }
        state.tajweedDocs = window.AdminV2TajweedLinks.mergeDocuments(state.tajweedDocs, state.localTajweedDocs);
        state.azkarLinks = buildAzkarLinks(state.tajweedDocs, state.azkarCatalog, state.duas);
        let persisted = true;
        try {
          localStorage.setItem(TAJWEED_DRAFTS_STORAGE_KEY, JSON.stringify(state.localTajweedDocs));
        } catch {
          persisted = false;
        }
        state.editorTab = "markup";
        renderAll();
        window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
        if (!persisted) showToast("Разметка открыта в текущем сеансе, но браузер не сохранил локальную связь.");
      } catch (error) {
        showToast(error.message || "Не удалось создать локальную разметку.");
      }
    });
  }

  function azkarRecord(item) {
    return item?.catalogRecord || item?.duaRecord || null;
  }

  function displayTitle(item, kind = state.kind) {
    if (!item) return "Материалы не найдены";
    if (kind === "azkar") return azkarRecord(item)?.title || azkarRecord(item)?.navTitle || item.docs?.[0]?.title || item.id;
    return item.title || item.id || "Без названия";
  }

  function itemSubtitle(item, kind = state.kind) {
    if (!item) return "";
    if (kind === "dua") return `${item.category === "support_dua" ? "Поддержка" : "Случаи жизни"} · ${item.authenticity || "без отметки"}`;
    if (kind === "tajweed") {
      const rules = normalizedMarks(item).length;
      return `Связей: ${(item.azkarIds || []).length} · Меток: ${rules}`;
    }
    if (kind === "materials") return `${item.type || "Текст / источник"}${item.source ? ` · ${item.source}` : " · локальная запись"}`;
    const docs = item.docs || [];
    const record = azkarRecord(item);
    const appName = record?.navTitle && record.navTitle !== record.title ? `${record.navTitle} · ` : "";
    return `${appName}ID ${item.id} · ${docs.length} ${docs.length === 1 ? "связь" : "связей"}`;
  }

  function listItems() {
    if (state.kind === "dua") return state.duas;
    if (state.kind === "tajweed") return state.tajweedDocs;
    if (state.kind === "materials") return state.materials;
    return state.azkarLinks;
  }

  function migrateLegacyLocalEdits() {
    const sources = { dua: state.duas, azkar: state.azkarLinks, tajweed: state.tajweedDocs, materials: state.materials };
    for (const [legacyKey, value] of Object.entries(state.localEdits)) {
      if (legacyKey.startsWith("admin-v2-record:")) continue;
      const firstSeparator = legacyKey.indexOf(":");
      const secondSeparator = legacyKey.indexOf(":", firstSeparator + 1);
      if (firstSeparator < 1 || secondSeparator < 0) continue;
      const kind = legacyKey.slice(0, firstSeparator);
      const id = legacyKey.slice(firstSeparator + 1, secondSeparator);
      const fieldKey = legacyKey.slice(secondSeparator + 1);
      const candidates = (sources[kind] || []).filter((item) => String(item.id) === id);
      if (candidates.length !== 1 || !fieldKey) continue;
      const reference = window.AdminV2RecordIdentity.create(collectionForItem(candidates[0], kind), id);
      const nextKey = `${reference}:${fieldKey}`;
      if (!Object.prototype.hasOwnProperty.call(state.localEdits, nextKey)) state.localEdits[nextKey] = value;
      delete state.localEdits[legacyKey];
    }
  }

  function itemSearchText(item, kind = state.kind) {
    if (kind === "azkar") {
      const record = azkarRecord(item) || {};
      return [item.id, record.title, record.navTitle, record.text, record.translation, record.translationChechen, ...(item.docs || []).flatMap((doc) => [doc.title, doc.arabic, doc.transliteration])].join(" ").toLowerCase();
    }
    if (kind === "materials") return [item.id, item.title, item.type, item.arabic, item.transliteration, item.translationRu, item.translationChechen, item.source, item.notes].join(" ").toLowerCase();
    return [item.id, item.title, item.navTitle, item.text, item.arabic, item.transliteration, item.translation].join(" ").toLowerCase();
  }

  function allLibraryEntries() {
    return [
      ...state.duas.map((item) => ({ kind: "dua", item, collection: collectionForItem(item, "dua") })),
      ...state.azkarLinks.map((item) => ({ kind: "azkar", item, collection: collectionForItem(item, "azkar") })),
      ...state.tajweedDocs.map((item) => ({ kind: "tajweed", item, collection: collectionForItem(item, "tajweed") })),
      ...state.materials.map((item) => ({ kind: "materials", item, collection: collectionForItem(item, "materials") })),
    ];
  }

  function visibleItems() {
    const query = state.query.trim().toLowerCase();
    if (query) {
      return allLibraryEntries().filter(({ item, kind }) => itemSearchText(item, kind).includes(query));
    }
    return listItems().filter((item) => {
      if (state.filter === "linked") {
        if (state.kind === "dua" && !state.tajweedDocs.some((doc) => (doc.azkarIds || []).includes(item.id))) return false;
        if (state.kind === "azkar" && !(item.docs || []).length) return false;
        if (state.kind === "tajweed" && !normalizedMarks(item).length) return false;
      }
      if (state.filter === "published" && state.kind === "dua" && item.status !== "published") return false;
      if (state.filter === "published" && state.kind === "tajweed" && !(item.azkarIds || []).length) return false;
      return true;
    });
  }

  function setKindNow(kind) {
    state.kind = kind;
    state.filter = "all";
    state.query = "";
    state.history = [];
    state.future = [];
    updateHistoryButtons();
    state.editorTab = kind === "tajweed" ? "markup" : "content";
    const first = listItems()[0];
    setActiveItem(first);
    $("#library-search").value = "";
    $$(".content-tab").forEach((tab) => {
      const active = tab.dataset.kind === kind;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    updateFilterChoices();
    renderAll();
    persistLocalDraftState();
  }

  function setKind(kind) {
    return runAfterEmbeddedTajweedSave(() => setKindNow(kind));
  }

  function updateFilterChoices() {
    const linked = $("[data-filter='linked']");
    const published = $("[data-filter='published']");
    if (linked) linked.textContent = state.kind === "tajweed" ? "С метками" : "С таджвидом";
    if (published) published.textContent = state.kind === "tajweed" ? "С привязкой" : "Опубликовано";
    if (linked) linked.hidden = state.kind === "materials";
    if (published) published.hidden = state.kind === "azkar" || state.kind === "materials";
  }

  function renderCounts() {
    $("#dua-count").textContent = state.duas.length || "0";
    $("#azkar-count").textContent = `${state.azkarLinks.length}`;
    $("#azkar-count").title = `${state.azkarLinks.length} записей из снимка каталога приложения и тестовых черновиков`;
    $("#materials-count").textContent = state.materials.length || "0";
  }

  function renderLibrary() {
    const visible = visibleItems();
    const list = $("#library-list");
    const globalSearch = Boolean(state.query.trim());
    const title = globalSearch ? "Все материалы" : state.kind === "dua" ? "Дуа" : state.kind === "tajweed" ? "Таджвид-разметка" : state.kind === "materials" ? "Тексты" : "Азкары";
    const addButton = $("#add-material");
    addButton.hidden = state.kind === "tajweed";
    addButton.setAttribute("aria-label", `Создать локальный материал: ${state.kind === "dua" ? "дуа" : state.kind === "azkar" ? "азкар" : "текст"}`);
    addButton.title = `Создать локальный ${state.kind === "dua" ? "черновик дуа" : state.kind === "azkar" ? "черновик азкара" : "текстовый материал"}`;
    $("#library-title").textContent = title;
    $("#library-count").textContent = globalSearch
      ? `${visible.length} результатов · все разделы`
      : state.kind === "azkar" ? `${visible.length} ID-связей из пакета`
        : state.kind === "materials" ? `${visible.length} локальных материалов` : `${visible.length} ${state.kind === "dua" ? "записей" : "документов"}`;
    list.setAttribute("aria-label", title);
    if (!visible.length) {
      list.innerHTML = state.kind === "materials" && !globalSearch
        ? `<div class="library-empty">Создайте локальный образец кнопкой <strong>＋</strong>.<br /><small>Текст останется только в этой тестовой странице.</small></div>`
        : `<div class="library-empty">По этому запросу<br />ничего не найдено</div>`;
      return;
    }
    const sorted = visible.slice().sort((left, right) => {
      const a = globalSearch ? left.item : left;
      const b = globalSearch ? right.item : right;
      const aTitle = displayTitle(a, globalSearch ? left.kind : state.kind);
      const bTitle = displayTitle(b, globalSearch ? right.kind : state.kind);
      const order = aTitle.localeCompare(bTitle, "ru", { sensitivity: "base" }) || String(a.id).localeCompare(String(b.id), "ru");
      return state.sortDescending ? -order : order;
    });
    list.innerHTML = sorted.map((entry) => {
      const kind = globalSearch ? entry.kind : state.kind;
      const item = globalSearch ? entry.item : entry;
      const id = String(item.id || "");
      const collection = globalSearch ? entry.collection : collectionForItem(item, kind);
      const activeRef = window.AdminV2RecordIdentity.create(collection, id);
      const active = kind === state.kind && activeRef === state.activeRef;
      const meta = itemSubtitle(item, kind);
      const record = kind === "azkar" ? azkarRecord(item) : null;
      const count = kind === "azkar" ? `×${record?.targetCount ?? "—"}` : kind === "tajweed" ? normalizedMarks(item).length : kind === "materials" ? "ЛОК" : item.targetCount ?? "—";
      const tag = kind === "azkar" ? `${record?.group || record?.category || "Азкар"} · ${record?.authenticity || "источник не указан"}` : kind === "tajweed" ? ((item.azkarIds || []).length ? "Есть связь" : "Без связи") : kind === "materials" ? item.type || "Материал" : item.category === "support_dua" ? "Поддержка" : "Случаи жизни";
      const typeLabel = kind === "dua" ? "Дуа" : kind === "azkar" ? "Азкар" : kind === "tajweed" ? "Таджвид" : "Текст";
      return `<button type="button" class="library-item${active ? " is-active" : ""}" role="option" aria-selected="${active}" data-item-id="${escapeHtml(id)}" data-item-ref="${escapeHtml(activeRef)}" data-kind="${kind}">
        <span class="library-item-main"><span class="library-item-title">${globalSearch ? `<em class="result-kind">${typeLabel}</em>` : ""}${escapeHtml(displayTitle(item, kind))}</span><span class="library-item-sub">${escapeHtml(meta)}</span><span class="library-item-tags"><i></i>${escapeHtml(tag)}</span></span>
        <span class="library-item-count">${escapeHtml(count)}</span>
      </button>`;
    }).join("");
  }

  function field(label, value, { full = false, arabic = false, multiline = false, note = "", readonly = false, placeholder = "", fieldKey = "", type = "text", min = "", max = "", step = "" } = {}) {
    const cls = `field${full ? " full" : ""}`;
    const inputClass = arabic || multiline ? "field-area" : "field-input";
    const attrs = `${arabic ? ' dir="rtl" lang="ar" spellcheck="false"' : ""}${readonly ? " readonly" : ""}${fieldKey && !readonly ? ` data-draft-field="${escapeHtml(fieldKey)}"` : ""}${placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : ""}${type === "number" ? ` min="${escapeHtml(min)}" max="${escapeHtml(max)}" step="${escapeHtml(step || "1")}" inputmode="numeric"` : ""}`;
    const content = arabic || multiline
      ? `<textarea class="${inputClass}${arabic ? " arabic-input-field" : ""}"${attrs} rows="${arabic ? 4 : 3}">${escapeHtml(value)}</textarea>`
      : `<input class="${inputClass}" type="${type}" value="${escapeHtml(value)}"${attrs} />`;
    return `<label class="${cls}"><span class="field-label-row"><span>${escapeHtml(label)}</span>${note ? `<small>${escapeHtml(note)}</small>` : ""}</span>${content}</label>`;
  }

  function renderExtraTranslations(record, itemId, kind) {
    const rows = Array.isArray(record?.extraTranslations) ? record.extraTranslations : [];
    const countValue = Number(draftValue("extraTranslations.count", rows.length, itemId, kind));
    const count = Math.max(rows.length, Math.min(20, Number.isFinite(countValue) ? countValue : rows.length));
    return Array.from({ length: count }, (_, index) => {
      const row = rows[index] || {};
      const languageKey = `extraTranslations.${index}.label`;
      const textKey = `extraTranslations.${index}.text`;
      return `<div class="translation-row"><div class="translation-row-heading">Перевод ${index + 1}</div><div class="field-grid">
        ${field("Язык", draftValue(languageKey, row.label || row.language || "", itemId, kind), { fieldKey: languageKey, placeholder: "Например, чеченский" })}
        ${field("Текст перевода", draftValue(textKey, row.text || "", itemId, kind), { full: true, multiline: true, fieldKey: textKey })}
      </div></div>`;
    }).join("");
  }

  function renderDuaContent(item) {
    return `<div class="section-heading"><div><h3>Текст дуа</h3><p>Арабский оригинал, транскрипция и русский перевод; повторы и источник сразу под ними.</p></div><span class="section-status">Запись из JSON</span></div>
      <div class="field-grid">
        ${field("Название", draftValue("title", item.title || item.navTitle || ""), { fieldKey: "title" })}
        ${field("Короткое название", draftValue("navTitle", item.navTitle || item.title || ""), { note: "для списка", fieldKey: "navTitle" })}
        ${field("Арабский оригинал", draftValue("text", item.text || ""), { full: true, arabic: true, note: "обязательное поле", fieldKey: "text" })}
        ${field("Транслитерация", draftValue("transliteration", item.transliteration || ""), { full: true, multiline: true, placeholder: "В этой записи не указана", fieldKey: "transliteration" })}
        ${field("Перевод · русский", draftValue("translation", item.translation || ""), { full: true, multiline: true, fieldKey: "translation" })}
      </div>
      <div class="field-grid primary-record-meta">
        ${field("Количество повторов", draftValue("targetCount", item.targetCount ?? ""), { fieldKey: "targetCount", type: "number", min: "0", max: "9999", note: "пусто — значение не задано" })}
        ${field("Источник", draftValue("source.book", item.source?.book || item.source?.summary || item.source?.type || ""), { fieldKey: "source.book", placeholder: "Книга или сборник" })}
      </div>
      <details class="detail-block translation-details" data-extra-translations><summary>Другие переводы</summary><div class="detail-content"><div class="field-grid">
        ${field("Перевод · чеченский", draftValue("translationChechen", item.translationChechen || ""), { full: true, multiline: true, fieldKey: "translationChechen" })}
        ${renderExtraTranslations(item, state.activeId, "dua")}
      </div><button type="button" class="add-translation-button" data-add-translation>＋ Добавить перевод на другом языке</button></div></details>
      <details class="detail-block"><summary>Достоверность и дополнительные сведения</summary><div class="detail-content"><div class="field-grid">
        ${field("Достоверность", draftValue("authenticity", item.authenticity || ""), { fieldKey: "authenticity" })}
        ${field("Группа", draftValue("group", item.group || "Не задана"), { fieldKey: "group" })}
        ${field("Важность", draftValue("importance", item.importance || ""), { fieldKey: "importance" })}
        ${field("Теги", draftValue("tags", (item.tags || []).join(", ")), { full: true, fieldKey: "tags" })}
      </div></div></details>
      <details class="detail-block"><summary>Источник и пояснение</summary><div class="detail-content"><div class="field-grid">
        ${field("Ссылка", draftValue("source.url", item.source?.url || "Не указана"), { fieldKey: "source.url" })}
        ${field("Пояснение", draftValue("benefitHadith.summary", item.benefitHadith?.summary || "Не указано"), { full: true, multiline: true, fieldKey: "benefitHadith.summary" })}
        ${field("Источник пояснения", draftValue("benefitHadith.source", item.benefitHadith?.source || "Не указан"), { fieldKey: "benefitHadith.source" })}
        ${field("Ссылка на пояснение", draftValue("benefitHadith.url", item.benefitHadith?.url || "Не указана"), { fieldKey: "benefitHadith.url" })}
      </div></div></details>`;
  }

  function renderMaterialContent(item) {
    return `<div class="section-heading"><div><h3>Новый текстовый материал</h3><p>Универсальная карточка для аята, хадиса, исторического текста или другого источника.</p></div><span class="section-status">Локальная запись · тест</span></div>
      <div class="field-grid">
        ${field("Название", draftValue("title", item.title || ""), { fieldKey: "title", placeholder: "Название или короткий ориентир" })}
        ${field("Тип материала", draftValue("type", item.type || "Другой текст"), { fieldKey: "type", note: "аят · хадис · история · другое" })}
        ${field("Арабский оригинал", draftValue("arabic", item.arabic || ""), { full: true, arabic: true, note: "клавиатура, шрифт и огласовки доступны в поле", fieldKey: "arabic", placeholder: "اكتب النص العربي هنا" })}
        ${field("Письменная транскрипция", draftValue("transliteration", item.transliteration || ""), { full: true, multiline: true, fieldKey: "transliteration", placeholder: "Транскрипция, которую вы вводите вручную" })}
        ${field("Перевод · русский", draftValue("translationRu", item.translationRu || ""), { full: true, multiline: true, fieldKey: "translationRu" })}
        ${field("Источник / цитата", draftValue("source", item.source || ""), { full: true, multiline: true, fieldKey: "source", placeholder: "Книга, автор, глава, страница или ссылка" })}
        ${field("Заметки", draftValue("notes", item.notes || ""), { full: true, multiline: true, fieldKey: "notes", placeholder: "Примечания к материалу" })}
      </div>
      <details class="detail-block translation-details" data-extra-translations><summary>Другие переводы</summary><div class="detail-content"><div class="field-grid">
        ${field("Перевод · чеченский", draftValue("translationChechen", item.translationChechen || ""), { full: true, multiline: true, fieldKey: "translationChechen" })}
        ${renderExtraTranslations(item, state.activeId, "materials")}
      </div><button type="button" class="add-translation-button" data-add-translation>＋ Добавить перевод на другом языке</button></div></details>
      <div class="prototype-alert material-local-alert"><span class="alert-icon" aria-hidden="true">ⓘ</span><span><strong>Материал сохраняется как локальный черновик на этом устройстве.</strong> В действующий каталог он не отправляется.</span></div>`;
  }

  function renderAzkarContent(link) {
    const doc = relatedDoc(link);
    const record = azkarRecord(link) || {};
    const source = record.source || {};
    const id = String(link?.id || "");
    const draft = (key, fallback = "") => draftValue(key, fallback, id, "azkar");
    const tags = Array.isArray(record.tags) ? record.tags.join(", ") : record.tags || "";
    const linkedDocs = (link?.docs || []).map((entry) => `${entry.title || entry.id} · ${entry.id}`).join("\n");
    const fullMetadata = Object.keys(record).length ? JSON.stringify(record, null, 2) : "Связанная запись дуа";
    const isDuaLink = Boolean(link?.duaRecord);
    return `<div class="prototype-alert azkar-snapshot-alert"><span class="alert-icon" aria-hidden="true">ⓘ</span><span><strong>${isDuaLink ? "ID из пакета связан с записью дуа." : "Поля скопированы из каталога приложения."}</strong> Изменения сохраняются как локальный черновик. Стабильный ID и связи остаются неизменными.</span></div>
      <div class="section-heading"><div><h3>${isDuaLink ? "Данные связанного материала" : "Текст азкара"}</h3><p>Показываем название приложения, текст, повторы, переводы, источник и связанные метки.</p></div><span class="section-status">Снимок каталога · локальный черновик</span></div>
      <div class="field-grid azkar-primary-fields">
        ${field("Название в приложении", draft("title", record.title || record.navTitle || doc?.title || id), { fieldKey: "title" })}
        ${field("Короткое название", draft("navTitle", record.navTitle || record.title || ""), { fieldKey: "navTitle", note: "для навигации в приложении" })}
        ${field("Арабский оригинал", draft("text", record.text || record.arabic || doc?.arabic || ""), { full: true, arabic: true, fieldKey: "text", placeholder: "اكتب النص العربي هنا" })}
        ${field("Транслитерация", draft("transliteration", record.transliteration || doc?.transliteration || ""), { full: true, multiline: true, fieldKey: "transliteration" })}
        ${field("Перевод · русский", draft("translation", record.translation || ""), { full: true, multiline: true, fieldKey: "translation" })}
      </div>
      <div class="field-grid primary-record-meta">
        ${field("Количество повторов", draft("targetCount", record.targetCount ?? ""), { fieldKey: "targetCount", type: "number", min: "0", max: "9999", note: "пусто — значение не задано" })}
        ${field("Источник", draft("source.book", source.book || source.summary || source.type || ""), { fieldKey: "source.book", placeholder: "Книга или сборник" })}
      </div>
      <details class="detail-block azkar-details translation-details" data-extra-translations><summary>Другие переводы</summary><div class="detail-content"><div class="field-grid">
        ${field("Перевод · чеченский", draft("translationChechen", record.translationChechen || ""), { full: true, multiline: true, fieldKey: "translationChechen" })}
        ${renderExtraTranslations(record, id, "azkar")}
      </div><button type="button" class="add-translation-button" data-add-translation>＋ Добавить перевод на другом языке</button></div></details>
      <details class="detail-block azkar-details"><summary>Повторы, группа и достоверность <span class="detail-summary-meta">×${escapeHtml(draft("targetCount", record.targetCount ?? 1))} · ${escapeHtml(record.authenticity || "источник не указан")}</span></summary><div class="detail-content"><div class="field-grid">
        ${field("Раздел / группа", draft("group", record.group || ""), { fieldKey: "group" })}
        ${field("Категория", draft("category", record.category || ""), { fieldKey: "category" })}
        ${field("Достоверность", draft("authenticity", record.authenticity || ""), { fieldKey: "authenticity" })}
        ${field("Важность", draft("importance", record.importance || ""), { fieldKey: "importance" })}
        ${field("Подходящий раздел приложения", draft("placementFit", record.placementFit || ""), { fieldKey: "placementFit" })}
        ${field("Теги", draft("tags", tags), { full: true, fieldKey: "tags", placeholder: "Теги через запятую" })}
      </div></div></details>
      <details class="detail-block azkar-details"><summary>Источник, аят и аудио <span class="detail-summary-meta">${escapeHtml(source.book || source.type || "источник не указан")}</span></summary><div class="detail-content"><div class="field-grid">
        ${field("Вид источника", draft("source.type", source.type || ""), { fieldKey: "source.type" })}
        ${field("Ссылка на источник", draft("source.url", source.url || ""), { fieldKey: "source.url", placeholder: "https://…" })}
        ${field("Номер в сборнике", draft("source.number", source.number || ""), { fieldKey: "source.number" })}
        ${field("Оценка источника", draft("source.grade", source.grade || ""), { fieldKey: "source.grade" })}
        ${field("Кто оценил", draft("source.gradedBy", source.gradedBy || ""), { fieldKey: "source.gradedBy" })}
        ${field("Номер суры", draft("source.sura", source.sura ?? ""), { fieldKey: "source.sura", type: "number", min: "1", max: "114" })}
        ${field("Номер аята", draft("source.ayah", source.ayah ?? ""), { fieldKey: "source.ayah", type: "number", min: "1", max: "286" })}
        ${field("Примечание источника", draft("source.gradeNote", source.gradeNote || ""), { full: true, multiline: true, fieldKey: "source.gradeNote" })}
        ${field("Аудио", JSON.stringify(record.audio || []), { full: true, readonly: true, note: "данные источника приложения" })}
      </div></div></details>
      <details class="detail-block azkar-details"><summary>Пояснение и дополнительные поля</summary><div class="detail-content"><div class="field-grid">
        ${field("Пояснение / достоинство", draft("benefitHadith.summary", record.benefitHadith?.summary || ""), { full: true, multiline: true, fieldKey: "benefitHadith.summary" })}
        ${field("Источник пояснения", draft("benefitHadith.source", record.benefitHadith?.source || ""), { fieldKey: "benefitHadith.source" })}
        ${field("Ссылка на пояснение", draft("benefitHadith.url", record.benefitHadith?.url || ""), { fieldKey: "benefitHadith.url" })}
        ${field("Оценка пояснения", draft("benefitHadith.grade", record.benefitHadith?.grade || ""), { fieldKey: "benefitHadith.grade" })}
        ${field("Связанные документы таджвида", linkedDocs || "Связей нет", { full: true, multiline: true, readonly: true, note: "ID отображаются без изменений" })}
        ${field("ID азкара", id, { readonly: true, note: "стабильный ключ связи" })}
        ${field("Оригинальный ID", record.originalId || "—", { readonly: true })}
      </div></div></details>
      <details class="detail-block azkar-details"><summary>Исходная запись приложения · все поля</summary><div class="detail-content"><div class="field-grid">${field("JSON-снимок", fullMetadata, { full: true, multiline: true, readonly: true })}</div></div></details>`;
  }

  function renderTajweedContent(doc) {
    if (!doc) {
      return `<section class="tajweed-empty-state"><span class="panel-kicker">РАЗМЕТКА ТАДЖВИДА</span><h3>Для этого материала ещё нет связанного документа</h3><p>Создайте отдельную локальную разметку. Она получит собственный ID и связь с выбранным материалом; остальные документы не затронутся.</p><button type="button" class="button button-primary" data-create-related-tajweed>Создать разметку для этого материала</button></section>`;
    }
    const query = new URLSearchParams();
    query.set("workbenchPreview", "1");
    query.set("previewVersion", "admin-v2-recovery-20261027");
    if (doc?.id) query.set("documentId", String(doc.id));
    return `<div class="tajweed-embed-shell">
      <iframe class="tajweed-editor-embed" title="Таджвид-разметка · тестовая копия" src="../tajweed-editor/?${escapeHtml(query.toString())}" loading="eager"></iframe>
    </div>`;
  }

  function mountEmbeddedTajweedEditor(frame, sourceDocument) {
    if (!frame || frame.dataset.toolsMounted === "true") return;
    frame.dataset.toolsMounted = "true";
    frame.addEventListener("load", () => {
      let childDocument;
      let childWindow;
      try {
        childDocument = frame.contentDocument;
        childWindow = frame.contentWindow;
        if (!childDocument?.head || !childDocument?.body) return;
      } catch {
        return;
      }

      childDocument.body.dataset.kind = "tajweed";
      childDocument.body.dataset.editorTab = "markup";
      childDocument.documentElement.dataset.workbenchPreview = "true";

      const productionPullLabel = childDocument.querySelector("#btnCloudPull .label-full");
      if (productionPullLabel) productionPullLabel.textContent = "Загрузить с прода";
      if (editorOnlyPreview) {
        const previewLabel = childDocument.querySelector(".eyebrow .eyebrow-full");
        if (previewLabel) previewLabel.textContent = "ТЕСТОВАЯ КОПИЯ · БЕЗ ПУБЛИКАЦИИ";
        const saveStatus = childDocument.getElementById("saveStatus");
        if (saveStatus) {
          saveStatus.textContent = "Тестовый просмотр";
          saveStatus.classList.remove("ok");
        }
      }

      if (!childDocument.getElementById("workbenchPreviewStyles")) {
        const previewStyles = childDocument.createElement("link");
        previewStyles.id = "workbenchPreviewStyles";
        previewStyles.rel = "stylesheet";
        previewStyles.href = new URL("workbench-preview.css?v=preview-20261019-editor-only", childDocument.baseURI).href;
        childDocument.head.appendChild(previewStyles);
      }

      const blockRemoteWrite = (event) => {
        const button = event.target?.closest?.("#btnCloudPublish, #btnAvailability");
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const status = childDocument.getElementById(button.id === "btnAvailability" ? "availabilityStatus" : "saveStatus");
        if (status) {
          status.textContent = button.id === "btnCloudPublish"
            ? "Публикация отключена в тестовой копии. Текущие данные не отправляются."
              : "Изменение доступности отключено в тестовой копии.";
          status.classList.remove("ok");
        }
      };
      if (!production) childDocument.addEventListener("click", blockRemoteWrite, true);

      const stylesheet = childDocument.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = new URL("../workbench/arabic-input.css?v=admin-v2", childDocument.baseURI).href;
      childDocument.head.appendChild(stylesheet);

      const script = childDocument.createElement("script");
      script.src = new URL("../workbench/arabic-input.js?v=admin-v2", childDocument.baseURI).href;
      childDocument.getElementById("docArabic")?.setAttribute("data-ait-size-scale", "0.34");
      script.addEventListener("load", () => childWindow.ArabicInputTools?.mount(childDocument), { once: true });
      script.addEventListener("error", () => {
        const status = childDocument.getElementById("saveStatus");
        if (status) status.textContent = "Не удалось подключить арабскую клавиатуру";
      }, { once: true });
      childDocument.head.appendChild(script);
      if (sourceDocument?.id) {
        childWindow.postMessage({
          type: "admin-v2:load-tajweed-document",
          document: JSON.parse(JSON.stringify(sourceDocument)),
        }, window.location.origin);
      }
    }, { once: true });
  }

  function renderSources(item, doc) {
    if (state.kind === "materials") {
      return `<div class="section-heading"><div><h3>Источник материала</h3><p>Сохраняйте книгу, главу, страницу или цифровой источник рядом с текстом.</p></div><span class="section-status">Локальный образец</span></div>
        <div class="field-grid">${field("Источник / цитата", draftValue("source", item?.source || ""), { full: true, multiline: true, fieldKey: "source", placeholder: "Автор, название книги, глава, страница, URL" })}${field("Заметки редактора", draftValue("notes", item?.notes || ""), { full: true, multiline: true, fieldKey: "notes" })}</div>
        <div class="prototype-alert material-local-alert"><span class="alert-icon" aria-hidden="true">ⓘ</span><span><strong>Ссылка на источник не отправляется.</strong> Здесь проверяется только структура формы.</span></div>`;
    }
    if (state.kind === "azkar") {
      const docs = item?.docs || [];
      return `<div class="section-heading"><div><h3>Связи с таджвид-разметкой</h3><p>Текущий формат использует стабильные ID из поля <code>azkarIds</code>.</p></div><span class="section-status">${docs.length} ${docs.length === 1 ? "связь" : "связей"}</span></div>
        <div class="prototype-alert"><span class="alert-icon" aria-hidden="true">ⓘ</span><span><strong>Полный каталог в этот тест не включён.</strong> Показаны только документы, которые уже ссылаются на этот ID.</span></div>
        <div class="link-chips">${docs.map((entry) => `<span class="link-chip"><i></i>${escapeHtml(entry.id)}</span>`).join("") || "<span class='link-summary-empty'>Связей нет</span>"}</div>
        <div class="relationship-grid" style="margin-top:12px">${docs.slice(0, 6).map((entry) => `<div class="relationship-card"><span>ДОКУМЕНТ ТАДЖВИДА</span><strong>${escapeHtml(entry.title || entry.id)}</strong><small>${normalizedMarks(entry).length} меток · ${escapeHtml(entry.id)}</small></div>`).join("")}</div>`;
    }
    if (state.kind === "dua") {
      const source = item?.source || {};
      const benefit = item?.benefitHadith || {};
      return `<div class="section-heading"><div><h3>Источник и связи</h3><p>Проверяемые ссылки и пояснения доступны без перегрузки основной формы.</p></div><span class="section-status">${source.url ? "Источник указан" : "Источник не указан"}</span></div>
        <div class="relationship-grid">
          <div class="relationship-card"><span>ИСТОЧНИК</span><strong>${escapeHtml(source.book || source.summary || source.type || "Не указан")}</strong><small>${escapeHtml(source.url || "Ссылка не добавлена")}</small></div>
          <div class="relationship-card"><span>ПОЛЬЗА / ПОЯСНЕНИЕ</span><strong>${escapeHtml(benefit.source || "Не указано")}</strong><small>${escapeHtml(benefit.url || "Ссылка не добавлена")}</small></div>
          <div class="relationship-card"><span>КАТЕГОРИЯ</span><strong>${escapeHtml(item?.category || "—")}</strong><small>${escapeHtml(item?.placementFit || "Размещение не задано")}</small></div>
          <div class="relationship-card"><span>СТАТУС</span><strong>${escapeHtml(item?.status || "published")}</strong><small>JSON-пакет сайта</small></div>
        </div>`;
    }
    const links = item?.azkarIds || [];
    return `<div class="section-heading"><div><h3>Связи документа</h3><p>Связи используются при публикации пакета разметки.</p></div><span class="section-status">${links.length} ${links.length === 1 ? "азкар" : "азкаров"}</span></div>
      <div class="link-chips">${links.map((id) => {
        const linked = state.azkarLinks.find((entry) => String(entry.id) === String(id));
        const reference = linked ? itemReference(linked, "azkar") : window.AdminV2RecordIdentity.create("azkar", id);
        return `<button type="button" class="link-chip link-chip-button" data-kind="azkar" data-link-id="${escapeHtml(id)}" data-link-ref="${escapeHtml(reference)}"><i></i>${escapeHtml(id)}</button>`;
      }).join("") || "<span class='link-summary-empty'>ID-связи не указаны</span>"}</div>
      <div class="relationship-grid" style="margin-top:12px"><div class="relationship-card"><span>В ПАКЕТЕ</span><strong>${escapeHtml(item?.title || item?.id || "—")}</strong><small>${normalizedMarks(item).length} цветных фрагментов</small></div><div class="relationship-card"><span>СМЕЩЕНИЯ</span><strong>По текущей транслитерации</strong><small>Начало и конец каждой метки</small></div></div>`;
  }

  function renderEditorBody(item, doc) {
    if (state.kind === "tajweed" || state.editorTab === "markup") return renderTajweedContent(doc);
    if (!item) return `<div class="library-empty">Данные не загружены.</div>`;
    if (state.editorTab === "sources") return renderSources(item, doc);
    if (state.kind === "dua") return renderDuaContent(item);
    if (state.kind === "materials") return renderMaterialContent(item);
    return renderAzkarContent(item);
  }

  function renderHeader(item, doc) {
    const title = state.kind === "azkar"
      ? draftValue("title", displayTitle(item), item?.id || state.activeId, "azkar")
      : draftValue("title", item?.title || item?.navTitle || item?.id || "Материал");
    const id = state.kind === "azkar" ? item?.id || "—" : item?.id || "—";
    const marksCount = doc ? normalizedMarks(doc).length : 0;
    $("#document-title").textContent = title;
    $("#document-id").textContent = id;
    $("#document-type").textContent = state.kind === "dua"
      ? (item?.category === "support_dua" ? "ДУА · ПОДДЕРЖКА" : "ДУА · СЛУЧАИ ЖИЗНИ")
      : state.kind === "tajweed" ? "ТАДЖВИД · ЦВЕТНАЯ РАЗМЕТКА" : state.kind === "materials" ? "ТЕКСТ · ЛОКАЛЬНЫЙ ОБРАЗЕЦ" : "АЗКАР · СВЯЗАННЫЙ МАТЕРИАЛ";
    $("#document-meta").textContent = state.kind === "dua"
      ? `${item?.authenticity || "достоверность не указана"} · ${item?.status || "published"}`
      : state.kind === "tajweed"
        ? `${(item?.azkarIds || []).length} связанных ID · ${marksCount} меток`
      : state.kind === "materials" ? `${item?.type || "тип не выбран"} · не подключено к публикации` : `${draftValue("targetCount", azkarRecord(item)?.targetCount ?? "—", item?.id, "azkar")} повторов · ${(item?.docs || []).length} связей с таджвидом`;
    $("#version-label").textContent = state.kind === "dua" ? "JSON сайта" : state.kind === "tajweed" ? "Пакет разметки" : state.kind === "materials" ? "Тестовый материал" : "Связь из пакета";
    $("#marks-badge").textContent = marksCount;
    const openTajweed = $("#open-tajweed");
    openTajweed.hidden = !item || state.kind === "tajweed";
    openTajweed.textContent = state.editorTab === "markup" ? "Содержание материала" : "Разметка таджвида";
    openTajweed.setAttribute("aria-pressed", String(state.editorTab === "markup" || state.kind === "tajweed"));
    $("#duplicate-material").hidden = !item || state.kind === "tajweed" || state.editorTab === "markup";
    $("#delete-material").hidden = !item || state.kind === "tajweed" || state.editorTab === "markup";
    $("#breadcrumbs").innerHTML = `<span>Контент</span><b>›</b><span>${state.kind === "dua" ? "Дуа" : state.kind === "tajweed" ? "Таджвид" : state.kind === "materials" ? "Тексты" : "Азкары"}</span><b>›</b><strong>${escapeHtml(title)}</strong>`;
    $("#draft-label").textContent = hasLocalEdits()
      ? (production ? "Есть правки" : "Локально · в памяти")
      : production ? (state.kind === "dua" ? "Supabase" : state.kind === "tajweed" ? "Production" : "Черновик в браузере")
        : "Тестовый просмотр";
    const saveButton = $("#save-local-draft");
    if (saveButton) {
      saveButton.innerHTML = production && state.kind === "dua" && state.editorTab !== "markup"
        ? "Сохранить дуа <span aria-hidden=\"true\">↗</span>"
        : "Сохранить черновик <span aria-hidden=\"true\">↗</span>";
    }
    const publishButton = $("#publish-dua");
    if (publishButton) publishButton.hidden = !production || state.kind !== "dua" || state.editorTab === "markup";
    const deleteButton = $("#delete-material");
    if (deleteButton && production && state.kind === "dua") deleteButton.hidden = true;
    $("#source-note").hidden = state.kind !== "azkar";
    if (state.kind === "azkar") {
      const note = $("#source-note p");
      const tag = $("#source-note .source-note-tag");
      if (production) {
        if (note) note.innerHTML = "<strong>Показан образец каталога из 70 классических азкаров.</strong> Это не полный живой каталог. Черновик не меняет установленное приложение; для этого нужен отдельный выпуск приложения. Связи и ID таджвида остаются исходными.";
        if (tag) tag.textContent = "ОБРАЗЕЦ · 70";
      } else {
        if (note) note.innerHTML = "<strong>Названия и поля показаны из снимка каталога приложения.</strong> Связи и ID взяты из пакета таджвида и остаются неизменными; правки этого предпросмотра хранятся только в открытой вкладке.";
        if (tag) tag.textContent = "ТЕСТОВЫЙ СНИМОК";
      }
    }
    $("#delivery-title").textContent = state.kind === "dua" ? "Дуа" : state.kind === "tajweed" ? "Таджвид-пакет" : state.kind === "materials" ? "Тексты" : "Азкары";
    $("#delivery-copy").textContent = state.kind === "dua"
      ? production ? "Черновик сохраняется в Supabase. Кнопка публикации обновляет пакеты сайта через текущую защищённую функцию." : "Дуа остаются в текущем процессе публикации контента на сайте."
      : state.kind === "tajweed"
        ? production ? "Черновик и выборочная публикация работают через существующий защищённый редактор таджвида." : "Пакет цветной транслитерации сохраняет отдельный черновик и выборочную публикацию."
      : state.kind === "materials" ? "Новые тексты сохраняются как черновики в этом браузере; путь публикации для них ещё не подключён."
          : production ? "Названия и ID сверяются с образцом из 70 записей. Изменения классического азкара требуют обновления приложения." : "Это локальный снимок каталога для сверки полей и названий; ID и связи взяты из пакета таджвида.";

    $(".editor-tabs").hidden = false;
    $$(".editor-tab").forEach((tab) => {
      const selected = tab.dataset.editorTab === state.editorTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.hidden = false;
    });
    document.title = `${title} · Контентная студия`;
  }

  function renderPreview(item, doc) {
    let title = "", arabic = "", translit = "", translation = "", source = "", category = "", repeat = "";
    if (state.kind === "dua") {
      title = draftValue("navTitle", draftValue("title", item?.navTitle || item?.title || "Дуа"));
      arabic = draftValue("text", item?.text || "");
      translit = draftValue("transliteration", item?.transliteration || "");
      translation = draftValue("translation", item?.translation || "");
      source = draftValue("source.book", item?.source?.book || item?.source?.summary || item?.source?.type || "Источник не указан");
      category = item?.category === "support_dua" ? "ДУА ПОДДЕРЖКИ" : "ДУА НА СЛУЧАИ ЖИЗНИ";
      const targetCount = draftValue("targetCount", item?.targetCount ?? "");
      repeat = targetCount === "" ? "Повторы не заданы" : `${targetCount} ${Number(targetCount) === 1 ? "раз" : "раза"}`;
    } else if (state.kind === "materials") {
      title = draftValue("title", item?.title || "Новый материал");
      arabic = draftValue("arabic", item?.arabic || "");
      translit = draftValue("transliteration", item?.transliteration || "");
      translation = draftValue("translationRu", item?.translationRu || "");
      source = draftValue("source", item?.source || "Источник не добавлен");
      category = draftValue("type", item?.type || "МАТЕРИАЛ").toLocaleUpperCase("ru");
      repeat = "Предпросмотр";
    } else if (state.kind === "azkar") {
      const record = azkarRecord(item) || {};
      const sourceInfo = record.source || {};
      title = draftValue("navTitle", draftValue("title", displayTitle(item), item?.id, "azkar"), item?.id, "azkar");
      arabic = draftValue("text", record.text || record.arabic || doc?.arabic || "", item?.id, "azkar");
      translit = draftValue("transliteration", record.transliteration || doc?.transliteration || "", item?.id, "azkar");
      translation = draftValue("translation", record.translation || "", item?.id, "azkar");
      source = draftValue("source.book", sourceInfo.book || sourceInfo.summary || sourceInfo.type || "Источник не указан", item?.id, "azkar");
      category = record.group || record.category || "АЗКАР";
      const targetCount = draftValue("targetCount", record.targetCount ?? "", item?.id, "azkar");
      repeat = targetCount === "" ? "Повторы не заданы" : `${targetCount} повт.`;
    } else {
      const sourceDoc = item;
      title = item?.title || "Таджвид-разметка";
      arabic = draftValue("arabic", sourceDoc?.arabic || "");
      translit = draftValue("transliteration", sourceDoc?.transliteration || "");
      translation = "Цветные метки применяются в приложении к транслитерации.";
      source = `${(item?.azkarIds || []).length} связанных ID`;
      category = "ЦВЕТНАЯ ТРАНСЛИТЕРАЦИЯ";
      repeat = "Предпросмотр";
    }
    $("#phone-section").textContent = state.kind === "dua" ? "МОЛЬБЫ" : state.kind === "materials" ? "МАТЕРИАЛ" : "АЗКАРЫ · ЧТЕНИЕ";
    $("#phone-category").textContent = category;
    $("#phone-title").textContent = title;
    $("#phone-arabic").textContent = arabic;
    $("#phone-translit").textContent = translit;
    $("#phone-translation").textContent = translation;
    $("#phone-repeat").textContent = repeat;
    $("#phone-source").textContent = source;
  }

  function renderLinks(item, doc) {
    const summary = $("#link-summary");
    if (!item) { summary.innerHTML = `<div class="link-summary-empty">Связанные данные не найдены.</div>`; return; }
    if (state.kind === "dua") {
      summary.innerHTML = `<div class="insight-line"><span>Категория</span><strong>${escapeHtml(item.category || "—")}</strong></div><div class="insight-line"><span>Переводы</span><strong>${1 + (item.translationChechen ? 1 : 0) + (item.extraTranslations || []).length}</strong></div><div class="insight-line"><span>Таджвид</span><strong>${doc ? `${normalizedMarks(doc).length} меток` : "не связан"}</strong></div>`;
    } else if (state.kind === "azkar") {
      const record = azkarRecord(item) || {};
      const source = record.source || {};
      summary.innerHTML = `<div class="insight-line"><span>ID записи</span><strong>${escapeHtml(item.id)}</strong></div><div class="insight-line"><span>Повторов</span><strong>${escapeHtml(draftValue("targetCount", record.targetCount ?? "—", item.id, "azkar"))}</strong></div><div class="insight-line"><span>Переводы</span><strong>${Number(Boolean(draftValue("translation", record.translation || "", item.id, "azkar"))) + Number(Boolean(draftValue("translationChechen", record.translationChechen || "", item.id, "azkar")))}</strong></div><div class="insight-line"><span>Источник</span><strong>${escapeHtml(draftValue("source.book", source.book || source.summary || source.type || "не указан", item.id, "azkar"))}</strong></div><div class="insight-line"><span>Материалы таджвида</span><strong>${(item.docs || []).length}</strong></div>`;
    } else if (state.kind === "materials") {
      summary.innerHTML = `<div class="insight-line"><span>Тип</span><strong>${escapeHtml(draftValue("type", item.type || "не выбран"))}</strong></div><div class="insight-line"><span>Переводы</span><strong>${Number(Boolean(draftValue("translationRu", item.translationRu))) + Number(Boolean(draftValue("translationChechen", item.translationChechen)))}</strong></div><div class="insight-line"><span>Источник</span><strong>${draftValue("source", item.source) ? "указан" : "не указан"}</strong></div>`;
    } else {
      summary.innerHTML = `<div class="insight-line"><span>Азкаров связано</span><strong>${(item.azkarIds || []).length}</strong></div><div class="insight-line"><span>Метки таджвида</span><strong>${normalizedMarks(item).length}</strong></div><div class="insight-line"><span>Схема документа</span><strong>версия ${escapeHtml(item.version ?? 2)}</strong></div>`;
    }
  }

  function renderAll() {
    const item = activeItem();
    const doc = relatedDoc(item);
    document.body.dataset.kind = state.kind;
    document.body.dataset.editorTab = state.editorTab;
    const focusMode = state.kind === "tajweed" || state.editorTab === "markup";
    document.body.classList.toggle("tajweed-focus-mode", focusMode);
    if (!focusMode) document.body.classList.remove("show-library", "show-inspector");
    const focusTools = $("#focus-panel-tools");
    if (focusTools) focusTools.hidden = !focusMode;
    renderCounts();
    renderLibrary();
    renderHeader(item, doc);
    $("#editor-body").innerHTML = renderEditorBody(item, doc);
    window.ArabicInputTools?.mount(document);
    mountEmbeddedTajweedEditor($("#editor-body .tajweed-editor-embed"), doc);
    renderPreview(item, doc);
    renderLinks(item, doc);
  }

  function hasLocalEdits(itemId = state.activeId, kind = state.kind) {
    const item = activeItem();
    const collection = item && String(item.id) === String(itemId) ? collectionForItem(item, kind) : collectionForItem({ id: itemId }, kind);
    const prefix = `${window.AdminV2RecordIdentity.create(collection, itemId)}:`;
    return Object.keys(state.localEdits).some((key) => key.startsWith(prefix));
  }

  function updateLocalPreview(fieldKey, value) {
    const item = activeItem();
    const doc = relatedDoc(item);
    if (!item) return;
    if (state.kind === "materials") item[fieldKey] = value;
    renderHeader(item, doc);
    renderPreview(item, doc);
    renderLinks(item, doc);
    if (state.kind === "materials" && ["title", "type"].includes(fieldKey)) renderLibrary();
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
  }

  function applyProductionLabels() {
    if (!production) return;
    document.title = "Контентная студия · QuranApp";
    $("#workbench-mode-badge").textContent = "PRODUCTION";
    $("#workbench-mode-copy").textContent = "Дуа и таджвид подключены к действующим сервисам. Черновики других текстов хранятся отдельно в браузере.";
    $("#workbench-state-indicator").innerHTML = "<i></i>Production · по вашей учётной записи";
    $(".saved-copy").textContent = "Публикация доступна по отдельной кнопке";
    $(".library-foot strong").textContent = "Production";
    $(".library-foot small").textContent = "Сохранение зависит от типа материала";
  }

  function updateHistoryButtons() {
    $("#undo-local").disabled = state.history.length === 0;
    $("#redo-local").disabled = state.future.length === 0;
  }

  function rememberEdit({ collection, id, fieldKey, before, after }) {
    const now = Date.now();
    const last = state.history[state.history.length - 1];
    if (last && last.collection === collection && last.id === id && last.fieldKey === fieldKey && now - state.lastHistoryAt < 900) {
      last.after = after;
    } else {
      state.history.push({ collection, id, fieldKey, before, after });
      if (state.history.length > 100) state.history.shift();
    }
    state.lastHistoryAt = now;
    state.future = [];
    updateHistoryButtons();
  }

  function applyHistory(direction) {
    const undoing = direction === "undo";
    const source = undoing ? state.history : state.future;
    const destination = undoing ? state.future : state.history;
    const entry = source.pop();
    if (!entry || !materialStore) return;
    const record = undoing ? entry.before : entry.after;
    try {
      persistRecord(record, entry.collection);
      const draftPrefix = `${window.AdminV2RecordIdentity.create(entry.collection, entry.id)}:`;
      for (const key of Object.keys(state.localEdits)) if (key.startsWith(draftPrefix)) delete state.localEdits[key];
      destination.push(entry);
      state.lastHistoryAt = 0;
      persistLocalDraftState();
      renderAll();
      updateHistoryButtons();
    } catch (error) {
      source.push(entry);
      showToast(error.message || "Не удалось восстановить изменение.");
    }
  }

  function createLocalId(prefix, records) {
    const used = new Set(records.map((record) => String(record.id)));
    const base = `${production && prefix === "dua" ? "dua" : `local-${prefix}`}-${Date.now().toString(36)}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}-${suffix++}`;
    return candidate;
  }

  function jsonForCurrentMaterial() {
    if (state.editorTab === "markup" || state.kind === "tajweed") {
      const preview = $(".tajweed-editor-embed")?.contentDocument?.getElementById("jsonPreview")?.textContent;
      if (preview) {
        try { return JSON.stringify(JSON.parse(preview), null, 2); } catch { /* Use a full record below. */ }
      }
    }
    const record = state.kind === "azkar" ? editableRecord() : activeItem();
    return record ? JSON.stringify(record, null, 2) : "";
  }

  function downloadJsonFile(filename, content) {
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const temporary = document.createElement("textarea");
      temporary.value = value;
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      temporary.select();
      const copied = document.execCommand("copy");
      temporary.remove();
      return copied;
    }
  }

  function buildAzkarLinks(docs, azkarCatalog = [], duas = []) {
    return window.AdminV2RecordIdentity.buildAzkarLinks(docs, azkarCatalog, duas);
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

  async function load() {
    try {
      const [duaCatalog, tajweed, azkarCatalog] = await Promise.all([
        production
          ? window.AdminSupabase.loadCatalog()
          : Promise.all([fetchJson("../data/support-dua.json"), fetchJson("../data/general-dua.json")])
              .then(([support, general]) => ({ support, general })),
        fetchJson("../data/azkar-tajweed-translit.json"),
        fetchJson("../data/azkar-classic-preview.json"),
      ]);
      state.sourceSupportDua = Array.isArray(duaCatalog.support) ? duaCatalog.support : [];
      state.sourceGeneralDua = Array.isArray(duaCatalog.general) ? duaCatalog.general : [];
      state.duaManifest = duaCatalog.manifest || null;
      state.duas = [
        ...(materialStore?.materialize("dua-support", state.sourceSupportDua) || state.sourceSupportDua).map((record) => window.AdminV2RecordIdentity.tag(record, "dua-support")),
        ...(materialStore?.materialize("dua-general", state.sourceGeneralDua) || state.sourceGeneralDua).map((record) => window.AdminV2RecordIdentity.tag(record, "dua-general")),
      ];
      state.tajweedDocs = Array.isArray(tajweed?.docs) ? tajweed.docs : [];
      state.localTajweedDocs = loadLocalTajweedDocs();
      state.tajweedDocs = window.AdminV2TajweedLinks.mergeDocuments(state.tajweedDocs, state.localTajweedDocs);
      state.sourceAzkarCatalog = Array.isArray(azkarCatalog) ? azkarCatalog : [];
      state.azkarCatalog = materialStore?.materialize("azkar", state.sourceAzkarCatalog) || state.sourceAzkarCatalog;
      state.azkarLinks = buildAzkarLinks(state.tajweedDocs, state.azkarCatalog, state.duas);
      if (materialStore) {
        for (const oldMaterial of state.legacyMaterials) {
          if (oldMaterial?.id && !materialStore.get("materials", oldMaterial.id)) materialStore.save("materials", oldMaterial);
        }
        state.legacyMaterials = [];
        state.materials = materialStore.materialize("materials", []);
      }
      if (!state.materials.length) state.materials = [{
        id: "local-material-01",
        title: "Черновик арабского текста",
        type: "Арабский текст",
        arabic: "",
        transliteration: "",
        translationRu: "",
        translationChechen: "",
        source: "",
        notes: "",
      }];
      migrateLegacyLocalEdits();
      const first = state.azkarLinks[0];
      const savedKind = ["dua", "azkar", "tajweed", "materials"].includes(restoredDraft.kind) ? restoredDraft.kind : "azkar";
      if (!editorOnlyPreview && restoredDraft.kind) state.kind = savedKind;
      if (editorOnlyPreview) setActiveItem(state.tajweedDocs[0] || null, "tajweed");
      else {
        const selected = window.AdminV2RecordIdentity.find(listItems(), state.activeRef, (item) => collectionForItem(item, state.kind));
        if (selected) setActiveItem(selected);
        else {
          const legacySelection = state.activeId ? listItems().find((item) => String(item.id) === state.activeId) : null;
          setActiveItem(legacySelection || listItems()[0] || first || null);
        }
      }
      if (editorOnlyPreview) state.editorTab = "markup";
      updateFilterChoices();
      renderAll();
      if (materialStoreError) showToast(materialStoreError);
    } catch (error) {
      $("#library-count").textContent = production ? "Не удалось загрузить production-каталог" : "Не удалось загрузить JSON";
      const guidance = production ? "Не удалось получить production-данные из Supabase." : "Откройте страницу через локальный сервер.";
      $("#library-list").innerHTML = `<div class="library-empty">${guidance}<br /><small>${escapeHtml(error.message)}</small></div>`;
      showToast(production ? "Не удалось загрузить каталог из Supabase. Проверьте вход и права учётной записи." : "Для загрузки образцов нужен локальный сервер проекта.");
    }
  }

  $(".content-tabs").addEventListener("click", (event) => {
    const panelButton = event.target.closest("[data-focus-panel]");
    if (panelButton) {
      const key = panelButton.dataset.focusPanel === "library" ? "show-library" : "show-inspector";
      const active = !document.body.classList.contains(key);
      document.body.classList.toggle(key, active);
      panelButton.setAttribute("aria-pressed", String(active));
      return;
    }
    const tab = event.target.closest("[data-kind]");
    if (tab) void setKind(tab.dataset.kind);
  });

  $("#library-search").addEventListener("input", (event) => {
    state.query = event.currentTarget.value;
    renderLibrary();
  });

  $("#sort-library")?.addEventListener("click", () => {
    state.sortDescending = !state.sortDescending;
    $("#sort-library").innerHTML = `Сортировка: ${state.sortDescending ? "Я–А" : "А–Я"} <span aria-hidden="true">⌄</span>`;
    renderLibrary();
  });

  $("#library-list").addEventListener("click", (event) => {
    const row = event.target.closest("[data-item-ref]");
    if (!row) return;
    const selectedKind = row.dataset.kind || state.kind;
    const reference = window.AdminV2RecordIdentity.parse(row.dataset.itemRef);
    if (!reference || reference.id !== row.dataset.itemId) return;
    void runAfterEmbeddedTajweedSave(() => {
      if (selectedKind !== state.kind) {
        state.kind = selectedKind;
        state.filter = "all";
        $$(".content-tab").forEach((tab) => {
          const active = tab.dataset.kind === selectedKind;
          tab.classList.toggle("is-active", active);
          tab.setAttribute("aria-selected", String(active));
        });
        updateFilterChoices();
      }
      state.activeId = reference.id;
      state.activeRef = row.dataset.itemRef;
      state.query = "";
      state.history = [];
      state.future = [];
      updateHistoryButtons();
      $("#library-search").value = "";
      state.editorTab = state.kind === "tajweed" ? "markup" : "content";
      renderAll();
      persistLocalDraftState();
    });
  });

  $("#add-material").addEventListener("click", () => {
    void runAfterEmbeddedTajweedSave(() => {
    if (!materialStore) { showToast(materialStoreError || "Локальное хранилище недоступно."); return; }
    const kind = state.kind === "tajweed" ? "materials" : state.kind;
    const collection = kind === "dua" ? "dua-general" : kind;
    const records = kind === "dua" ? state.duas : kind === "azkar" ? state.azkarCatalog : state.materials;
    const id = createLocalId(kind === "dua" ? "dua" : kind === "azkar" ? "azkar" : "text", records);
    const record = kind === "dua"
      ? { id, category: "general_dua", status: "draft", title: "Новое дуа", navTitle: "Новое дуа", text: "", transliteration: "", translation: "", targetCount: null, source: {}, extraTranslations: [] }
      : kind === "azkar"
        ? { id, title: "Новый азкар", navTitle: "Новый азкар", text: "", transliteration: "", translation: "", targetCount: null, source: {}, extraTranslations: [], tags: [] }
        : { id, title: "Новый текстовый материал", type: "Другой текст", arabic: "", transliteration: "", translationRu: "", translationChechen: "", extraTranslations: [], source: "", notes: "" };
    try {
      materialStore.save(collection, record);
      setRecordInState(collection, record);
      state.kind = kind;
      const created = kind === "dua" ? state.duas.find((item) => item.id === id && collectionForItem(item, kind) === collection)
        : kind === "azkar" ? state.azkarLinks.find((item) => item.id === id && collectionForItem(item, "azkar") === collection)
          : state.materials.find((item) => item.id === id);
      setActiveItem(created || { ...record, collection }, kind);
      state.filter = "all";
      state.query = "";
      state.history = [];
      state.future = [];
      $("#library-search").value = "";
      $$(".content-tab").forEach((tab) => {
        const active = tab.dataset.kind === kind;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      updateFilterChoices();
      renderAll();
      persistLocalDraftState();
      window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
      showToast(production && kind === "dua"
        ? "Создан черновик дуа. Сохраните его в Supabase, затем опубликуйте пакет."
        : "Создан черновик в браузере. Он не попал в приложение.");
    } catch (error) { showToast(error.message || "Не удалось создать черновик."); }
    });
  });

  $("#editor-body").addEventListener("input", (event) => {
    const fieldElement = event.target.closest("[data-draft-field]");
    if (!fieldElement) return;
    const fieldKey = fieldElement.dataset.draftField;
    const value = fieldElement.dir === "rtl"
      ? (window.ArabicInputTools?.normalizeArabicText(fieldElement.value) ?? fieldElement.value)
      : fieldElement.value;
    const record = editableRecord();
    if (!record) { showToast("Сначала выберите материал."); return; }
    const collection = collectionForRecord(record);
    const before = JSON.parse(JSON.stringify(record));
    try {
      materialStore?.updateField(collection, record, fieldKey, value, fieldElement.type);
      const after = JSON.parse(JSON.stringify(record));
      rememberEdit({ collection, id: String(record.id), fieldKey, before, after });
      persistRecord(record, collection);
    } catch (error) {
      showToast(error.message || "Не удалось сохранить локальный черновик.");
      return;
    }
    state.localEdits[draftKey(fieldKey)] = value;
    persistLocalDraftState();
    window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
    updateLocalPreview(fieldKey, value);
  });

  $("#filter-strip").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-filter]");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    $$("[data-filter]").forEach((entry) => entry.classList.toggle("is-active", entry === chip));
    renderLibrary();
  });

  $(".editor-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-editor-tab]");
    if (!tab) return;
    void runAfterEmbeddedTajweedSave(() => {
      state.editorTab = tab.dataset.editorTab;
      renderAll();
    });
  });

  $("#save-local-draft")?.addEventListener("click", () => persistLocalDraftState({ explicit: true }));
  $("#publish-dua")?.addEventListener("click", async (event) => {
    if (!production || state.kind !== "dua") return;
    const button = event.currentTarget;
    try {
      const publication = window.AdminV2ProductionContent.buildDuaPublication(state.duas, state.duaManifest);
      const publishedIds = new Set([...publication.supportDua, ...publication.generalDua].map((record) => String(record.id)));
      const hiddenFromPackage = [...state.sourceSupportDua, ...state.sourceGeneralDua]
        .filter((record) => !publishedIds.has(String(record.id)));
      if (hiddenFromPackage.length) {
        throw new Error("В списке есть скрытые исходные дуа. Восстановите их перед публикацией; удаление выполняйте в старом редакторе.");
      }
      const confirmation = [
        `Опубликовать пакет дуа? Записей: ${publishedIds.size}.`,
        "Пакеты сайта и приложения будут обновлены через текущую защищённую функцию.",
        "Продолжить?",
      ].join("\n\n");
      if (!window.confirm(confirmation)) return;
      button.disabled = true;
      button.textContent = "Сохраняем…";
      const draft = materialStore ? JSON.parse(materialStore.exportBackup()) : null;
      const draftRows = [
        ...(draft?.records?.["dua-support"] || []),
        ...(draft?.records?.["dua-general"] || []),
      ].map((entry) => entry?.record || entry).filter((record) => publishedIds.has(String(record?.id)));
      for (const record of draftRows) {
        await window.AdminSupabase.upsertDuaItem({
          ...record,
          authenticity: record.authenticity || "unknown",
          status: record.status || "draft",
        });
      }
      const result = await window.AdminSupabase.publishContent(publication);
      state.duaManifest = publication.manifest;
      state.sourceSupportDua = publication.supportDua;
      state.sourceGeneralDua = publication.generalDua;
      window.parent?.postMessage({ type: "admin-v2:saved", source: "content", storage: "production" }, window.location.origin);
      showToast(`Пакеты опубликованы${result?.publishedAt ? ` · ${result.publishedAt}` : ""}. Сайт обновится после публикации GitHub Pages.`);
    } catch (error) {
      showToast(error.message || "Не удалось опубликовать пакет дуа.");
    } finally {
      button.disabled = false;
      button.textContent = "Опубликовать дуа";
    }
  });
  $("#undo-local")?.addEventListener("click", () => void runAfterEmbeddedTajweedSave(() => applyHistory("undo")));
  $("#redo-local")?.addEventListener("click", () => void runAfterEmbeddedTajweedSave(() => applyHistory("redo")));
  $("#open-tajweed")?.addEventListener("click", () => {
    void runAfterEmbeddedTajweedSave(() => {
      state.editorTab = state.editorTab === "markup" ? "content" : "markup";
      renderAll();
    });
  });
  $("#editor-body")?.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-create-related-tajweed]")) void createRelatedTajweedDoc();
  });
  $("#duplicate-material")?.addEventListener("click", () => {
    void runAfterEmbeddedTajweedSave(() => {
    if (!materialStore) { showToast(materialStoreError || "Локальное хранилище недоступно."); return; }
    const source = editableRecord();
    if (!source) return;
    const collection = collectionForRecord(source);
    const kind = collection.startsWith("dua") ? "dua" : state.kind;
    const target = kind === "dua" ? state.duas : kind === "azkar" ? state.azkarCatalog : state.materials;
    const duplicate = JSON.parse(JSON.stringify(source));
    duplicate.id = createLocalId(kind === "dua" ? "dua" : kind === "azkar" ? "azkar" : "text", target);
    if (duplicate.title) duplicate.title = `${duplicate.title} (копия)`;
    if (duplicate.navTitle) duplicate.navTitle = `${duplicate.navTitle} (копия)`;
    if (kind === "dua") duplicate.status = "draft";
    try {
      materialStore.save(collection, duplicate);
      setRecordInState(collection, duplicate);
      state.kind = kind;
      const copy = kind === "dua" ? state.duas.find((item) => item.id === duplicate.id && collectionForItem(item, kind) === collection)
        : kind === "azkar" ? state.azkarLinks.find((item) => item.id === duplicate.id && collectionForItem(item, "azkar") === collection)
          : state.materials.find((item) => item.id === duplicate.id);
      setActiveItem(copy || { ...duplicate, collection }, kind);
      state.editorTab = "content";
      const draftPrefix = `${window.AdminV2RecordIdentity.create(collection, duplicate.id)}:`;
      state.localEdits = Object.assign(Object.create(null), Object.fromEntries(Object.entries(state.localEdits).filter(([key]) => !key.startsWith(draftPrefix))));
      state.history = [];
      state.future = [];
      $$(".content-tab").forEach((tab) => {
        const active = tab.dataset.kind === kind;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      updateFilterChoices();
      renderAll();
      persistLocalDraftState();
      window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
      showToast("Создана локальная копия с новым ID. Исходная запись не менялась.");
    } catch (error) { showToast(error.message || "Не удалось создать копию."); }
    });
  });
  $("#delete-material")?.addEventListener("click", () => {
    const source = editableRecord();
    if (!source || !materialStore) return;
    const deletePrompt = production
      ? `Скрыть «${displayTitle(activeItem())}» только в черновике этого браузера? Опубликованный пакет приложения не изменится.`
      : `Скрыть «${displayTitle(activeItem())}» только в тестовой библиотеке? Исходный сайт и приложение не изменятся.`;
    if (!window.confirm(deletePrompt)) return;
    const collection = collectionForRecord(source);
    const id = String(source.id);
    void runAfterEmbeddedTajweedSave(() => {
    try {
      materialStore.delete(collection, id);
      if (collection.startsWith("dua")) {
        state.duas = [
          ...materialStore.materialize("dua-support", state.sourceSupportDua).map((record) => window.AdminV2RecordIdentity.tag(record, "dua-support")),
          ...materialStore.materialize("dua-general", state.sourceGeneralDua).map((record) => window.AdminV2RecordIdentity.tag(record, "dua-general")),
        ];
        state.azkarLinks = buildAzkarLinks(state.tajweedDocs, state.azkarCatalog, state.duas);
      } else if (collection === "azkar") {
        state.azkarCatalog = materialStore.materialize("azkar", state.sourceAzkarCatalog);
        state.azkarLinks = buildAzkarLinks(state.tajweedDocs, state.azkarCatalog, state.duas);
      } else if (collection === "materials") {
        state.materials = materialStore.materialize("materials", []);
      }
      setActiveItem(listItems()[0] || null);
      state.history = [];
      state.future = [];
      const draftPrefix = `${window.AdminV2RecordIdentity.create(collection, id)}:`;
      for (const key of Object.keys(state.localEdits)) if (key.startsWith(draftPrefix)) delete state.localEdits[key];
      persistLocalDraftState();
      renderAll();
      window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
      showToast(production ? "Материал скрыт только в черновике этого браузера." : "Материал скрыт только в тестовой библиотеке.");
    } catch (error) { showToast(error.message || "Не удалось скрыть запись."); }
    });
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
    if (event.data.type === "admin-v2:tajweed-save-result") {
      const pending = pendingTajweedSaves.get(String(event.data.requestId || ""));
      if (!pending || event.source !== pending.frame.contentWindow) return;
      window.clearTimeout(pending.timer);
      pendingTajweedSaves.delete(String(event.data.requestId));
      pending.resolve(event.data.saved === true);
      return;
    }
    if (event.data.type === "admin-v2:request-tajweed-document") {
      const frame = $(".tajweed-editor-embed");
      if (!frame || event.source !== frame.contentWindow) return;
      const documentId = String(event.data.documentId || "");
      const sourceDocument = state.tajweedDocs.find((entry) => String(entry.id) === documentId);
      if (sourceDocument) {
        frame.contentWindow.postMessage({
          type: "admin-v2:load-tajweed-document",
          document: JSON.parse(JSON.stringify(sourceDocument)),
        }, window.location.origin);
      } else {
        frame.contentWindow.postMessage({ type: "admin-v2:tajweed-document-missing", documentId }, window.location.origin);
      }
      return;
    }
    if (event.data.type === "admin-v2:keyboard-mode") {
      const tajweedFrame = $(".tajweed-editor-embed");
      if (event.source !== tajweedFrame?.contentWindow) return;
      setMobileKeyboardMode(event.data.open === true && event.data.mobile === true);
    }
    if (event.data.type === "admin-v2:save-draft") {
      void persistLocalDraftState({ explicit: true, requestId: event.data.requestId });
    }
    if (event.data.type === "admin-v2:design" && ["studio", "compact"].includes(event.data.design)) {
      document.documentElement.dataset.design = event.data.design;
      document.querySelectorAll(".tajweed-editor-embed").forEach((frame) => {
        try { frame.contentDocument.documentElement.dataset.design = event.data.design; } catch { /* editor is still loading */ }
      });
    }
  });

  $("#editor-body").addEventListener("click", (event) => {
    const link = event.target.closest("[data-link-id]");
    if (link) {
      const linkRef = link.dataset.linkRef;
      void runAfterEmbeddedTajweedSave(() => {
        setKindNow("azkar");
        const linked = window.AdminV2RecordIdentity.find(state.azkarLinks, linkRef, (item) => collectionForItem(item, "azkar"));
        if (linked) setActiveItem(linked, "azkar");
        renderAll();
      });
    }
  });

  document.addEventListener("click", (event) => {
    const addTranslation = event.target.closest("[data-add-translation]");
    if (addTranslation) {
      void runAfterEmbeddedTajweedSave(() => {
      const item = activeItem();
      const record = state.kind === "azkar" ? azkarRecord(item) || {} : item || {};
      const rows = Array.isArray(record.extraTranslations) ? record.extraTranslations : [];
      const countValue = Number(draftValue("extraTranslations.count", rows.length));
      const count = Math.max(rows.length, Number.isFinite(countValue) ? countValue : rows.length);
      if (count >= 20) { showToast("В тестовом черновике можно добавить до 20 переводов."); return; }
      state.localEdits[draftKey("extraTranslations.count")] = String(count + 1);
      persistLocalDraftState();
      window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
      renderAll();
      const translationPanel = $("#editor-body .translation-details");
      if (translationPanel) translationPanel.open = true;
      $(`#editor-body [data-draft-field="extraTranslations.${count}.label"]`)?.focus();
      });
      return;
    }

    const preview = event.target.closest(".footer-actions [data-notice]");
    if (preview) {
      $(".inspector-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Предпросмотр обновлён по текущим полям.");
      return;
    }

    const action = event.target.closest("[data-workbench-action]");
    if (action) {
      const operation = action.dataset.workbenchAction;
      const menu = $("#more-menu");
      if (menu) menu.hidden = true;
      $("#more-trigger")?.setAttribute("aria-expanded", "false");
      try {
        if (operation === "import") {
          $("#import-backup-file")?.click();
        } else if (operation === "export") {
          if (!materialStore) throw new Error(materialStoreError || "Хранилище черновиков недоступно.");
          downloadJsonFile("quranapp-admin-v2-material-drafts.json", materialStore.exportBackup());
          showToast("Резервная копия локальных черновиков скачана.");
        } else if (operation === "export-current") {
          const value = jsonForCurrentMaterial();
          if (!value) throw new Error("Нет выбранного материала для экспорта.");
          const id = String(activeItem()?.id || "material").replace(/[^a-z0-9_-]+/gi, "-");
          downloadJsonFile(`${id}.json`, value);
          showToast("JSON выбранного материала скачан.");
        } else if (operation === "copy-current") {
          const value = jsonForCurrentMaterial();
          if (!value) throw new Error("Нет выбранного материала для копирования.");
          void copyText(value).then((copied) => showToast(copied ? "JSON материала скопирован." : "Браузер не разрешил копирование."));
        } else if (operation === "help") {
          showToast("Изменения хранятся в этом браузере. В таджвид-редакторе доступны его импорт, экспорт и горячие клавиши 1–9, A, H и Ctrl+Z.");
        }
      } catch (error) { showToast(error.message || "Действие не выполнено."); }
      return;
    }

    const notice = event.target.closest("[data-notice]");
    if (notice) showToast(notice.dataset.notice);
    const toggle = event.target.closest("#more-trigger");
    const menu = $("#more-menu");
    if (toggle) {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      return;
    }
    if (!event.target.closest("#more-menu")) {
      menu.hidden = true;
      $("#more-trigger").setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.target.matches("input, textarea")) {
      event.preventDefault();
      $("#library-search").focus();
    }
    if (event.key === "Escape") {
      $("#more-menu").hidden = true;
      $("#more-trigger").setAttribute("aria-expanded", "false");
    }
  });

  $("#import-backup-file")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast("Резервная копия больше 10 МБ. Выберите меньший файл."); return; }
    try {
      if (!materialStore) throw new Error(materialStoreError || "Хранилище черновиков недоступно.");
      const payload = JSON.parse(await file.text());
      materialStore.importBackup(payload);
      state.localEdits = Object.create(null);
      state.legacyMaterials = [];
      state.history = [];
      state.future = [];
      await load();
      persistLocalDraftState();
      window.parent?.postMessage({ type: "admin-v2:dirty" }, window.location.origin);
      showToast("Черновики импортированы. Предыдущая версия сохранена в резервной копии браузера.");
    } catch (error) { showToast(error.message || "Не удалось импортировать резервную копию."); }
  });

  applyProductionLabels();
  load();
})();
