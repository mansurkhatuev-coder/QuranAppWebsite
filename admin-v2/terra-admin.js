(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const IS_PRODUCTION = window.AdminV2Runtime?.isProduction === true;
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
  const DEMO_DATA = !IS_PRODUCTION && LOCAL_HOSTS.has(window.location.hostname) ? window.AdminV2DemoData : null;
  const DRAFTS_KEY = `quranapp-admin-v2-terra-drafts:v1${DEMO_DATA ? ":demo" : ""}`;
  const labels = {
    overview: "Центр", content: "Дуа и азкары", sections: "Разделы", home: "Главная",
    reviews: "Отзывы", analytics: "Аналитика", translations: "Чеч. UI", tajweed: "Таджвид",
    versions: "Версии приложения", raffle: "Розыгрыш", status: "Состояние сайта",
  };
  const state = {
    records: [], duaRecords: [], azkarRecords: [], tajweedDocuments: [], catalog: null,
    announcements: [], dailyAyahPool: [], dailyDuaPool: [], homeManifest: null,
    release: {}, currentPage: "overview", currentFilter: "all", currentRecord: null,
    currentRecordType: "dua", currentSectionFilter: "", currentSectionSelection: "", dirty: false, bannerEditingId: "", reviewRows: [],
    analytics: null, storeSnapshot: null,
  };
  let toastTimer = 0;
  let tajweedSaveSequence = 0;
  let chartSeries = [];
  const pendingTajweedSaves = new Map();
  const pendingTranslationSaves = new Map();

  function toast(message) {
    const node = $("#toast");
    if (!node) return;
    node.textContent = String(message || "");
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { node.hidden = true; }, 3200);
  }

  function num(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function formatNumber(value) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("ru-RU");
  }

  function setDirty(value, label = "Есть изменения") {
    state.dirty = Boolean(value);
    const status = $("#draft-status");
    if (status && state.currentPage === "content") status.textContent = value ? label : "Сохранено";
    document.body.classList.toggle("has-unsaved-changes", state.dirty);
  }

  function sourceLabel(source) {
    if (!source || typeof source !== "object") return "";
    if (source.book) return String(source.book);
    if (source.summary) return String(source.summary);
    if (source.sura && source.ayah) return `Коран, ${source.sura}:${source.ayah}`;
    return String(source.type || "");
  }

  function recordFromItem(item, category, docs) {
    const linked = docs.find((doc) => Array.isArray(doc.azkarIds) && doc.azkarIds.map(String).includes(String(item.id)));
    return {
      id: String(item.id || ""),
      title: String(item.title || item.navTitle || "Без названия"),
      navTitle: String(item.navTitle || ""),
      type: "dua",
      category,
      group: String(item.group || (category === "support_dua" ? "Поддержка" : "На случаи жизни")),
      arabic: String(item.text || ""),
      transliteration: String(item.transliteration || linked?.transliteration || ""),
      translation: String(item.translation || ""),
      translationChechen: String(item.translationChechen || ""),
      count: Math.max(1, Number(item.targetCount) || 1),
      source: sourceLabel(item.source),
      sourceUrl: String(item.source?.url || ""),
      sourceNote: String(item.source?.note || ""),
      docId: linked ? String(linked.id) : "",
      status: String(item.status || "published"),
      original: item,
    };
  }

  function recordFromAzkarDoc(doc) {
    const ids = Array.isArray(doc.azkarIds) ? doc.azkarIds.map(String) : [];
    return {
      id: ids[0] || String(doc.id || ""),
      title: String(doc.title || doc.id || "Азкар"),
      navTitle: String(doc.title || doc.id || "Азкар"),
      type: "azkar",
      category: "azkar_tajweed",
      group: "Азкары с разметкой таджвида",
      arabic: String(doc.arabic || ""),
      transliteration: String(doc.transliteration || ""),
      translation: "",
      count: 1,
      source: ids.length ? `Связан по ID · ${ids.join(", ")}` : "Разметка таджвида",
      sourceUrl: "",
      docId: String(doc.id || ""),
      status: "published",
      original: doc,
    };
  }

  function displayTitle(record) {
    return String(record?.type === "azkar"
      ? record.navTitle || record.title || record.id
      : record?.title || record?.navTitle || record?.id || "Без названия");
  }

  async function getJson(url) {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} · ${url}`);
    return response.json();
  }

  function overlayLocalDuaDrafts(support, general, drafts) {
    const result = { support: [...support], general: [...general] };
    if (!drafts || typeof drafts !== "object" || Array.isArray(drafts)) return result;
    for (const value of Object.values(drafts)) {
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string" || !value.id.trim()) continue;
      const list = value.category === "support_dua" ? result.support : value.category === "general_dua" ? result.general : null;
      if (!list) continue;
      const { localSavedAt, ...record } = value;
      const index = list.findIndex((item) => String(item.id) === value.id);
      if (index < 0) list.push(record);
      else list[index] = record;
    }
    return result;
  }

  async function loadCatalog({ quiet = false } = {}) {
    const source = $("#catalog-source");
    if (source) source.textContent = IS_PRODUCTION ? "Подключение к рабочему каталогу…" : "Локальный просмотр";
    try {
      let support = [];
      let general = [];
      let azkarSeed = [];
      let packageData = {};
      if (IS_PRODUCTION) {
        if (!window.AdminSupabase?.isEnabled?.()) throw new Error("Supabase не настроен.");
        const [catalog, azkarPackage] = await Promise.all([
          window.AdminSupabase.loadCatalog(),
          getJson("/data/azkar-tajweed-translit.json"),
        ]);
        state.catalog = catalog;
        support = Array.isArray(catalog.support) ? catalog.support : [];
        general = Array.isArray(catalog.general) ? catalog.general : [];
        packageData = azkarPackage || {};
      } else {
        const [supportData, generalData, azkarData, azkarPackage] = await Promise.all([
          getJson("./data/support-dua.json"), getJson("./data/general-dua.json"),
          getJson("./data/azkar-classic-preview.json"), getJson("/data/azkar-tajweed-translit.json"),
        ]);
        support = Array.isArray(supportData) ? supportData : [];
        general = Array.isArray(generalData) ? generalData : [];
        try {
          const stored = localStorage.getItem(DRAFTS_KEY);
          if (stored) ({ support, general } = overlayLocalDuaDrafts(support, general, JSON.parse(stored)));
        } catch {
          toast("Не удалось прочитать локальные черновики. Проверьте данные браузера.");
        }
        azkarSeed = Array.isArray(azkarData) ? azkarData : [];
        packageData = azkarPackage || {};
        state.catalog = { support, general, release: {}, announcements: [], dailyAyahPool: [], dailyDuaPool: [] };
      }

      const docs = Array.isArray(packageData.docs) ? packageData.docs : [];
      state.tajweedDocuments = docs;
      state.duaRecords = [
        ...support.map((item) => recordFromItem(item, "support_dua", docs)),
        ...general.map((item) => recordFromItem(item, "general_dua", docs)),
      ];
      const uniqueAzkar = new Map();
      [...docs.map(recordFromAzkarDoc), ...azkarSeed.map((item) => ({
        id: String(item.id || ""), title: String(item.navTitle || item.title || item.id || "Азкар"),
        navTitle: String(item.navTitle || item.title || item.id || "Азкар"), type: "azkar", category: "azkar_tajweed",
        group: String(item.group || "Азкары"), arabic: String(item.text || item.arabic || ""),
        transliteration: String(item.transliteration || ""), translation: String(item.translation || ""),
        count: Math.max(1, Number(item.targetCount) || 1), source: sourceLabel(item.source),
        sourceUrl: String(item.source?.url || ""), docId: String(item.docId || ""), status: "sample", original: item,
      }))].forEach((record) => {
        if (record.id && !uniqueAzkar.has(record.id)) uniqueAzkar.set(record.id, record);
      });
      state.azkarRecords = Array.from(uniqueAzkar.values());
      state.records = [...state.duaRecords, ...state.azkarRecords];
      if (IS_PRODUCTION) {
        state.announcements = Array.isArray(state.catalog.announcements) ? state.catalog.announcements : [];
        state.dailyAyahPool = Array.isArray(state.catalog.dailyAyahPool) ? state.catalog.dailyAyahPool : [];
        state.dailyDuaPool = Array.isArray(state.catalog.dailyDuaPool) ? state.catalog.dailyDuaPool : [];
        state.homeManifest = state.catalog.homeManifest || null;
        state.release = state.catalog.release || {};
      }
      updateCounts();
      renderCatalog();
      renderBanners();
      fillReleaseForm();
      if (source) source.textContent = IS_PRODUCTION ? "Рабочий каталог · Supabase + пакет разметки" : "Тестовый образец · сохранение только локально";
      if (!quiet) toast(IS_PRODUCTION ? "Данные загружены" : "Образец загружен");
      return true;
    } catch (error) {
      if (source) source.textContent = IS_PRODUCTION ? "Рабочий каталог недоступен" : "Не удалось загрузить образец";
      if (!quiet) toast(`Не удалось загрузить данные: ${error.message || error}`);
      updateCounts();
      renderCatalog();
      return false;
    }
  }

  function updateCounts() {
    $("#count-all").textContent = String(state.records.length);
    $("#count-dua").textContent = String(state.duaRecords.length);
    $("#count-azkar").textContent = String(state.azkarRecords.length);
    $("#count-text").textContent = "0";
    $("#stat-materials").textContent = String(state.records.length);
    renderSectionCards();
    renderSectionManager();
  }

  function setCatalogFilter(filter) {
    state.currentFilter = filter;
    $$(".tab[data-filter]").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === filter));
    const typeSelect = $("#type-filter");
    if (typeSelect) typeSelect.value = filter;
    renderCatalog();
  }

  function sectionKey(record) {
    if (record.type === "dua") return record.category === "general_dua" ? "general_dua" : "support_dua";
    return `group:${record.group || "Азкары"}`;
  }

  function sectionTitle(record) {
    if (record.type === "dua") return record.category === "general_dua" ? "Случаи жизни" : "Поддержка";
    return record.group || "Азкары";
  }

  function catalogSections() {
    const sections = new Map();
    state.records.forEach((record) => {
      const key = sectionKey(record);
      const section = sections.get(key) || { key, title: sectionTitle(record), records: [] };
      section.records.push(record);
      sections.set(key, section);
    });
    return Array.from(sections.values()).sort((a, b) => {
      const rank = { support_dua: 0, general_dua: 1 };
      return (rank[a.key] ?? 2) - (rank[b.key] ?? 2) || a.title.localeCompare(b.title, "ru");
    });
  }

  function sectionCard(section, compact = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = compact ? "catalog-section-card" : "section-manager-row";
    button.dataset.sectionFilter = section.key;
    const copy = document.createElement("span");
    copy.className = "catalog-section-copy";
    const title = document.createElement("strong");
    title.textContent = section.title;
    const meta = document.createElement("small");
    const duaCount = section.records.filter((record) => record.type === "dua").length;
    const azkarCount = section.records.filter((record) => record.type === "azkar").length;
    meta.textContent = [duaCount ? `${duaCount} ${duaCount === 1 ? "дуа" : "дуа"}` : "", azkarCount ? `${azkarCount} ${azkarCount === 1 ? "азкар" : "азкаров"}` : ""].filter(Boolean).join(" · ") || `${section.records.length} материалов`;
    copy.append(title, meta);
    const count = document.createElement("span");
    count.className = "catalog-section-count";
    count.textContent = String(section.records.length);
    const action = document.createElement("span");
    action.className = "catalog-section-action";
    action.textContent = compact ? "Открыть" : "Открыть материалы";
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-arrow");
    arrow.append(use);
    action.append(arrow);
    button.append(copy, count, action);
    return button;
  }

  function renderSectionCards() {
    const host = $("#catalog-section-cards");
    if (!host) return;
    host.replaceChildren();
    catalogSections().slice(0, 4).forEach((section) => host.append(sectionCard(section, true)));
  }

  function renderSectionManager() {
    const host = $("#section-manager-list");
    if (!host) return;
    host.replaceChildren();
    const sections = catalogSections();
    const detail = $("#section-manager-detail");
    if (!sections.length) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = "Разделы появятся после загрузки каталога.";
      host.append(empty);
      if (detail) detail.replaceChildren();
      return;
    }
    if (!sections.some((section) => section.key === state.currentSectionSelection)) state.currentSectionSelection = sections[0].key;
    sections.forEach((section) => {
      const row = sectionCard(section);
      row.removeAttribute("data-section-filter");
      row.dataset.sectionSelect = section.key;
      row.setAttribute("aria-pressed", String(section.key === state.currentSectionSelection));
      row.classList.toggle("is-selected", section.key === state.currentSectionSelection);
      const action = $(".catalog-section-action", row);
      if (action) action.textContent = "Выбрать";
      host.append(row);
    });

    if (!detail) return;
    detail.replaceChildren();
    const selected = sections.find((section) => section.key === state.currentSectionSelection) || sections[0];
    const typeCount = new Map();
    selected.records.forEach((record) => typeCount.set(record.type, (typeCount.get(record.type) || 0) + 1));
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "ВЫБРАННЫЙ РАЗДЕЛ";
    const title = document.createElement("h2");
    title.textContent = selected.title;
    const summary = document.createElement("p");
    summary.className = "section-manager-summary";
    summary.textContent = [
      `${selected.records.length} ${selected.records.length === 1 ? "материал" : "материалов"}`,
      typeCount.has("dua") ? `${typeCount.get("dua")} дуа` : "",
      typeCount.has("azkar") ? `${typeCount.get("azkar")} азкаров` : "",
    ].filter(Boolean).join(" · ");
    const caption = document.createElement("p");
    caption.className = "section-manager-caption";
    caption.textContent = "Раздел определяется данными каталога. Выберите материал, чтобы открыть его редактор.";
    const listTitle = document.createElement("strong");
    listTitle.className = "section-manager-list-title";
    listTitle.textContent = "Материалы";
    const sampleList = document.createElement("div");
    sampleList.className = "section-manager-samples";
    selected.records.slice(0, 4).forEach((record) => {
      const item = document.createElement("span");
      item.textContent = displayTitle(record);
      sampleList.append(item);
    });
    if (selected.records.length > 4) {
      const more = document.createElement("small");
      more.textContent = `и ещё ${selected.records.length - 4}`;
      sampleList.append(more);
    }
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button subdued section-manager-open";
    open.dataset.sectionFilter = selected.key;
    open.textContent = "Открыть материалы";
    detail.append(eyebrow, title, summary, caption, listTitle, sampleList, open);
  }

  function updateGroupFilter() {
    const select = $("#group-filter");
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option("Все разделы", ""));
    catalogSections().forEach((section) => select.add(new Option(section.title, section.key)));
    select.value = Array.from(select.options).some((option) => option.value === selected) ? selected : "";
  }

  function renderCatalog() {
    const query = $("#search")?.value.trim().toLocaleLowerCase("ru") || "";
    const filtered = state.records.filter((record) => {
      const kind = state.currentFilter === "all" || record.type === state.currentFilter;
      const sectionMatch = !state.currentSectionFilter || sectionKey(record) === state.currentSectionFilter;
      const searchable = [record.title, record.navTitle, record.id, record.group, record.source, record.arabic, record.transliteration, record.translation].join(" ").toLocaleLowerCase("ru");
      return kind && sectionMatch && searchable.includes(query);
    });
    const container = $("#catalog-rows");
    if (!container) return;
    container.replaceChildren();
    for (const record of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "catalog-row";
      button.dataset.recordId = record.id;
      button.dataset.recordType = record.type;
      button.dataset.recordCategory = record.category || "";
      const main = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = displayTitle(record);
      const id = document.createElement("small");
      id.textContent = record.id;
      main.append(title, id);
      const kind = document.createElement("span");
      kind.className = "catalog-kind";
      kind.textContent = record.type === "azkar" ? "Азкар" : "Дуа";
      const group = document.createElement("span");
      group.className = "catalog-group-cell";
      group.textContent = sectionTitle(record);
      const detail = document.createElement("small");
      detail.textContent = [record.source || "Источник не указан", record.id, record.docId ? "Таджвид" : ""].filter(Boolean).join(" · ");
      main.append(detail);
      const action = document.createElement("span");
      action.className = "catalog-row-action";
      action.textContent = "Изменить";
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-arrow");
      arrow.append(use);
      action.append(arrow);
      button.append(main, kind, group, action);
      container.append(button);
    }
    $("#catalog-empty").hidden = filtered.length > 0;
    $("#catalog-count").textContent = `Материалов: ${filtered.length}`;
    updateGroupFilter();
    renderSectionCards();
    renderSectionManager();
  }

  function translationsFromItem(item) {
    const rows = [];
    if (item.translation?.trim()) rows.push({ label: "Русский перевод", text: item.translation.trim() });
    if (item.translationChechen?.trim()) rows.push({ label: "Чеченский перевод", text: item.translationChechen.trim() });
    if (Array.isArray(item.extraTranslations)) {
      for (const entry of item.extraTranslations) {
        const text = entry?.text?.trim();
        if (text) rows.push({ label: entry.label?.trim() || "Перевод", text });
      }
    }
    if (!rows.length) rows.push({ label: "Русский перевод", text: "" });
    return rows;
  }

  function addExtraTranslation(label = "", value = "", role = "new", original = null) {
    const row = document.createElement("div");
    row.className = "field extra-translation";
    row.dataset.translationRole = role;
    row.translationOriginal = original;
    const title = document.createElement("label");
    title.textContent = "Язык / подпись перевода";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Например: Чеченский перевод";
    input.value = label;
    title.append(input);
    const bodyLabel = document.createElement("label");
    bodyLabel.textContent = "Текст перевода";
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    textarea.value = value;
    bodyLabel.append(textarea);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button subdued translation-remove";
    remove.textContent = "Убрать перевод";
    remove.addEventListener("click", () => { row.remove(); markEditorDirty(); });
    row.append(title, bodyLabel, remove);
    $("#extra-translations").append(row);
    $("#extra-translations").hidden = false;
    input.addEventListener("input", markEditorDirty);
    textarea.addEventListener("input", markEditorDirty);
    return textarea;
  }

  function renderExtraTranslations(item) {
    const host = $("#extra-translations");
    host.replaceChildren();
    host.hidden = true;
    const rows = [];
    if (item.translationChechen) rows.push({ label: "Чеченский перевод", text: item.translationChechen, role: "chechen" });
    for (const row of Array.isArray(item.extraTranslations) ? item.extraTranslations : []) {
      if (row && typeof row === "object" && !Array.isArray(row)) rows.push({ label: row.label, text: row.text, role: "extra", original: row });
    }
    rows.forEach((row) => addExtraTranslation(row.label || "Перевод", row.text || "", row.role, row.original));
    host.hidden = rows.length === 0;
  }

  function setFormValue(selector, value) {
    const field = $(selector);
    if (field) field.value = value == null ? "" : String(value);
  }

  function renderEditor(record) {
    state.currentRecord = record;
    state.currentRecordType = record.type;
    const item = record.original || {};
    $("#editor-title").textContent = displayTitle(record) || "Материал";
    setFormValue("#title-field", item.title || record.title);
    setFormValue("#nav-title", item.navTitle || record.navTitle);
    setFormValue("#arabic", item.text || record.arabic);
    setFormValue("#transliteration", item.transliteration || record.transliteration);
    setFormValue("#translation", item.translation || record.translation);
    setFormValue("#repeat", item.targetCount || record.count || 1);
    setFormValue("#source", sourceLabel(item.source) || record.source);
    setFormValue("#source-url", item.source?.url || record.sourceUrl);
    setFormValue("#source-note", item.source?.note || "");
    setFormValue("#group", item.group || record.group);
    setFormValue("#material-type-label", record.type === "azkar" ? "Азкар" : "Дуа");
    setFormValue("#category-field", record.category === "general_dua" ? "general_dua" : "support_dua");
    setFormValue("#authenticity", item.authenticity || "unknown");
    setFormValue("#importance", item.importance || "core");
    setFormValue("#tags", Array.isArray(item.tags) ? item.tags.join(", ") : "");
    setFormValue("#benefit-summary", item.benefitHadith?.summary || "");
    setFormValue("#benefit-source", item.benefitHadith?.source || "");
    setFormValue("#benefit-url", item.benefitHadith?.url || "");
    $("#record-id").textContent = record.id || "Создастся при сохранении";
    $("#record-status").textContent = item.status ? ` · ${item.status}` : " · новый черновик";
    $("#rule-status").textContent = record.docId ? "Разметка привязана по ID" : "Разметка не привязана";
    $("#open-tajweed").disabled = !record.docId;
    $("#open-tajweed").title = record.docId ? "Открыть разметку этого материала" : "Для этого материала нет связанного документа таджвида";
    $("#category-field").disabled = Boolean(record.id);
    $("#editor-view").hidden = false;
    $("#catalog-view").hidden = true;
    $("#tajweed-view").hidden = true;
    $("#draft-destination").textContent = IS_PRODUCTION ? "Черновик сохранится в Supabase" : "Черновик останется в этом браузере";
    $("#publish-dua").hidden = !IS_PRODUCTION || record.type !== "dua";
    $("#load-production").hidden = !IS_PRODUCTION;
    renderExtraTranslations(item);
    setEditorTab("text");
    setDirty(false);
    updatePhone();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updatePhone() {
    const form = readForm();
    const title = form.navTitle || form.title || "Новый материал";
    $("#editor-title").textContent = title;
    $("#phone-title").textContent = title;
    $("#phone-kind").textContent = state.currentRecordType === "azkar" ? "АЗКАР" : "ДУА";
    $("#phone-source").textContent = form.source || "—";
    $("#phone-arabic").textContent = form.arabic || "—";
    $("#phone-translation").textContent = form.translation || "";
    $("#phone-count").textContent = `0/${form.count}`;
  }

  function readForm() {
    return {
      title: $("#title-field").value,
      navTitle: $("#nav-title").value,
      arabic: $("#arabic").value,
      transliteration: $("#transliteration").value,
      translation: $("#translation").value,
      count: Math.max(1, Number($("#repeat").value) || 1),
      source: $("#source").value,
      sourceUrl: $("#source-url").value,
      sourceNote: $("#source-note").value,
      group: $("#group").value,
      category: $("#category-field").value,
      authenticity: $("#authenticity").value,
      importance: $("#importance").value,
      tags: $("#tags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
      benefitSummary: $("#benefit-summary").value,
      benefitSource: $("#benefit-source").value,
      benefitUrl: $("#benefit-url").value,
      extra: [{ label: "Русский перевод", text: $("#translation").value, _role: "ru" }, ...$$(".extra-translation").map((row) => ({
        label: $("input", row).value,
        text: $("textarea", row).value,
        _role: row.dataset.translationRole,
        _original: row.translationOriginal,
      }))],
    };
  }

  function translationsToItemFields(rows) {
    let translation;
    let translationChechen;
    const extraTranslations = [];
    for (const row of rows) {
      const label = String(row.label || "Перевод").trim() || "Перевод";
      const text = String(row.text || "").trim();
      if (!text) continue;
      if (row._role === "ru") { translation = text; continue; }
      if (row._role !== "extra" && !translationChechen && label.toLowerCase().includes("чечен")) { translationChechen = text; continue; }
      const original = row._original && typeof row._original === "object" && !Array.isArray(row._original) ? row._original : {};
      extraTranslations.push({ ...original, label, text });
    }
    return {
      translation,
      translationChechen,
      extraTranslations: extraTranslations.length ? extraTranslations : undefined,
    };
  }

  const CYRILLIC_TO_LATIN = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z", и:"i", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f", х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
  };
  function slug(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52);
  }
  function newDuaId(form, category) {
    const seed = [form.transliteration, form.title, form.navTitle].map((value) => slug(String(value || "").toLowerCase().split("").map((char) => CYRILLIC_TO_LATIN[char] ?? char).join(""))).find(Boolean) || "dua";
    const prefix = category === "support_dua" ? "support" : "general";
    const base = `${prefix}-${seed}`.slice(0, 64);
    const existing = new Set(state.duaRecords.map((item) => item.id));
    if (!existing.has(base)) return base;
    let suffix = 2;
    while (existing.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  function buildDuaItem() {
    const record = state.currentRecord;
    const form = readForm();
    const base = record?.original && typeof record.original === "object" ? record.original : {};
    const id = record?.id || newDuaId(form, form.category);
    const translations = translationsToItemFields(form.extra);
    const existingSource = base.source && typeof base.source === "object" && !Array.isArray(base.source) ? base.source : null;
    const source = { ...(existingSource || {}) };
    const initialSourceLabel = sourceLabel(existingSource) || record?.source || "";
    if (form.source.trim() !== initialSourceLabel.trim()) {
      const key = !source.book && Object.hasOwn(source, "summary") ? "summary" : "book";
      source[key] = form.source.trim() || undefined;
    }
    source.url = form.sourceUrl.trim() || undefined;
    source.note = form.sourceNote.trim() || undefined;
    const hasSource = Object.values(source).some((value) => value !== undefined && value !== null && value !== "");
    if (!existingSource && hasSource) source.type = "dua";
    const benefitHadith = { ...(base.benefitHadith && typeof base.benefitHadith === "object" ? base.benefitHadith : {}) };
    benefitHadith.summary = form.benefitSummary.trim() || undefined;
    benefitHadith.source = form.benefitSource.trim() || undefined;
    benefitHadith.url = form.benefitUrl.trim() || undefined;
    const hasBenefit = Object.values(benefitHadith).some((value) => value !== undefined && value !== null && value !== "");
    return {
      ...base,
      id,
      category: record?.id ? (base.category || record.category) : form.category,
      title: form.title.trim() || form.navTitle.trim() || id,
      navTitle: form.navTitle.trim() || form.title.trim() || id,
      text: form.arabic.trim(),
      transliteration: form.transliteration.trim() || undefined,
      translation: translations.translation,
      translationChechen: translations.translationChechen,
      extraTranslations: translations.extraTranslations,
      targetCount: Number(form.count) > 0 ? Number(form.count) : 1,
      group: form.group.trim() || undefined,
      authenticity: form.authenticity || base.authenticity || "unknown",
      importance: form.importance || base.importance || "core",
      tags: form.tags,
      source: hasSource ? source : undefined,
      benefitHadith: hasBenefit ? benefitHadith : undefined,
      placementFit: record?.id ? base.placementFit : (form.category === "support_dua" ? "support" : "general"),
      audio: Array.isArray(base.audio) ? base.audio : [],
      status: base.status || "draft",
    };
  }

  function storeLocalDraft(item) {
    const all = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
    if (!all || typeof all !== "object" || Array.isArray(all)) throw new Error("Не удалось прочитать локальные черновики.");
    if (Object.hasOwn(all, item.id) && all[item.id]?.category === item.category) delete all[item.id];
    all[`${item.category}:${item.id}`] = { ...item, localSavedAt: new Date().toISOString() };
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
  }

  function replaceDuaItem(item) {
    const docs = state.tajweedDocuments;
    const category = item.category === "general_dua" ? "general_dua" : "support_dua";
    const index = state.duaRecords.findIndex((record) => record.id === item.id && record.category === category);
    const mapped = recordFromItem(item, category, docs);
    if (index < 0) state.duaRecords.unshift(mapped);
    else state.duaRecords[index] = mapped;
    state.records = [...state.duaRecords, ...state.azkarRecords];
    updateCounts();
    renderCatalog();
    renderEditor(mapped);
  }

  async function saveDuaDraft({ silent = false } = {}) {
    if (!state.currentRecord || state.currentRecordType !== "dua") return false;
    let item;
    try {
      item = buildDuaItem();
      if (!item.text) throw new Error("Арабский текст обязателен.");
      if (!item.title) throw new Error("Укажите название.");
      if (IS_PRODUCTION) await window.AdminSupabase.upsertDuaItem(item);
      else storeLocalDraft(item);
      replaceDuaItem(item);
      setDirty(false);
      $("#draft-status").textContent = IS_PRODUCTION ? "Черновик сохранён" : "Локальный черновик сохранён";
      $("#draft-destination").textContent = IS_PRODUCTION ? "Supabase · запись не опубликована" : "Только этот браузер";
      if (!silent) toast(IS_PRODUCTION ? "Черновик сохранён в Supabase" : "Черновик сохранён на этом устройстве");
      return true;
    } catch (error) {
      if (!silent) toast(error.message || "Не удалось сохранить черновик");
      return false;
    }
  }

  async function publishDua() {
    if (!IS_PRODUCTION || !state.currentRecord || state.currentRecordType !== "dua") return;
    const button = $("#publish-dua");
    try {
      if (state.dirty && !await saveDuaDraft({ silent: true })) return;
      const publication = window.AdminV2ProductionContent.buildDuaPublication(
        state.duaRecords.map((record) => record.original), state.catalog?.manifest,
      );
      const count = publication.supportDua.length + publication.generalDua.length;
      if (!window.confirm(`Опубликовать пакеты дуа? Записей: ${count}. Обновятся JSON сайта и приложения.`)) return;
      button.disabled = true;
      button.textContent = "Публикуем…";
      const result = await window.AdminSupabase.publishContent(publication);
      state.catalog.manifest = publication.manifest;
      toast(`Пакеты дуа опубликованы${result?.publishedAt ? ` · ${result.publishedAt}` : ""}`);
    } catch (error) {
      toast(error.message || "Публикация дуа не удалась");
    } finally {
      button.disabled = false;
      button.textContent = "Опубликовать дуа";
    }
  }

  function setEditorTab(name) {
    $$(".editor-tab").forEach((button) => {
      const active = button.dataset.editorTab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$('[data-editor-panel]').forEach((panel) => { panel.hidden = panel.dataset.editorPanel !== name; });
  }

  function sourceDocumentFor(documentId) {
    const source = state.tajweedDocuments.find((doc) => String(doc.id) === String(documentId));
    if (!source) return null;
    const copy = JSON.parse(JSON.stringify(source));
    if (state.currentRecord?.docId !== String(documentId) || state.currentRecordType !== "dua") return copy;
    const form = readForm();
    const normalizeArabic = (value) => String(value || "").normalize("NFC").replace(/\s+/g, " ").trim();
    if (normalizeArabic(form.arabic) !== normalizeArabic(state.currentRecord.arabic)) copy.arabic = form.arabic;
    if (form.transliteration !== state.currentRecord.transliteration) copy.transliteration = form.transliteration;
    copy.title = form.title || copy.title;
    return copy;
  }

  function openTajweed() {
    const record = state.currentRecord;
    if (!record?.docId) { toast("Для материала нет связанного документа таджвида."); return; }
    const frame = $("#tajweed-frame");
    const query = new URLSearchParams({ workbenchPreview: "1", documentId: record.docId, ...(DEMO_DATA ? { demo: "1", previewVersion: "terra-preview" } : {}) });
    frame.addEventListener("load", () => {
      try {
        const child = frame.contentDocument;
        const childWindow = frame.contentWindow;
        if (child?.head && !child.getElementById("terraArabicInputStyles")) {
          const css = child.createElement("link");
          css.id = "terraArabicInputStyles";
          css.rel = "stylesheet";
          css.href = new URL("../workbench/arabic-input.css?v=admin-v2-production-20261029", child.baseURI).href;
          child.head.append(css);
          const script = child.createElement("script");
          script.src = new URL("../workbench/arabic-input.js?v=admin-v2-production-20261029", child.baseURI).href;
          child.getElementById("docArabic")?.setAttribute("data-ait-size-scale", "0.34");
          script.addEventListener("load", () => childWindow.ArabicInputTools?.mount(child), { once: true });
          child.head.append(script);
        }
        const source = sourceDocumentFor(record.docId);
        if (source) frame.contentWindow.postMessage({ type: "admin-v2:load-tajweed-document", document: source }, window.location.origin);
      } catch (error) { toast(`Не удалось открыть редактор: ${error.message || error}`); }
    }, { once: true });
    frame.src = `./tajweed-editor/?${query}`;
    $("#tajweed-title").textContent = displayTitle(record);
    $("#catalog-view").hidden = true;
    $("#editor-view").hidden = true;
    $("#tajweed-view").hidden = false;
    document.body.classList.add("tajweed-view-active");
    $("#crumb").textContent = "Таджвид";
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function requestEmbeddedTajweedSave() {
    const frame = $("#tajweed-frame");
    if (!frame?.contentWindow || !frame.contentDocument?.getElementById("docTranslit")) return Promise.resolve(true);
    const requestId = `terra-tajweed-${Date.now()}-${++tajweedSaveSequence}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingTajweedSaves.delete(requestId);
        resolve(false);
      }, IS_PRODUCTION ? 22000 : 2500);
      pendingTajweedSaves.set(requestId, { resolve, timer, frame });
      frame.contentWindow.postMessage({ type: "admin-v2:save-tajweed-document", requestId, saveCloudDraft: IS_PRODUCTION }, window.location.origin);
    });
  }

  function syncDuaFromTajweed() {
    const frame = $("#tajweed-frame");
    if (frame.contentDocument?.getElementById("docId")?.value !== state.currentRecord?.docId) return;
    const arabic = frame.contentDocument?.getElementById("docArabic")?.value;
    const transliteration = frame.contentDocument?.getElementById("docTranslit")?.value;
    if (arabic === undefined || transliteration === undefined) return;
    const arabicField = $("#arabic");
    const translitField = $("#transliteration");
    if (arabicField.value !== arabic) arabicField.value = arabic;
    if (translitField.value !== transliteration) translitField.value = transliteration;
    markEditorDirty();
    updatePhone();
  }

  function markEditorDirty() {
    setDirty(true);
    updatePhone();
  }

  const svgNS = "http://www.w3.org/2000/svg";
  function svgElement(tag, attributes = {}) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function drawChart(selector, detailSelector, data, coverageSelector) {
    const svg = $(selector);
    if (!svg) return;
    svg.replaceChildren();
    const detail = $(detailSelector);
    if (detail) {
      const label = $("span", detail);
      const value = $("strong", detail);
      if (label) label.textContent = "Выберите точку на графике";
      if (value) value.textContent = "—";
    }
    const valid = (Array.isArray(data) ? data : []).filter((row) => row && (num(row.active_installs ?? row.active) != null || num(row.new_installs ?? row.fresh) != null));
    if (!valid.length) {
      const label = svgElement("text", { x: 360, y: 110, "text-anchor": "middle", class: "chart-empty" });
      label.textContent = "Нет данных за этот период";
      svg.append(label);
      if (coverageSelector) $(coverageSelector).textContent = "";
      return;
    }
    let points = valid;
    const monthlyInput = valid.every((row) => /^\d{4}-\d{2}$/.test(String(row.day || "")));
    let monthly = monthlyInput;
    if (valid.length > 90 && valid.every((row) => /^\d{4}-\d{2}-\d{2}/.test(String(row.day || "")))) {
      monthly = true;
      const buckets = new Map();
      valid.forEach((row) => {
        const key = String(row.day).slice(0, 7);
        const bucket = buckets.get(key) || { day: key, active_installs: null, new_installs: 0, activeTotal: 0, activeDays: 0 };
        const active = num(row.active_installs ?? row.active);
        const fresh = num(row.new_installs ?? row.fresh);
        if (active != null) { bucket.activeTotal += active; bucket.activeDays += 1; bucket.active_installs = Math.round(bucket.activeTotal / bucket.activeDays); }
        if (fresh != null) bucket.new_installs += fresh;
        buckets.set(key, bucket);
      });
      points = Array.from(buckets.values());
    }
    const left = 48, right = 704, top = 18, bottom = 194;
    const max = Math.max(1, ...points.flatMap((row) => [num(row.active_installs ?? row.active) || 0, num(row.new_installs ?? row.fresh) || 0]));
    const gridMax = Math.ceil(max / Math.pow(10, Math.max(0, Math.floor(Math.log10(max)) - 1))) * Math.pow(10, Math.max(0, Math.floor(Math.log10(max)) - 1));
    for (let i = 0; i <= 4; i += 1) {
      const value = gridMax * i / 4;
      const y = bottom - (value / gridMax) * (bottom - top);
      svg.append(svgElement("line", { x1: left, y1: y, x2: right, y2: y, class: "chart-grid" }));
      const axis = svgElement("text", { x: 0, y: y + 4, class: "chart-axis" });
      axis.textContent = formatNumber(Math.round(value));
      svg.append(axis);
    }
    const slot = (right - left) / points.length;
    const barWidth = Math.max(1.5, Math.min(13, slot * .34));
    const xAt = (index) => left + slot * (index + .5);
    const yAt = (value) => bottom - ((Number(value) || 0) / gridMax) * (bottom - top);
    points.forEach((row, index) => {
      const x = xAt(index);
      const active = num(row.active_installs ?? row.active) || 0;
      const fresh = num(row.new_installs ?? row.fresh) || 0;
      const rawDay = String(row.day || row.label || "");
      const date = monthly ? new Date(`${rawDay}-01T00:00:00`) : new Date(`${rawDay.slice(0, 10)}T00:00:00`);
      const day = Number.isNaN(date.getTime()) ? rawDay : date.toLocaleDateString("ru-RU", monthly ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
      const accessibleLabel = `${day}: активных ${formatNumber(active)}, новых ${formatNumber(fresh)}`;
      const group = svgElement("g", { class: "chart-day", role: "button", tabindex: "0", "aria-pressed": "false", "aria-label": accessibleLabel });
      const title = svgElement("title");
      title.textContent = `${day} · Активные: ${formatNumber(active)} · Новые: ${formatNumber(fresh)}`;
      group.append(title);
      const hit = svgElement("rect", { x: left + slot * index, y: top, width: slot, height: bottom - top + 5, class: "chart-day-hit" });
      group.append(hit);
      const activeHeight = Math.max(active > 0 ? 1.5 : 0, (active / gridMax) * (bottom - top));
      const newHeight = Math.max(fresh > 0 ? 1.5 : 0, (fresh / gridMax) * (bottom - top));
      group.append(svgElement("rect", { x: x - barWidth - 1, y: bottom - activeHeight, width: barWidth, height: activeHeight, rx: Math.min(2, barWidth / 2), class: "chart-bar-active" }));
      group.append(svgElement("rect", { x: x + 1, y: bottom - newHeight, width: barWidth, height: newHeight, rx: Math.min(2, barWidth / 2), class: "chart-bar-new" }));
      const select = () => {
        $$(".chart-day", svg).forEach((node) => { node.classList.remove("is-selected"); node.setAttribute("aria-pressed", "false"); });
        group.classList.add("is-selected");
        group.setAttribute("aria-pressed", "true");
        const detail = $(detailSelector);
        if (detail) {
          $("span", detail).textContent = monthly ? `${day} · месячная сводка` : day;
          $("strong", detail).textContent = `${monthly ? "Активные · среднее за день" : "Активные"} ${formatNumber(active)} · Новые ${formatNumber(fresh)}`;
        }
      };
      group.addEventListener("click", select);
      group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
      svg.append(group);
      if (points.length <= 14 || index % Math.ceil(points.length / 7) === 0) {
        const label = svgElement("text", { x, y: 221, class: "chart-axis", "text-anchor": "middle" });
        label.textContent = monthly ? day.replace(" г.", "") : (rawDay.length > 7 ? rawDay.slice(5) : rawDay);
        svg.append(label);
      }
    });
    if (coverageSelector) $(coverageSelector).textContent = monthly ? `По месяцам · ${points.length} мес.${monthlyInput ? "" : ` · ${valid.length} доступных дней`}` : `Дней: ${valid.length}`;
  }

  function setOverviewMetric(selector, value) {
    const element = $(selector);
    if (element) element.textContent = formatNumber(value);
  }

  function getPeriodDays() { return Number($("#period")?.value || 0); }

  async function loadStoreSnapshot() {
    try {
      const client = window.AdminSupabase?.getClient?.();
      if (!client || !window.AdminV2StoreDownloadsReadOnly?.load) return null;
      state.storeSnapshot = await window.AdminV2StoreDownloadsReadOnly.load(client);
      return state.storeSnapshot;
    } catch (error) {
      state.storeSnapshot = null;
      console.warn("store analytics", error);
      return null;
    }
  }

  function sumStoreRows(rows, withinDays) {
    if (!Array.isArray(rows)) return null;
    const cutoff = withinDays > 0 ? new Date(Date.now() - withinDays * 86400000).toISOString().slice(0, 10) : "";
    const filtered = cutoff ? rows.filter((row) => String(row.day || "") >= cutoff) : rows;
    return filtered.reduce((sum, row) => sum + (Number(row.downloads) || 0), 0);
  }

  function storeTotals(snapshot, days = 0) {
    if (!snapshot || snapshot.coverage?.complete === false) return { total: null, byStore: {} };
    const keys = [["apple", "App Store"], ["googleplay", "Google Play"], ["rustore", "RuStore"]];
    const byStore = {};
    let combined = 0;
    let complete = true;
    keys.forEach(([key, label]) => {
      const result = window.AdminStoreAnalyticsData?.resolveStoreMetrics(snapshot, days, sumStoreRows)?.[key];
      const total = days > 0 ? result?.delta : result?.total;
      byStore[key] = total;
      if (total == null) complete = false;
      else combined += total;
      const row = $(`#analytics-stores .store-row[data-store="${key}"]`);
      if (row) $("b", row).textContent = formatNumber(total);
      const overviewRow = $(`#overview-stores .store-row[data-store="${key}"]`);
      if (overviewRow) $("b", overviewRow).textContent = formatNumber(total);
    });
    return { total: complete ? combined : null, byStore };
  }

  async function loadOverview() {
    const days = getPeriodDays();
    try {
      if (DEMO_DATA) {
        const demo = DEMO_DATA.overview(days);
        state.analytics = demo;
        setOverviewMetric("#stat-installs", demo.installs);
        setOverviewMetric("#stat-active", demo.active);
        const stores = storeTotals(demo.stores, days);
        setOverviewMetric("#stat-store-downloads", stores.total);
        chartSeries = demo.series.map((row) => ({ day: row.day, active_installs: row.active_installs, new_installs: row.new_installs }));
        drawChart("#overview-chart", "#chart-detail", chartSeries, "#overview-coverage");
        $("#overview-stats-note").textContent = `${DEMO_DATA.label} · график условный; значения не получены из приложения или магазинов.`;
        return;
      }
      if (!IS_PRODUCTION) {
        setOverviewMetric("#stat-installs", null);
        setOverviewMetric("#stat-active", null);
        drawChart("#overview-chart", "#chart-detail", [], "#overview-coverage");
        $("#overview-stats-note").textContent = "Локальный просмотр: production-аналитика не запрашивается.";
        return;
      }
      const [dashboard, snapshot] = await Promise.all([
        window.AdminSupabase.loadAnalyticsDashboard(days), loadStoreSnapshot(),
      ]);
      state.analytics = dashboard;
      const period = dashboard?.period || {};
      setOverviewMetric("#stat-installs", dashboard?.all_time_installs);
      setOverviewMetric("#stat-active", period.active);
      const stores = storeTotals(snapshot, days);
      setOverviewMetric("#stat-store-downloads", stores.total);
      chartSeries = Array.isArray(dashboard?.series) ? dashboard.series.map((row) => ({
        day: row.day, active_installs: num(row.active_installs), new_installs: num(row.new_installs),
      })) : [];
      drawChart("#overview-chart", "#chart-detail", chartSeries, "#overview-coverage");
      const note = $("#overview-stats-note");
      if (note) note.textContent = dashboard?.series_coverage?.complete === false
        ? "График показывает только доступные даты. Полнота истории не подтверждена."
        : "График показывает последние доступные даты; итоговые показатели приведены отдельно.";
    } catch (error) {
      setOverviewMetric("#stat-installs", null);
      setOverviewMetric("#stat-active", null);
      setOverviewMetric("#stat-store-downloads", null);
      drawChart("#overview-chart", "#chart-detail", [], "#overview-coverage");
      const note = $("#overview-stats-note");
      if (note) note.textContent = `Не удалось загрузить аналитику: ${error.message || error}`;
    }
  }

  function showPage(name) {
    const page = labels[name] ? name : "overview";
    state.currentPage = page;
    document.body.classList.remove("tajweed-keyboard-open");
    document.body.classList.remove("tajweed-view-active");
    $$(".view").forEach((view) => view.classList.toggle("is-active", view.dataset.page === (page === "tajweed" ? "content" : page)));
    $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === page));
    $$(".content-view-tab").forEach((button) => {
      const active = button.dataset.view === page;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("#crumb").textContent = labels[page];
    $("#sidebar").classList.remove("is-open");
    $("#menu-trigger").setAttribute("aria-expanded", "false");
    document.title = `${labels[page]} · Коран и Азкары`;
    if (page === "content") {
      $("#catalog-view").hidden = false;
      $("#editor-view").hidden = true;
      $("#tajweed-view").hidden = true;
      renderCatalog();
    }
    if (page === "sections") renderSectionManager();
    if (page === "analytics") void loadAnalytics();
    if (page === "overview") void loadOverview();
    if (page === "reviews") void loadReviews();
    if (page === "versions") fillReleaseForm();
    if (page === "status") void loadServiceStatus();
    if (page === "tajweed") {
      const linked = state.records.find((record) => record.docId);
      if (!linked) { toast("В каталоге нет связанной таджвид-разметки."); showPage("content"); return; }
      state.currentRecord = linked;
      state.currentRecordType = linked.type;
      openTajweed();
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function requestTransition(action) {
    if (state.dirty) {
      const dialog = $("#leave-dialog");
      if (typeof dialog.showModal !== "function") {
        if (!window.confirm("Есть несохранённые правки. Перейти без сохранения?")) return;
        setDirty(false);
        action();
        return;
      }
      const handleClose = async () => {
        dialog.removeEventListener("close", handleClose);
        if (dialog.returnValue === "stay") return;
        if (dialog.returnValue === "discard") { setDirty(false); action(); return; }
        if (dialog.returnValue === "save") {
          const saved = await saveCurrentDraft({ silent: true });
          if (saved) action();
          else toast("Не удалось сохранить. Остаюсь на странице.");
        }
      };
      dialog.addEventListener("close", handleClose);
      dialog.returnValue = "stay";
      dialog.showModal();
      return;
    }
    action();
  }

  async function saveCurrentDraft({ silent = false } = {}) {
    if (state.currentPage === "content" && state.currentRecordType === "dua" && !$("#editor-view").hidden) return saveDuaDraft({ silent });
    if (state.currentPage === "versions") return saveRelease({ silent });
    if (state.currentPage === "translations") return saveTranslationDraft({ silent });
    return true;
  }

  function buildDuaManifest() {
    const current = state.catalog?.manifest || {};
    const next = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) + 1 : 1;
    const support = state.duaRecords.filter((record) => record.category === "support_dua");
    const general = state.duaRecords.filter((record) => record.category === "general_dua");
    return {
      version: next(current.version), publishedAt: new Date().toISOString(), packs: {
        support_dua: { version: next(current.packs?.support_dua?.version), url: "/data/support-dua.json", itemCount: support.length },
        general_dua: { version: next(current.packs?.general_dua?.version), url: "/data/general-dua.json", itemCount: general.length },
      },
    };
  }

  function buildHomeManifest() {
    const current = state.homeManifest || {};
    const next = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) + 1 : 1;
    const announcements = state.announcements.filter((item) => item.status !== "draft");
    return {
      version: next(current.version), publishedAt: new Date().toISOString(), packs: {
        announcements: { version: next(current.packs?.announcements?.version), url: "/data/home-announcements.json", itemCount: announcements.length },
        daily_ayah_pool: { version: next(current.packs?.daily_ayah_pool?.version), url: "/data/daily-ayah-pool.json", itemCount: state.dailyAyahPool.length },
        daily_dua_pool: { version: next(current.packs?.daily_dua_pool?.version), url: "/data/daily-dua-pool.json", itemCount: state.dailyDuaPool.length },
      },
    };
  }

  function serializeHomeAnnouncements() {
    return state.announcements.filter((item) => item.status !== "draft").map((item) => ({
      id: item.id, titleRu: item.titleRu, titleEn: item.titleEn || undefined, bodyRu: item.bodyRu || undefined,
      bodyEn: item.bodyEn || undefined, actionUrl: item.actionUrl || undefined, actionLabelRu: item.actionLabelRu || undefined,
      actionLabelEn: item.actionLabelEn || undefined, startsAt: item.startsAt || undefined, endsAt: item.endsAt || undefined,
      priority: item.priority ?? 0,
    }));
  }

  function exportHomeJson(kind) {
    if (!state.catalog) { toast("Данные ещё не загружены."); return; }
    const exports = {
      announcements: ["home-announcements.json", () => serializeHomeAnnouncements()],
      ayah: ["daily-ayah-pool.json", () => state.dailyAyahPool],
      dua: ["daily-dua-pool.json", () => state.dailyDuaPool],
      manifest: ["remote-home.manifest.json", () => buildHomeManifest()],
    };
    const entry = exports[kind];
    if (!entry) return;
    downloadJson(entry[0], entry[1]());
  }

  function downloadJson(filename, data) {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAdminJson(kind) {
    if (!state.catalog) { toast("Данные ещё не загружены."); return; }
    const exports = {
      support: ["support-dua.json", () => state.duaRecords.filter((record) => record.category === "support_dua").map((record) => record.original)],
      general: ["general-dua.json", () => state.duaRecords.filter((record) => record.category === "general_dua").map((record) => record.original)],
      manifest: ["remote-dua.manifest.json", () => buildDuaManifest()],
      release: ["app-release.json", () => state.release],
    };
    const entry = exports[kind];
    if (entry) downloadJson(entry[0], entry[1]());
  }

  function bannerInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function renderBanners() {
    const container = $("#banner-list");
    if (!container) return;
    container.replaceChildren();
    if (!state.announcements.length) {
      const empty = document.createElement("p"); empty.className = "empty-message"; empty.textContent = "Баннеров пока нет."; container.append(empty); return;
    }
    state.announcements.forEach((item) => {
      const card = document.createElement("article"); card.className = "section-card";
      const copy = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = item.titleRu || item.id;
      const description = document.createElement("p"); description.textContent = item.bodyRu || "";
      const meta = document.createElement("small"); meta.textContent = [item.status || "published", item.startsAt && new Date(item.startsAt).toLocaleDateString("ru-RU"), item.endsAt && new Date(item.endsAt).toLocaleDateString("ru-RU")].filter(Boolean).join(" · ");
      copy.append(title, description, meta);
      const actions = document.createElement("div"); actions.className = "card-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "button subdued"; edit.textContent = "Изменить"; edit.addEventListener("click", () => openBanner(item));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button subdued"; remove.textContent = "Удалить"; remove.addEventListener("click", () => void deleteBanner(item));
      edit.disabled = !IS_PRODUCTION; remove.disabled = !IS_PRODUCTION;
      if (!IS_PRODUCTION) { edit.title = "Тестовый баннер доступен только для просмотра"; remove.title = edit.title; }
      actions.append(edit, remove); card.append(copy, actions); container.append(card);
    });
  }

  function openBanner(item = null) {
    if (!IS_PRODUCTION) { toast("Баннеры доступны только в рабочей админке."); return; }
    state.bannerEditingId = item?.id || "";
    const form = $("#banner-form");
    form.reset();
    $("#banner-dialog-title").textContent = item ? "Изменить баннер" : "Новый баннер";
    const values = {
      titleRu: item?.titleRu, bodyRu: item?.bodyRu, titleEn: item?.titleEn, bodyEn: item?.bodyEn,
      actionUrl: item?.actionUrl, actionLabelRu: item?.actionLabelRu, startsAt: bannerInputValue(item?.startsAt), endsAt: bannerInputValue(item?.endsAt),
    };
    Object.entries(values).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field) field.value = value || ""; });
    $("#banner-dialog").showModal();
  }

  function createBannerId(title) {
    const seed = slug(String(title || "").toLowerCase().replace(/[а-яё]/g, (char) => CYRILLIC_TO_LATIN[char] || "")) || "announcement";
    const base = `home-${seed}`.slice(0, 55);
    const used = new Set(state.announcements.map((item) => item.id));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  async function saveBanner() {
    if (!IS_PRODUCTION) { toast("Демо-баннеры доступны только для просмотра."); return false; }
    const form = $("#banner-form");
    const data = new FormData(form);
    const titleRu = String(data.get("titleRu") || "").trim();
    if (!titleRu) { toast("Заполните заголовок баннера."); return false; }
    const old = state.announcements.find((item) => item.id === state.bannerEditingId);
    const parseDate = (name) => { const value = String(data.get(name) || "").trim(); return value ? new Date(value).toISOString() : undefined; };
    const next = {
      ...(old || {}), id: old?.id || createBannerId(titleRu), titleRu,
      titleEn: String(data.get("titleEn") || "").trim() || undefined,
      bodyRu: String(data.get("bodyRu") || "").trim() || undefined,
      bodyEn: String(data.get("bodyEn") || "").trim() || undefined,
      actionUrl: String(data.get("actionUrl") || "").trim() || undefined,
      actionLabelRu: String(data.get("actionLabelRu") || "").trim() || undefined,
      startsAt: parseDate("startsAt"), endsAt: parseDate("endsAt"),
      priority: Number(old?.priority) || 0, status: "published",
    };
    try {
      await window.AdminSupabase.upsertHomeAnnouncement(next);
      state.announcements = [...state.announcements.filter((item) => item.id !== next.id), next].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
      $("#banner-dialog").close("saved");
      renderBanners();
      $("#home-status").textContent = "Баннер сохранён в Supabase";
      toast("Баннер сохранён. Для сайта его ещё нужно опубликовать.");
      return true;
    } catch (error) { toast(error.message || "Не удалось сохранить баннер"); return false; }
  }

  async function deleteBanner(item) {
    if (!IS_PRODUCTION) { toast("Демо-баннеры доступны только для просмотра."); return; }
    if (!window.confirm(`Удалить баннер «${item.titleRu || item.id}»?`)) return;
    try {
      await window.AdminSupabase.deleteHomeAnnouncement(item.id);
      state.announcements = state.announcements.filter((entry) => entry.id !== item.id);
      renderBanners();
      toast("Баннер удалён из Supabase. Опубликуйте главную, чтобы обновить сайт.");
    } catch (error) { toast(error.message || "Не удалось удалить баннер"); }
  }

  async function publishHome() {
    if (!IS_PRODUCTION) { toast("Публикация отключена в локальном демо."); return; }
    const button = $("#publish-home");
    try {
      const ayahs = JSON.parse($("#daily-ayah-pool").value || "[]");
      const duas = JSON.parse($("#daily-dua-pool").value || "[]");
      if (!Array.isArray(ayahs) || !Array.isArray(duas)) throw new Error("Пулы должны быть JSON-массивами.");
      if (!window.confirm(`Опубликовать главную? Баннеров: ${state.announcements.filter((item) => item.status !== "draft").length}.`)) return;
      button.disabled = true;
      await window.AdminSupabase.saveHomeDailyPools(ayahs, duas);
      state.dailyAyahPool = ayahs; state.dailyDuaPool = duas;
      const homeManifest = buildHomeManifest();
      const homeAnnouncements = serializeHomeAnnouncements();
      const result = await window.AdminSupabase.publishContent({ homeManifest, homeAnnouncements, dailyAyahPool: ayahs, dailyDuaPool: duas });
      state.homeManifest = homeManifest;
      $("#home-status").textContent = "Главная опубликована";
      toast(`Главная отправлена на сайт${result?.publishedAt ? ` · ${result.publishedAt}` : ""}`);
    } catch (error) { toast(error.message || "Публикация главной не удалась"); }
    finally { button.disabled = false; }
  }

  function fillReleaseForm() {
    const release = state.release || {};
    const rustore = release.android?.rustore || {};
    const apk = release.android?.apk || {};
    const values = {
      rustoreLatestVersion: rustore.latestVersion ?? release.android?.latestVersion,
      rustoreVersionCode: rustore.versionCode ?? release.android?.versionCode,
      rustoreUrl: rustore.url ?? release.android?.rustoreUrl,
      apkLatestVersion: apk.latestVersion ?? release.android?.latestVersion,
      apkVersionCode: apk.versionCode ?? release.android?.versionCode,
      apkUrl: apk.url ?? release.android?.apkUrl,
      iosLatestVersion: release.ios?.latestVersion,
      iosBuildNumber: release.ios?.buildNumber,
      appStoreUrl: release.ios?.appStoreUrl,
      messageRu: release.messageRu,
      messageEn: release.messageEn,
    };
    Object.entries(values).forEach(([name, value]) => {
      const field = $("#release-form")?.elements.namedItem(name);
      if (field && document.activeElement !== field) field.value = value == null ? "" : String(value);
    });
    $("#release-status").textContent = IS_PRODUCTION ? "Данные загружены" : "Только просмотр";
    $("#release-check-result").textContent = "Результат сверки появится здесь";
  }

  function readReleaseForm() {
    const data = new FormData($("#release-form"));
    const text = (name) => String(data.get(name) || "").trim();
    const number = (name) => Number(data.get(name)) || undefined;
    const current = state.release || {};
    return {
      ...current,
      android: {
        ...current.android,
        rustore: { ...current.android?.rustore, latestVersion: text("rustoreLatestVersion"), versionCode: number("rustoreVersionCode"), url: text("rustoreUrl") },
        apk: { ...current.android?.apk, latestVersion: text("apkLatestVersion"), versionCode: number("apkVersionCode"), url: text("apkUrl") },
      },
      ios: { ...current.ios, latestVersion: text("iosLatestVersion"), buildNumber: number("iosBuildNumber"), appStoreUrl: text("appStoreUrl") },
      messageRu: text("messageRu"), messageEn: text("messageEn"),
    };
  }

  async function saveRelease({ silent = false } = {}) {
    if (!IS_PRODUCTION) { if (!silent) toast("Сохранение отключено в локальном просмотре."); return false; }
    try {
      const release = readReleaseForm();
      await window.AdminSupabase.saveRelease(release);
      state.release = release;
      setDirty(false);
      $("#release-status").textContent = "Черновик сохранён в Supabase";
      if (!silent) toast("Версии сохранены. Для сайта требуется публикация.");
      return true;
    } catch (error) { if (!silent) toast(error.message || "Не удалось сохранить версии"); return false; }
  }

  async function publishRelease() {
    if (!IS_PRODUCTION) { toast("Публикация отключена в локальном демо."); return; }
    try {
      if (state.dirty && !await saveRelease({ silent: true })) return;
      if (!window.confirm("Опубликовать версии и ссылки в app-release.json на сайте?")) return;
      const release = readReleaseForm();
      await window.AdminSupabase.saveRelease(release);
      state.release = release;
      const result = await window.AdminSupabase.publishContent({ appRelease: release });
      $("#release-status").textContent = "Версии опубликованы";
      toast(`Версии отправлены на сайт${result?.publishedAt ? ` · ${result.publishedAt}` : ""}`);
    } catch (error) { toast(error.message || "Не удалось опубликовать версии"); }
  }

  async function syncRelease() {
    if (!IS_PRODUCTION) { toast("Сверка с магазинами отключена в локальном демо."); return; }
    if (state.dirty) { toast("Сначала сохраните изменения версий, затем сверяйте данные магазинов."); return; }
    const button = $("#release-sync");
    button.disabled = true;
    try {
      const result = await window.AdminSupabase.syncAppRelease();
      if (result?.release) state.release = result.release;
      fillReleaseForm();
      const changed = Boolean(result?.changed?.ios || result?.changed?.rustore);
      $("#release-status").textContent = changed ? "Стор обновлён" : "Версии сверены";
      $("#release-check-result").textContent = changed ? "Обнаружены и загружены новые версии" : "Изменений нет · данные сверены";
      toast(changed ? "Данные версий обновлены" : "Стор и данные сайта сверены");
    } catch (error) { $("#release-status").textContent = error.message || "Ошибка сверки"; $("#release-check-result").textContent = error.message || "Сверку не удалось выполнить"; toast(error.message || "Не удалось сверить версии"); }
    finally { button.disabled = false; }
  }

  function dedupeReviews(rows) {
    const byClient = new Map(); const noClient = [];
    rows.forEach((row) => {
      const client = String(row.client_id || "").trim();
      if (!client) { noClient.push(row); return; }
      const key = `${row.course_id || ""}::${client}`;
      const prior = byClient.get(key);
      if (!prior || Date.parse(row.updated_at || row.created_at || 0) >= Date.parse(prior.updated_at || prior.created_at || 0)) byClient.set(key, row);
    });
    const uniqueText = new Map();
    noClient.forEach((row) => {
      const key = [row.course_id, row.rating, row.comment?.trim().toLowerCase(), row.display_name?.trim().toLowerCase()].join("::");
      const prior = uniqueText.get(key);
      if (!prior || Date.parse(row.created_at || 0) >= Date.parse(prior.created_at || 0)) uniqueText.set(key, row);
    });
    return [...byClient.values(), ...uniqueText.values()].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  }

  async function loadReviews() {
    const list = $("#review-list");
    list.replaceChildren();
    const summary = $("#review-summary"); summary.textContent = "Загружаю отзывы…";
    try {
      const course = $("#review-course").value;
      if (DEMO_DATA) {
        const rows = DEMO_DATA.reviews.filter((row) => !course || row.course_id === course);
        state.reviewRows = dedupeReviews(rows);
        const avg = state.reviewRows.length ? (state.reviewRows.reduce((sum, row) => sum + (Number(row.rating) || 0), 0) / state.reviewRows.length).toFixed(1) : "—";
        summary.textContent = `ДЕМО · ${state.reviewRows.length} искусственных отзыва · средняя оценка ${avg} ★`;
        if (!state.reviewRows.length) { const empty = document.createElement("p"); empty.className = "empty-message"; empty.textContent = "Демо-отзывов по этому фильтру нет."; list.append(empty); return; }
        state.reviewRows.forEach((row) => {
          const card = document.createElement("article"); card.className = "section-card review-card";
          const title = document.createElement("h3");
          const rating = Math.max(1, Math.min(5, Number(row.rating) || 0));
          title.textContent = `${row.display_name} · ${"★".repeat(rating)}${"☆".repeat(5 - rating)} · ${row.course_id === "tajweed" ? "Таджвид" : "99 имён"} · урок ${row.lesson_id}`;
          const meta = document.createElement("small"); meta.textContent = `${new Date(row.created_at).toLocaleString("ru-RU")} · ${row.locale} · ${row.platform} · ${row.app_version}`;
          const comment = document.createElement("p"); comment.textContent = row.comment;
          card.append(title, meta, comment); list.append(card);
        });
        return;
      }
      const result = await window.AdminSupabase.loadAcademyCourseFeedback(course);
      const raw = Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
      state.reviewRows = dedupeReviews(raw);
      const avg = state.reviewRows.length ? (state.reviewRows.reduce((sum, row) => sum + (Number(row.rating) || 0), 0) / state.reviewRows.length).toFixed(1) : "—";
      summary.textContent = `${state.reviewRows.length} отзывов · средняя оценка ${avg} ★ · загружено ${raw.length}${result?.total == null ? " · общий итог не подтверждён" : ` из ${result.total}`}`;
      if (!state.reviewRows.length) { const empty = document.createElement("p"); empty.className = "empty-message"; empty.textContent = "Отзывов по этому фильтру нет."; list.append(empty); return; }
      state.reviewRows.forEach((row) => {
        const card = document.createElement("article"); card.className = "section-card review-card";
        const title = document.createElement("h3");
        title.textContent = `${row.display_name ? `${row.display_name} · ` : ""}${"★".repeat(Math.max(1, Math.min(5, Number(row.rating) || 0)))}${"☆".repeat(5 - Math.max(1, Math.min(5, Number(row.rating) || 0)))} · ${row.course_id === "tajweed" ? "Таджвид" : row.course_id === "names99" ? "99 имён" : row.course_id || "Курс"}${row.lesson_id ? ` · урок ${row.lesson_id}` : ""}`;
        const meta = document.createElement("small"); meta.textContent = `${row.created_at ? new Date(row.created_at).toLocaleString("ru-RU") : "—"} · ${row.locale || "—"} · ${row.platform || "—"} · v${row.app_version || "—"}`;
        card.append(title, meta);
        if (row.comment) { const comment = document.createElement("p"); comment.textContent = row.comment; card.append(comment); }
        list.append(card);
      });
    } catch (error) { summary.textContent = error.message || "Не удалось загрузить отзывы"; }
  }

  async function loadAnalytics() {
    if (!IS_PRODUCTION) {
      if (DEMO_DATA && window.AdminAnalytics?.renderDemo) {
        const days = Number($("#analytics-range")?.value || 0);
        const payload = DEMO_DATA.analytics(days);
        window.AdminAnalytics.renderDemo({ ...payload, rangeDays: days });
        chartSeries = payload.dashboard.series.map((row) => ({ day: row.day, active_installs: row.active_installs, new_installs: row.new_installs }));
        drawChart("#analytics-chart", "#analytics-detail", chartSeries, "#analytics-coverage");
        $("#analytics-period-label").textContent = days === 0 ? "За всё время" : `Последние ${days} дней`;
        return;
      }
      $("#analytics-stats").textContent = "В локальном просмотре аналитика скрыта.";
      $("#analytics-metrics").replaceChildren();
      $("#analytics-social").replaceChildren();
      $("#analytics-breakdown").replaceChildren();
      $("#analytics-stores").innerHTML = '<p class="admin-store-status">Показатели магазинов доступны в рабочей админке.</p>';
      drawChart("#analytics-chart", "#analytics-detail", [], "#analytics-coverage");
      return;
    }
    if (!window.AdminAnalytics) return;
    await window.AdminAnalytics.loadAndRender();
    await loadAnalyticsChart();
  }

  async function loadAnalyticsChart() {
    if (!IS_PRODUCTION) {
      if (DEMO_DATA) { await loadAnalytics(); return; }
      drawChart("#analytics-chart", "#analytics-detail", [], "#analytics-coverage");
      return;
    }
    const days = Number($("#analytics-range")?.value || 0);
    try {
      const dashboard = await window.AdminSupabase.loadAnalyticsDashboard(days);
      const series = Array.isArray(dashboard?.series) ? dashboard.series.map((row) => ({ day: row.day, active_installs: num(row.active_installs), new_installs: num(row.new_installs) })) : [];
      drawChart("#analytics-chart", "#analytics-detail", series, "#analytics-coverage");
    } catch (error) {
      drawChart("#analytics-chart", "#analytics-detail", [], "#analytics-coverage");
      $("#analytics-stats").textContent = error.message || "Сводка недоступна";
    }
  }

  function renderRaffleEntries(rows) {
    const list = $("#raffle-list"); list.replaceChildren();
    $("#raffle-entry-count").textContent = `Показано: ${rows.length}`;
    if (!rows.length) { const empty = document.createElement("p"); empty.className = "empty-message"; empty.textContent = "Заявок нет."; list.append(empty); return; }
    const phoneCounts = new Map(); rows.forEach((row) => phoneCounts.set(row.phone, (phoneCounts.get(row.phone) || 0) + 1));
    rows.forEach((row) => {
      const card = document.createElement("article"); card.className = "section-card";
      const body = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = `${row.code} · ${row.display_name || "Без имени"}`;
      const details = document.createElement("p"); details.textContent = `${row.phone || "—"} · ${row.score_percent ?? "—"}% · ${row.status || "новая заявка"}${phoneCounts.get(row.phone) > 1 ? " · повторный номер" : ""}`;
      const date = document.createElement("small"); date.textContent = row.created_at ? new Date(row.created_at).toLocaleString("ru-RU") : "—";
      body.append(title, details, date);
      const actions = document.createElement("div"); actions.className = "card-actions";
      [["winner", "Победитель"], ["not_selected", "Не выбран"]].forEach(([status, label]) => {
        const button = document.createElement("button"); button.type = "button"; button.className = "button subdued"; button.textContent = label;
        button.disabled = !IS_PRODUCTION;
        if (!IS_PRODUCTION) button.title = "Изменение статуса доступно только в рабочей админке";
        button.addEventListener("click", () => void setRaffleStatus(row.id, status)); actions.append(button);
      });
      card.append(body, actions); list.append(card);
    });
  }

  async function loadRaffle() {
    if (DEMO_DATA) {
      const data = DEMO_DATA.raffle;
      const settings = data.settings;
      $("#raffle-active").checked = settings.active;
      $("#raffle-prize").value = settings.prize_text;
      $("#raffle-winners").value = String(settings.winners_target);
      const query = $("#raffle-search").value.trim().toLowerCase();
      const entries = data.entries.filter((row) => !query || `${row.code} ${row.display_name} ${row.phone}`.toLowerCase().includes(query));
      renderRaffleEntries(entries);
      $("#raffle-entry-count").textContent = `ДЕМО · ${entries.length} тестовые заявки`;
      return;
    }
    const supabase = window.AdminSupabase?.getClient?.();
    if (!supabase) { toast("Supabase не подключён."); return; }
    const queryText = $("#raffle-search").value.trim();
    try {
      const [settings, entries] = await Promise.all([
        supabase.from("academy_giveaway_settings").select("active,prize_text,winners_target").eq("campaign_id", "tajweed_final_v1").maybeSingle(),
        (() => {
          let query = supabase.from("academy_final_exam_entries").select("id,code,display_name,phone,score_percent,status,created_at,client_id").eq("campaign_id", "tajweed_final_v1").order("created_at", { ascending: false }).limit(200);
          if (queryText) query = query.or(`code.ilike.%${queryText}%,phone.ilike.%${queryText}%,display_name.ilike.%${queryText}%`);
          return query;
        })(),
      ]);
      if (settings.error) throw settings.error;
      if (entries.error) throw entries.error;
      $("#raffle-active").checked = settings.data?.active === true;
      $("#raffle-prize").value = settings.data?.prize_text || "";
      $("#raffle-winners").value = String(settings.data?.winners_target || 3);
      renderRaffleEntries(entries.data || []);
    } catch (error) { toast(error.message || "Не удалось загрузить розыгрыш"); }
  }

  async function saveRaffle() {
    if (!IS_PRODUCTION) { toast("Настройки розыгрыша доступны только для просмотра в демо."); return; }
    try {
      const { error } = await window.AdminSupabase.getClient().from("academy_giveaway_settings").upsert({
        campaign_id: "tajweed_final_v1", active: $("#raffle-active").checked,
        prize_text: $("#raffle-prize").value.trim() || null,
        winners_target: Math.min(3, Math.max(1, Number($("#raffle-winners").value || 3))), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast("Настройки розыгрыша сохранены");
    } catch (error) { toast(error.message || "Не удалось сохранить настройки"); }
  }

  async function setRaffleStatus(id, status) {
    if (!IS_PRODUCTION) { toast("Изменение заявок отключено в локальном демо."); return; }
    if (!window.confirm(status === "winner" ? "Отметить заявку победителем?" : "Отметить заявку как не выбранную?")) return;
    try {
      const { error } = await window.AdminSupabase.getClient().from("academy_final_exam_entries").update({ status }).eq("id", id);
      if (error) throw error;
      await loadRaffle();
    } catch (error) { toast(error.message || "Не удалось обновить заявку"); }
  }

  async function loadServiceStatus() {
    const host = $("#service-list"); host.replaceChildren();
    if (DEMO_DATA) {
      DEMO_DATA.serviceStatus.forEach(([title, detail]) => {
        const row = document.createElement("article"); row.className = "section-card service-card";
        const name = document.createElement("div");
        const strong = document.createElement("strong"); strong.textContent = title;
        const note = document.createElement("small"); note.textContent = detail;
        name.append(strong, note);
        const status = document.createElement("span"); status.className = "service-state pending"; status.textContent = "Демо";
        row.append(name, status); host.append(row);
      });
      return;
    }
    const checks = [
      ["Вход администратора", async () => Boolean(await window.AdminSupabase.getSession())],
      ["Каталог Supabase", async () => { await window.AdminSupabase.loadCatalog(); return true; }],
      ["Пакет таджвид-разметки", async () => { const pack = await getJson("/data/azkar-tajweed-translit.json"); return Array.isArray(pack.docs); }],
      ["Манифест дуа", async () => { const value = await getJson("/data/remote-dua.manifest.json"); return Boolean(value && typeof value === "object"); }],
      ["Манифест главной", async () => { const value = await getJson("/data/remote-home.manifest.json"); return Boolean(value && typeof value === "object"); }],
    ];
    for (const [title, check] of checks) {
      const row = document.createElement("article"); row.className = "section-card service-card";
      const name = document.createElement("strong"); name.textContent = title;
      const status = document.createElement("span"); status.className = "service-state pending"; status.textContent = "Проверяем";
      row.append(name, status); host.append(row);
      try { const ok = await check(); status.textContent = ok ? "Доступно" : "Не подтверждено"; status.className = `service-state ${ok ? "ok" : "error"}`; }
      catch (error) { status.textContent = error.message || "Недоступно"; status.className = "service-state error"; }
    }
  }

  async function saveTranslationDraft({ silent = false } = {}) {
    const frame = $("#translations-frame");
    if (!frame?.contentWindow) return false;
    const requestId = `terra-translation-${Date.now()}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => { pendingTranslationSaves.delete(requestId); if (!silent) toast("Редактор переводов не подтвердил сохранение."); resolve(false); }, 22000);
      pendingTranslationSaves.set(requestId, { resolve, timer });
      frame.contentWindow.postMessage({ type: "admin-v2:save-draft", requestId }, window.location.origin);
    });
  }

  function updateProductionMode() {
    $("#environment-tag").innerHTML = `<i></i>${IS_PRODUCTION ? "Рабочая версия" : DEMO_DATA ? "ДЕМО · локальные данные" : "Локальный просмотр"}`;
    $("#environment-tag").classList.toggle("is-production", IS_PRODUCTION);
    $("#account-status").textContent = IS_PRODUCTION ? "Подключено" : "Только тест";
    if (!IS_PRODUCTION) {
      window.AdminV2Safety = Object.freeze({ readOnly: true, message: "Локальный просмотр не подключается к рабочей аналитике." });
      const disableWithReason = (selector, reason) => {
        const button = $(selector);
        if (!button) return;
        button.disabled = true;
        button.title = reason;
      };
      disableWithReason("#publish-dua", "В локальном просмотре публикация отключена");
      disableWithReason("#publish-home", "Публикация отключена в локальном демо");
      disableWithReason("#save-release", "Сохранение в Supabase отключено в локальном демо");
      disableWithReason("#publish-release", "Публикация отключена в локальном демо");
      disableWithReason("#release-sync", "Сверка с магазинами отключена в локальном демо");
      disableWithReason("#new-banner", "Редактирование баннеров отключено в локальном демо");
      disableWithReason("#raffle-save", "Настройки розыгрыша доступны только для просмотра в демо");
      $("#analytics-range").disabled = !DEMO_DATA;
      $("#analytics-refresh").disabled = !DEMO_DATA;
      disableWithReason("#save-pools", "Сохранение пулов отключено в локальном демо");
      ["#daily-ayah-pool", "#daily-dua-pool"].forEach((selector) => {
        const field = $(selector);
        if (field) {
          field.readOnly = true;
          field.title = "Редактирование пулов отключено в локальном демо";
        }
      });
      $("#raffle-active").disabled = true;
      $("#raffle-winners").disabled = true;
      $("#raffle-prize").disabled = true;
      ["#raffle-active", "#raffle-winners", "#raffle-prize"].forEach((selector) => {
        const field = $(selector);
        if (field) field.title = "Настройки розыгрыша доступны только для просмотра в демо";
      });
      const addReadOnlyNote = (page, message) => {
        const view = document.querySelector(`[data-page="${page}"]`);
        const heading = view?.querySelector(".page-title-row");
        if (!heading || heading.nextElementSibling?.matches(".release-note[data-demo-readonly]")) return;
        const note = document.createElement("div");
        note.className = "release-note";
        note.dataset.demoReadonly = "true";
        const title = document.createElement("strong");
        title.textContent = "Локальный демо-режим";
        const text = document.createElement("span");
        text.textContent = message;
        note.append(title, text);
        heading.after(note);
      };
      addReadOnlyNote("home", "Баннеры и пулы доступны только для просмотра; сохранение и публикация выключены.");
      addReadOnlyNote("versions", "Изменения релиза нельзя сохранить или опубликовать из локального демо.");
      addReadOnlyNote("raffle", "Настройки и заявки розыгрыша доступны только для просмотра.");
    } else {
      window.AdminV2Safety = Object.freeze({ readOnly: false, message: "Рабочая админка." });
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const sectionChoice = event.target.closest("[data-section-select]");
      if (sectionChoice) {
        state.currentSectionSelection = sectionChoice.dataset.sectionSelect;
        renderSectionManager();
        return;
      }
      const section = event.target.closest("[data-section-filter]");
      if (section) {
        state.currentSectionFilter = section.dataset.sectionFilter;
        state.currentFilter = "all";
        $$(".tab[data-filter]").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === "all"));
        const groupSelect = $("#group-filter");
        if (groupSelect) groupSelect.value = state.currentSectionFilter;
        void requestTransition(() => showPage("content"));
        return;
      }
      const filter = event.target.closest("[data-content-filter]");
      if (filter) { event.preventDefault(); setCatalogFilter(filter.dataset.contentFilter); void requestTransition(() => showPage("content")); return; }
      const nav = event.target.closest("[data-view]");
      if (nav) { event.preventDefault(); const name = nav.dataset.view; void requestTransition(() => showPage(name)); return; }
      const row = event.target.closest("[data-record-id]");
      if (row) {
        const selected = state.records.find((record) => record.id === row.dataset.recordId && record.type === row.dataset.recordType && (record.category || "") === row.dataset.recordCategory);
        if (!selected) return;
        void requestTransition(() => {
          if (selected.type === "azkar") { state.currentRecord = selected; state.currentRecordType = "azkar"; openTajweed(); }
          else renderEditor(selected);
        });
      }
    });
    $$(".tab[data-filter]").forEach((button) => button.addEventListener("click", () => setCatalogFilter(button.dataset.filter)));
    $$(".editor-tab").forEach((button) => button.addEventListener("click", () => setEditorTab(button.dataset.editorTab)));
    $("#search").addEventListener("input", renderCatalog);
    $("#type-filter").addEventListener("change", (event) => setCatalogFilter(event.target.value));
    $("#group-filter").addEventListener("change", (event) => { state.currentSectionFilter = event.target.value; renderCatalog(); });
    $("#menu-trigger").addEventListener("click", () => {
      const open = $("#sidebar").classList.toggle("is-open");
      $("#menu-trigger").setAttribute("aria-expanded", String(open));
    });
    $("#back-catalog").addEventListener("click", () => void requestTransition(() => showPage("content")));
    $("#back-editor").addEventListener("click", async () => {
      if (!await requestEmbeddedTajweedSave()) { toast("Не удалось подтвердить сохранение таджвида. Остаюсь в редакторе."); return; }
      syncDuaFromTajweed();
      document.body.classList.remove("tajweed-view-active");
      $("#tajweed-view").hidden = true;
      if (state.currentRecordType === "dua") $("#editor-view").hidden = false;
      else showPage("content");
      $("#crumb").textContent = "Дуа и азкары";
      window.scrollTo({ top: 0, behavior: "auto" });
    });
    $("#open-tajweed").addEventListener("click", openTajweed);
    $("#save-draft").addEventListener("click", () => void saveDuaDraft());
    $("#publish-dua").addEventListener("click", () => void publishDua());
    $("#load-production").addEventListener("click", () => void requestTransition(() => { void loadCatalog(); }));
    $("#old-version").addEventListener("click", () => void requestTransition(() => { window.location.href = "../admin/"; }));
    $("#logout").addEventListener("click", async () => {
      if (!IS_PRODUCTION) { toast("В локальном просмотре вход не используется."); return; }
      try { await window.AdminSupabase.signOut(); } finally { window.location.href = "../admin/"; }
    });
    $("#show-extra").addEventListener("click", () => { addExtraTranslation("", "").focus(); markEditorDirty(); });
    $("#extra-from-tab").addEventListener("click", () => { setEditorTab("text"); addExtraTranslation("", "").focus(); markEditorDirty(); });
    $("#new-material").addEventListener("click", () => {
      const record = { id: "", title: "", navTitle: "", type: "dua", category: "support_dua", group: "Поддержка", arabic: "", translation: "", count: 3, source: "", sourceUrl: "", docId: "", original: { category: "support_dua", status: "draft", authenticity: "unknown", importance: "core", tags: [], audio: [] } };
      renderEditor(record);
    });
    $("#material-form").addEventListener("input", () => { markEditorDirty(); });
    $("#material-form").addEventListener("change", () => { markEditorDirty(); });
    $("#material-form").addEventListener("submit", (event) => event.preventDefault());
    $("#period").addEventListener("change", () => void loadOverview());
    $("#analytics-range").addEventListener("change", () => void (DEMO_DATA ? loadAnalytics() : loadAnalyticsChart()));
    $("#analytics-range").addEventListener("change", (event) => {
      const days = Number(event.target.value || 0);
      $("#analytics-period-label").textContent = days === 0 ? "За всё время" : `Последние ${days} дней`;
    });
    $$(".analytics-tab[data-scroll-target]").forEach((button) => button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      $$(".analytics-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    }));
    $("#new-banner").addEventListener("click", () => openBanner());
    $("#banner-form").addEventListener("submit", (event) => { event.preventDefault(); void saveBanner(); });
    $("#publish-home").addEventListener("click", () => void publishHome());
    $$("[data-home-export]").forEach((button) => button.addEventListener("click", () => exportHomeJson(button.dataset.homeExport)));
    $$("[data-admin-export]").forEach((button) => button.addEventListener("click", () => exportAdminJson(button.dataset.adminExport)));
    $("#save-pools").addEventListener("click", async () => {
      if (!IS_PRODUCTION) { toast("Тестовые пулы доступны только для просмотра."); return; }
      try {
        const ayahs = JSON.parse($("#daily-ayah-pool").value || "[]"); const duas = JSON.parse($("#daily-dua-pool").value || "[]");
        if (!Array.isArray(ayahs) || !Array.isArray(duas)) throw new Error("Пулы должны быть JSON-массивами.");
        await window.AdminSupabase.saveHomeDailyPools(ayahs, duas); state.dailyAyahPool = ayahs; state.dailyDuaPool = duas;
        $("#home-status").textContent = "Пулы сохранены в Supabase"; toast("Пулы сохранены. Опубликуйте главную, чтобы обновить сайт.");
      } catch (error) { toast(error.message || "Не удалось сохранить пулы"); }
    });
    $("#review-refresh").addEventListener("click", () => void loadReviews());
    $("#review-course").addEventListener("change", () => void loadReviews());
    $("#release-form").addEventListener("input", () => { setDirty(true, "Есть несохранённые изменения"); $("#release-status").textContent = "Есть несохранённые изменения"; });
    $("#save-release").addEventListener("click", () => void saveRelease());
    $("#publish-release").addEventListener("click", () => void publishRelease());
    $("#release-sync").addEventListener("click", () => void syncRelease());
    $("#raffle-refresh").addEventListener("click", () => void loadRaffle());
    $("#raffle-save").addEventListener("click", () => void saveRaffle());
    $("#raffle-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void loadRaffle(); } });
    $("#status-refresh").addEventListener("click", () => void loadServiceStatus());
    $("#translation-save").addEventListener("click", () => void saveTranslationDraft());
    $("#analytics-refresh").addEventListener("click", () => void (DEMO_DATA ? loadAnalytics() : loadAnalyticsChart()));
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
    const tajweedFrame = $("#tajweed-frame");
    if (event.source === tajweedFrame.contentWindow) {
      if (event.data.type === "admin-v2:request-tajweed-document") {
        const id = String(event.data.documentId || "");
        const source = sourceDocumentFor(id);
        tajweedFrame.contentWindow.postMessage(source
          ? { type: "admin-v2:load-tajweed-document", document: source }
          : { type: "admin-v2:tajweed-document-missing", documentId: id }, window.location.origin);
      }
      if (event.data.type === "admin-v2:tajweed-save-result") {
        const pending = pendingTajweedSaves.get(String(event.data.requestId || ""));
        if (pending) { clearTimeout(pending.timer); pendingTajweedSaves.delete(String(event.data.requestId || "")); pending.resolve(event.data.saved === true); }
      }
      if (event.data.type === "admin-v2:keyboard-mode") document.body.classList.toggle("tajweed-keyboard-open", event.data.open === true && event.data.mobile === true);
    }
    const translationFrame = $("#translations-frame");
    if (event.source === translationFrame.contentWindow) {
      if (event.data.type === "admin-v2:dirty") setDirty(true, "Есть несохранённые изменения");
      if (event.data.type === "admin-v2:saved") {
        const requestId = String(event.data.requestId || "");
        const pending = pendingTranslationSaves.get(requestId);
        if (pending) { clearTimeout(pending.timer); pendingTranslationSaves.delete(requestId); pending.resolve(true); }
        setDirty(false);
        toast(DEMO_DATA ? "Демо-переводы сохранены только в этом браузере." : "Сохранение редактора выполнено. Облачный статус смотри в самом редакторе.");
      }
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  async function boot() {
    updateProductionMode();
    bindEvents();
    if (!IS_PRODUCTION) {
      $("#dua-export-note").textContent = "Локальный просмотр: скачиваются данные этого просмотра, включая сохранённые здесь черновики.";
      $("#release-export-note").textContent = "Локальный просмотр: скачиваются тестовые настройки версий.";
    }
    if (window.ArabicInputTools) window.ArabicInputTools.mount(document);
    if (IS_PRODUCTION && window.AdminAnalytics) window.AdminAnalytics.bind({ $ });
    const session = IS_PRODUCTION ? await window.AdminSupabase?.getSession?.().catch(() => null) : null;
    if (session?.user?.email) $("#account-name").textContent = session.user.email.split("@")[0];
    const translationFrame = $("#translations-frame");
    if (translationFrame) translationFrame.src = DEMO_DATA ? "./ce-locale/?demo=1" : "./ce-locale/";
    if (IS_PRODUCTION) {
      $("#admin-mode-note")?.remove();
      const frame = $("#translations-frame");
      frame.addEventListener("load", () => {
        try {
          const note = frame.contentDocument.querySelector(".admin-v2-local-note");
          if (note) note.innerHTML = "<span>ЧЕЧЕНСКИЙ UI</span> · облачный черновик · публикация в приложении отдельно";
        } catch { /* Child workbench can still be used with its own accessible layout. */ }
      });
    }
    await loadCatalog({ quiet: true });
    state.release = state.catalog?.release || {};
    if (Array.isArray(state.catalog?.announcements)) state.announcements = state.catalog.announcements;
    if (Array.isArray(state.catalog?.dailyAyahPool)) state.dailyAyahPool = state.catalog.dailyAyahPool;
    if (Array.isArray(state.catalog?.dailyDuaPool)) state.dailyDuaPool = state.catalog.dailyDuaPool;
    if (state.catalog?.homeManifest) state.homeManifest = state.catalog.homeManifest;
    if (DEMO_DATA) {
      state.announcements = DEMO_DATA.banners.map((item) => ({ ...item }));
      state.release = DEMO_DATA.release;
      state.dailyAyahPool = DEMO_DATA.dailyAyahPool;
      state.dailyDuaPool = DEMO_DATA.dailyDuaPool;
      $("#home-status").textContent = "ДЕМО · пример главной";
      $("#home-export-note").textContent = "Демо: скачиваются тестовые данные. Манифест подготовлен для примера.";
    }
    $("#daily-ayah-pool").value = JSON.stringify(state.dailyAyahPool, null, 2);
    $("#daily-dua-pool").value = JSON.stringify(state.dailyDuaPool, null, 2);
    renderBanners();
    fillReleaseForm();
    drawChart("#overview-chart", "#chart-detail", [], "#overview-coverage");
    void loadOverview();
    if (!IS_PRODUCTION) $("#account-status").textContent = DEMO_DATA ? "ДЕМО · изменения локальны" : "Тест без записи в прод";
  }

  void boot().catch((error) => {
    console.error("Admin V2 Terra startup", error);
    toast(`Не удалось запустить админку: ${error.message || error}`);
  });
})();
