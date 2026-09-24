(() => {
  "use strict";

  const STORAGE_KEY = "tajweed-azkar-editor:v2";
  const STORAGE_BACKUP_KEY = "tajweed-azkar-editor:v2:backup";
  const SCHEMA_VERSION = 2;

  const RULES = [
    { id: "madd2", label: "Мадд 2", color: "#b27a4a", key: "1" },
    { id: "madd246", label: "Мадд 2–4–6", color: "#e27b24", key: "2" },
    { id: "madd45", label: "Мадд 4–5", color: "#c63b43", key: "3" },
    { id: "madd6", label: "Мадд 6", color: "#8b1e2d", key: "4" },
    { id: "ghunna", label: "Гунна", color: "#3f9a55", key: "5" },
    { id: "qalqala", label: "Калькаля", color: "#4fb6d3", key: "6" },
    { id: "tafkheem", label: "Тафхим", color: "#173f73", key: "7" },
    { id: "silent", label: "Слияние", color: "#8f959b", key: "8" },
    {
      id: "interdental",
      label: "Межзубные",
      color: "#8a6a28",
      key: "9",
      hint: "ث ذ ظ — язык между зубами",
      strip: false, // pinned chip next to layers, not in scroll strip
    },
  ];
  const RULE_MAP = Object.fromEntries(RULES.map((r) => [r.id, r]));
  // Interdental is low for letter color so tafkheem/madds win; it keeps its own underline cue.
  const COLOR_PRIORITY = [
    "madd6", "madd45", "madd246", "madd2", "ghunna", "qalqala", "tafkheem", "silent", "interdental",
  ];

  const LIBRARY_VERSION = 2;
  const SEEDS = Array.isArray(window.TAJWEED_SEED_DOCS) ? window.TAJWEED_SEED_DOCS : [];
  const EXTRAS = Array.isArray(window.TAJWEED_EXTRA_DOCS) ? window.TAJWEED_EXTRA_DOCS : [];

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $("docTitle"),
    id: $("docId"),
    arabic: $("docArabic"),
    translit: $("docTranslit"),
    canvas: $("markupCanvas"),
    ruleGrid: $("ruleGrid"),
    selMeta: $("selMeta"),
    marksList: $("marksList"),
    markCount: $("markCount"),
    jsonPreview: $("jsonPreview"),
    saveStatus: $("saveStatus"),
    plainDialog: $("plainDialog"),
    plainText: $("plainText"),
    helpDialog: $("helpDialog"),
    fileInput: $("fileInput"),
    btnAccent: $("btnAccent"),
    btnHidden: $("btnHidden"),
    btnInterdental: $("btnInterdental"),
    docSelect: $("docSelect"),
    addDialog: $("addDocDialog"),
    addForm: $("addDocForm"),
    addTitle: $("addDocTitle"),
    addTemplate: $("addDocTemplate"),
    addTemplateField: $("addTemplateField"),
    publishDialog: $("publishDialog"),
    publishForm: $("publishForm"),
    publishList: $("publishList"),
    publishHint: $("publishHint"),
    publishSummary: $("publishSummary"),
  };

  let library = { version: LIBRARY_VERSION, activeId: "", docs: [] };
  let doc = emptyDoc();
  let selection = null;
  let activeMarkIndex = -1;
  let drag = null;
  const history = [];
  const future = [];
  let saveTimer = null;
  /** Per-doc: true after «Предложить цвета» — next press clears marks. */
  const suggestToggleByDoc = new Map();

  function emptyDoc() {
    return {
      version: SCHEMA_VERSION,
      id: "",
      title: "",
      azkarIds: [],
      arabic: "",
      transliteration: "",
      marks: [],
    };
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function clampMark(mark, len) {
    const start = Math.max(0, Math.min(Number(mark.start) || 0, len));
    const end = Math.max(0, Math.min(Number(mark.end) || 0, len));
    if (end <= start) return null;
    return {
      start,
      end,
      rules: Array.isArray(mark.rules) ? mark.rules.filter((id) => RULE_MAP[id]) : [],
      accent: Boolean(mark.accent),
      hidden: Boolean(mark.hidden),
      note: String(mark.note || ""),
    };
  }

  function normalizeDoc(raw) {
    const base = emptyDoc();
    const src = raw && typeof raw === "object" ? raw : {};
    base.id = String(src.id || "");
    base.title = String(src.title || "");
    base.azkarIds = Array.isArray(src.azkarIds)
      ? src.azkarIds.map(String).filter(Boolean)
      : [];
    base.arabic = String(src.arabic || "");
    base.transliteration = String(src.transliteration || src.text || "");
    const marks = Array.isArray(src.marks) ? src.marks : [];
    base.marks = marks
      .map((m) => {
        const rules = Array.isArray(m.rules)
          ? m.rules
          : m.rule
            ? [m.rule]
            : [];
        return clampMark({ ...m, rules }, base.transliteration.length);
      })
      .filter(Boolean);
    return base;
  }

  function pushHistory() {
    history.push(clone(doc));
    if (history.length > 100) history.shift();
    future.length = 0;
    scheduleSave();
  }

  function undo() {
    if (!history.length) return;
    future.push(clone(doc));
    doc = history.pop();
    selection = null;
    activeMarkIndex = -1;
    syncForm();
    renderAll();
    scheduleSave();
  }

  function redo() {
    if (!future.length) return;
    history.push(clone(doc));
    doc = future.pop();
    selection = null;
    activeMarkIndex = -1;
    syncForm();
    renderAll();
    scheduleSave();
  }


  function nowIso() {
    return new Date().toISOString();
  }

  function seedDoc(raw) {
    const d = normalizeDoc(raw);
    d.updatedAt = raw && raw.updatedAt ? String(raw.updatedAt) : nowIso();
    return d;
  }

  function emptyLibrary() {
    return {
      version: LIBRARY_VERSION,
      activeId: "",
      docs: SEEDS.map((s) => seedDoc(s)),
    };
  }

  function ensureSeeds(lib, { overwriteEmptyTranslit = false } = {}) {
    for (const seed of SEEDS) {
      const idx = lib.docs.findIndex((d) => d.id === seed.id);
      if (idx < 0) {
        lib.docs.push(seedDoc(seed));
        continue;
      }
      if (overwriteEmptyTranslit && !lib.docs[idx].transliteration && seed.transliteration) {
        lib.docs[idx] = seedDoc({
          ...lib.docs[idx],
          arabic: lib.docs[idx].arabic || seed.arabic,
          transliteration: seed.transliteration,
          marks: lib.docs[idx].marks.length ? lib.docs[idx].marks : seed.marks,
        });
      }
      if (!lib.docs[idx].arabic && seed.arabic) lib.docs[idx].arabic = seed.arabic;
      if (!lib.docs[idx].title && seed.title) lib.docs[idx].title = seed.title;
      if (
        (!lib.docs[idx].azkarIds || !lib.docs[idx].azkarIds.length) &&
        Array.isArray(seed.azkarIds) &&
        seed.azkarIds.length
      ) {
        lib.docs[idx].azkarIds = seed.azkarIds.map(String);
      }
    }
    if (!lib.activeId || !lib.docs.some((d) => d.id === lib.activeId)) {
      lib.activeId = lib.docs[0] ? lib.docs[0].id : "";
    }
    return lib;
  }

  function commitCurrentToLibrary() {
    if (!doc) return;
    doc.updatedAt = nowIso();
    const snapshot = normalizeDoc(doc);
    snapshot.updatedAt = doc.updatedAt;
    if (!snapshot.id) {
      snapshot.id = `doc-${Date.now().toString(36)}`;
      doc.id = snapshot.id;
    }
    // Prefer the previously active slot so renaming ID replaces instead of duplicating.
    let idx = library.docs.findIndex((d) => d.id === library.activeId);
    if (idx < 0) idx = library.docs.findIndex((d) => d.id === snapshot.id);
    if (idx >= 0) library.docs[idx] = snapshot;
    else library.docs.push(snapshot);
    library.activeId = snapshot.id;
  }

  function renderDocSelect() {
    if (!els.docSelect) return;
    const active = library.activeId;
    els.docSelect.innerHTML = library.docs
      .map((d) => {
        const missing = d.transliteration.trim() ? "" : " · нет транслита";
        const marks = d.marks.length ? ` · меток ${d.marks.length}` : "";
        const label = `${d.title || d.id || "Без названия"}${missing}${marks}`;
        return `<option value="${escapeHtml(d.id)}"${d.id === active ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }


  function libraryStats(lib) {
    const docs = (lib && Array.isArray(lib.docs)) ? lib.docs : [];
    let marks = 0;
    let translit = 0;
    for (const d of docs) {
      marks += Array.isArray(d.marks) ? d.marks.length : 0;
      translit += String(d.transliteration || "").trim().length;
    }
    return { docs: docs.length, marks, translit };
  }

  function isRicherLibrary(candidate, baseline) {
    const a = libraryStats(candidate);
    const b = libraryStats(baseline);
    if (a.marks !== b.marks) return a.marks > b.marks;
    if (a.translit !== b.translit) return a.translit > b.translit;
    return a.docs > b.docs;
  }

  function readBackupLibrary() {
    try {
      const raw = localStorage.getItem(STORAGE_BACKUP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.docs)) return null;
      return ensureSeeds({
        version: LIBRARY_VERSION,
        activeId: String(parsed.activeId || ""),
        docs: parsed.docs.map((d) => seedDoc(d)),
      });
    } catch {
      return null;
    }
  }

  function scheduleSave() {
    els.saveStatus.textContent = "Сохранение…";
    els.saveStatus.classList.remove("ok");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        commitCurrentToLibrary();
        renderDocSelect();
        // Keep previous snapshot so a bad boot cannot silently wipe marks.
        const prev = localStorage.getItem(STORAGE_KEY);
        if (prev) {
          try {
            const prevObj = JSON.parse(prev);
            if (prevObj && Array.isArray(prevObj.docs) && isRicherLibrary(prevObj, library)) {
              localStorage.setItem(STORAGE_BACKUP_KEY, prev);
            } else if (!localStorage.getItem(STORAGE_BACKUP_KEY)) {
              localStorage.setItem(STORAGE_BACKUP_KEY, prev);
            }
          } catch {
            localStorage.setItem(STORAGE_BACKUP_KEY, prev);
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
        els.saveStatus.textContent = "Сохранено";
        els.saveStatus.classList.add("ok");
      } catch {
        els.saveStatus.textContent = "Ошибка сохранения";
      }
    }, 250);
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.docs)) {
        return ensureSeeds({
          version: LIBRARY_VERSION,
          activeId: String(parsed.activeId || ""),
          docs: parsed.docs.map((d) => seedDoc(d)),
        });
      }
      // migrate v1 single doc
      const one = normalizeDoc(parsed);
      const lib = emptyLibrary();
      const idx = lib.docs.findIndex((d) => d.id === one.id);
      if (idx >= 0) lib.docs[idx] = seedDoc(one);
      else if (one.id || one.transliteration || one.arabic) lib.docs.unshift(seedDoc(one));
      lib.activeId = one.id || lib.docs[0].id;
      return ensureSeeds(lib);
    } catch {
      return null;
    }
  }

  function syncForm() {
    els.title.value = doc.title;
    els.id.value = doc.id;
    els.arabic.value = doc.arabic;
    if (els.translit) els.translit.value = doc.transliteration;
  }

  function exportObject() {
    return {
      version: SCHEMA_VERSION,
      id: doc.id,
      title: doc.title,
      azkarIds: Array.isArray(doc.azkarIds) ? doc.azkarIds.slice() : [],
      arabic: doc.arabic,
      transliteration: doc.transliteration,
      marks: doc.marks
        .slice()
        .sort((a, b) => a.start - b.start || a.end - b.end)
        .map((m) => ({
          start: m.start,
          end: m.end,
          rules: m.rules.slice(),
          accent: Boolean(m.accent),
          hidden: Boolean(m.hidden),
          ...(m.note ? { note: m.note } : {}),
        })),
    };
  }

  function primaryRule(ruleIds) {
    for (const id of COLOR_PRIORITY) if (ruleIds.includes(id)) return id;
    return null;
  }

  function secondaryRule(ruleIds, primary) {
    return ruleIds.find((id) => id !== primary) || null;
  }

  function marksCovering(index) {
    return doc.marks.filter((m) => index >= m.start && index < m.end);
  }

  function setSelection(start, end) {
    if (start == null || end == null || end <= start) selection = null;
    else {
      const a = Math.max(0, Math.min(start, end));
      const b = Math.min(doc.transliteration.length, Math.max(start, end));
      selection = b > a ? { start: a, end: b } : null;
    }
    activeMarkIndex = -1;
    renderCanvas();
    updateSelectionMeta();
    updateLayerButtons();
  }

  function updateSelectionMeta() {
    if (!selection) {
      els.selMeta.textContent = "Выделение: нет";
      return;
    }
    const snippet = doc.transliteration.slice(selection.start, selection.end);
    const short = snippet.length > 42 ? `${snippet.slice(0, 40)}…` : snippet;
    els.selMeta.textContent = `Выделение: [${selection.start}, ${selection.end}) «${short.replace(/\n/g, "↵")}»`;
  }

  function selectionMarks() {
    if (!selection) return [];
    return doc.marks.filter((m) => m.start < selection.end && m.end > selection.start);
  }

  function updateLayerButtons() {
    const overlapping = selectionMarks();
    els.btnAccent.classList.toggle("active", overlapping.some((m) => m.accent));
    els.btnHidden.classList.toggle("active", overlapping.some((m) => m.hidden));
    if (els.btnInterdental) {
      els.btnInterdental.classList.toggle(
        "active",
        overlapping.some((m) => m.rules.includes("interdental")),
      );
    }
    for (const btn of els.ruleGrid.querySelectorAll(".rule-btn")) {
      const id = btn.dataset.rule;
      btn.classList.toggle("active", overlapping.some((m) => m.rules.includes(id)));
    }
  }

  function ensureSelection() {
    if (!selection || selection.end <= selection.start) {
      els.selMeta.textContent = "Сначала выдели фрагмент";
      return false;
    }
    return true;
  }

  function upsertMarkForSelection(mutate) {
    if (!ensureSelection()) return;
    pushHistory();
    const { start, end } = selection;
    let mark = doc.marks.find((m) => m.start === start && m.end === end);
    if (!mark) {
      mark = { start, end, rules: [], accent: false, hidden: false, note: "" };
      doc.marks.push(mark);
    }
    mutate(mark);
    doc.marks = doc.marks.filter((m) => m.rules.length || m.accent || m.hidden || m.note);
    renderAll();
  }

  function toggleRule(ruleId) {
    upsertMarkForSelection((mark) => {
      mark.rules = mark.rules.includes(ruleId)
        ? mark.rules.filter((id) => id !== ruleId)
        : [...mark.rules, ruleId];
    });
  }

  function toggleAccent() {
    upsertMarkForSelection((mark) => {
      mark.accent = !mark.accent;
    });
  }

  function toggleHidden() {
    upsertMarkForSelection((mark) => {
      mark.hidden = !mark.hidden;
    });
  }

  function clearSelectionMarks() {
    if (!ensureSelection()) return;
    pushHistory();
    const { start, end } = selection;
    doc.marks = doc.marks.filter((m) => !(m.start < end && m.end > start));
    renderAll();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderRulesUi() {
    els.ruleGrid.innerHTML = "";
    for (const rule of RULES) {
      if (rule.strip === false) continue; // pinned chip elsewhere
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rule-btn";
      btn.dataset.rule = rule.id;
      btn.title = rule.hint ? `${rule.hint} · клавиша ${rule.key}` : `Клавиша ${rule.key}`;
      btn.innerHTML = `<span class="swatch" style="background:${rule.color}"></span><strong>${rule.label}</strong><small>${rule.key}</small>`;
      btn.addEventListener("click", () => toggleRule(rule.id));
      els.ruleGrid.appendChild(btn);
    }
  }

  function renderCanvas() {
    const text = doc.transliteration;
    if (!text) {
      els.canvas.innerHTML = `<div class="empty">Нет транслитерации. Вставь текст в поле выше — затем размечай здесь.</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const span = document.createElement("span");
      span.className = "ch";
      span.dataset.i = String(i);
      if (ch === "\n") {
        span.classList.add("nl");
      } else if (ch === " ") {
        span.classList.add("space");
        span.textContent = " ";
      } else {
        span.textContent = ch;
      }

      const covering = marksCovering(i);
      const ruleIds = [...new Set(covering.flatMap((m) => m.rules))];
      const primary = primaryRule(ruleIds);
      if (primary) {
        span.style.color = RULE_MAP[primary].color;
        span.style.fontWeight = primary === "silent" || primary === "interdental" ? "500" : "700";
      }
      if (covering.some((m) => m.accent)) span.classList.add("has-accent");
      if (covering.some((m) => m.hidden)) span.classList.add("has-hidden");
      // Always show a tongue/teeth cue so interdental stays visible under tafkheem etc.
      if (ruleIds.includes("interdental")) span.classList.add("has-interdental");
      const secondary = secondaryRule(ruleIds, primary);
      // Skip redundant secondary dot when the underline already marks interdental.
      if (secondary && secondary !== "interdental") {
        const dot = document.createElement("span");
        dot.className = "sec";
        dot.style.background = RULE_MAP[secondary].color;
        span.appendChild(dot);
      }
      if (selection && i >= selection.start && i < selection.end) span.classList.add("selected");
      frag.appendChild(span);
    }
    els.canvas.replaceChildren(frag);
  }

  function renderMarksList() {
    const sorted = doc.marks
      .map((m, index) => ({ m, index }))
      .sort((a, b) => a.m.start - b.m.start || a.m.end - b.m.end);
    els.markCount.textContent = String(doc.marks.length);
    if (!sorted.length) {
      els.marksList.innerHTML =
        `<div class="empty" style="min-height:auto;color:var(--muted);font-size:.85rem">Меток пока нет — выдели текст и назначь правило.</div>`;
      return;
    }
    els.marksList.innerHTML = "";
    for (const { m, index } of sorted) {
      const item = document.createElement("div");
      item.className = "mark-item" + (index === activeMarkIndex ? " active" : "");
      const snippet = doc.transliteration.slice(m.start, m.end).replace(/\n/g, "↵");
      const chips = [
        ...m.rules.map(
          (id) =>
            `<span class="chip"><span class="dot" style="background:${RULE_MAP[id].color}"></span>${RULE_MAP[id].label}</span>`
        ),
        m.accent ? `<span class="chip">ударение</span>` : "",
        m.hidden ? `<span class="chip">скрытый</span>` : "",
      ]
        .filter(Boolean)
        .join("");
      item.innerHTML = `
        <div class="snippet">${escapeHtml(snippet || "∅")}</div>
        <button type="button" class="del" data-del="${index}" title="Удалить">✕</button>
        <div class="chips">${chips || `<span class="chip">пусто</span>`}</div>
        <div class="meta">[${m.start}, ${m.end})${m.note ? " · " + escapeHtml(m.note) : ""}</div>
      `;
      item.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        activeMarkIndex = index;
        setSelection(m.start, m.end);
        renderMarksList();
      });
      item.querySelector("[data-del]").addEventListener("click", (e) => {
        e.stopPropagation();
        pushHistory();
        doc.marks.splice(index, 1);
        if (activeMarkIndex === index) activeMarkIndex = -1;
        renderAll();
      });
      els.marksList.appendChild(item);
    }
  }

  function renderJson() {
    els.jsonPreview.textContent = JSON.stringify(exportObject(), null, 2);
  }

  function renderAll() {
    renderCanvas();
    renderMarksList();
    renderJson();
    updateSelectionMeta();
    updateLayerButtons();
  }

  function indexFromEventTarget(target) {
    const el = target && target.closest ? target.closest(".ch") : null;
    if (!el || !els.canvas.contains(el)) return null;
    const i = Number(el.dataset.i);
    return Number.isFinite(i) ? i : null;
  }

  function bindCanvasPointer() {
    els.canvas.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      const i = indexFromEventTarget(e.target);
      if (i == null) {
        setSelection(null, null);
        return;
      }
      els.canvas.setPointerCapture(e.pointerId);
      drag = { anchor: i };
      setSelection(i, i + 1);
      e.preventDefault();
    });
    els.canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const i = indexFromEventTarget(e.target);
      if (i == null) return;
      setSelection(Math.min(drag.anchor, i), Math.max(drag.anchor, i) + 1);
    });
    const endDrag = () => {
      drag = null;
    };
    els.canvas.addEventListener("pointerup", endDrag);
    els.canvas.addEventListener("pointercancel", endDrag);
    els.canvas.addEventListener("dblclick", (e) => {
      const i = indexFromEventTarget(e.target);
      if (i == null) return;
      const text = doc.transliteration;
      if (!text[i] || /\s/.test(text[i])) return;
      let a = i;
      let b = i;
      while (a > 0 && !/\s/.test(text[a - 1])) a -= 1;
      while (b < text.length && !/\s/.test(text[b])) b += 1;
      setSelection(a, b);
    });
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportObject(), null, 2));
      els.saveStatus.textContent = "Скопировано";
      els.saveStatus.classList.add("ok");
    } catch {
      els.saveStatus.textContent = "Не скопировалось";
    }
  }


  function applyTransliteration(nextText, { history: withHistory = true } = {}) {
    if (withHistory) pushHistory();
    doc.transliteration = String(nextText || "");
    doc.marks = doc.marks
      .map((m) => clampMark(m, doc.transliteration.length))
      .filter(Boolean);
    selection = null;
    if (els.translit && els.translit.value !== doc.transliteration) {
      els.translit.value = doc.transliteration;
    }
    renderAll();
  }

  function switchToDoc(id, { commitCurrent = true } = {}) {
    if (commitCurrent) commitCurrentToLibrary();
    const found = library.docs.find((d) => d.id === id);
    if (!found) return;
    library.activeId = id;
    doc = normalizeDoc(found);
    doc.updatedAt = found.updatedAt || nowIso();
    selection = null;
    activeMarkIndex = -1;
    history.length = 0;
    future.length = 0;
    syncForm();
    renderDocSelect();
    renderAll();
    scheduleSave();
  }

  function loadDoc(next, { addToLibrary = true } = {}) {
    doc = normalizeDoc(next);
    if (!doc.id) doc.id = `doc-${Date.now().toString(36)}`;
    doc.updatedAt = nowIso();
    selection = null;
    activeMarkIndex = -1;
    history.length = 0;
    future.length = 0;
    if (addToLibrary) {
      const idx = library.docs.findIndex((d) => d.id === doc.id);
      const snap = normalizeDoc(doc);
      snap.updatedAt = doc.updatedAt;
      if (idx >= 0) library.docs[idx] = snap;
      else library.docs.push(snap);
      library.activeId = doc.id;
    }
    syncForm();
    renderDocSelect();
    renderAll();
    scheduleSave();
  }

  function downloadJson() {
    commitCurrentToLibrary();
    const blob = new Blob([JSON.stringify(exportObject(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(doc.id || "azkar-tajweed").replace(/[^\w.-]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadLibrary() {
    commitCurrentToLibrary();
    const payload = {
      version: LIBRARY_VERSION,
      exportedAt: nowIso(),
      docs: library.docs.map((d) => normalizeDoc(d)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `azkar-tajweed-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    els.saveStatus.textContent = `Экспорт: ${payload.docs.length} док.`;
    els.saveStatus.classList.add("ok");
  }

  function applyCloudLibrary(payload, label) {
    if (!payload || !Array.isArray(payload.docs)) {
      throw new Error("В облаке нет библиотеки docs[]");
    }
    library = {
      version: LIBRARY_VERSION,
      activeId: payload.activeId || payload.docs[0]?.id || "",
      docs: payload.docs.map((d) => seedDoc(d)),
    };
    ensureSeeds(library);
    const active =
      library.docs.find((d) => d.id === library.activeId) || library.docs[0];
    doc = normalizeDoc(active || emptyDoc());
    if (!doc.id && active) doc.id = active.id;
    selection = null;
    activeMarkIndex = -1;
    history.length = 0;
    future.length = 0;
    syncForm();
    renderDocSelect();
    renderAll();
    scheduleSave();
    els.saveStatus.textContent = label;
    els.saveStatus.classList.add("ok");
  }

  async function cloudSaveDraft() {
    if (!globalThis.TajweedCloud) {
      alert("Cloud-модуль не загружен");
      return;
    }
    commitCurrentToLibrary();
    els.saveStatus.textContent = "Черновик…";
    els.saveStatus.classList.remove("ok");
    try {
      const result = await globalThis.TajweedCloud.saveDraftLibrary({
        version: LIBRARY_VERSION,
        activeId: library.activeId,
        docs: library.docs.map((d) => normalizeDoc(d)),
        savedAt: nowIso(),
      });
      els.saveStatus.textContent = `Черновик · ${result.updatedBy || "ok"}`;
      els.saveStatus.classList.add("ok");
    } catch (error) {
      els.saveStatus.textContent =
        error instanceof Error ? error.message : "Ошибка черновика";
      els.saveStatus.classList.remove("ok");
    }
  }

  function markedExampleDocs() {
    return library.docs
      .map((d) => normalizeDoc(d))
      .filter((d) => d.transliteration.trim() && d.marks.length > 0);
  }

  function applySuggestedMarks() {
    if (!globalThis.TajweedSuggest?.suggestMarksForText) {
      alert("Модуль подсказок не загружен");
      return;
    }
    const text = String(doc.transliteration || "");
    if (!text.trim()) {
      alert("Сначала вставьте транслитерацию");
      return;
    }
    const toggleKey = String(doc.id || library.activeId || "active");

    // Second press → clear suggestions
    if (suggestToggleByDoc.get(toggleKey) && doc.marks.length) {
      pushHistory();
      doc.marks = [];
      suggestToggleByDoc.set(toggleKey, false);
      selection = null;
      activeMarkIndex = -1;
      renderAll();
      scheduleSave();
      els.saveStatus.textContent = "Подсказки сняты";
      els.saveStatus.classList.add("ok");
      return;
    }

    const examples = markedExampleDocs();
    if (!examples.length && Array.isArray(SEEDS)) {
      for (const s of SEEDS) {
        const d = normalizeDoc(s);
        if (d.marks.length) examples.push(d);
      }
    }
    const suggested = globalThis.TajweedSuggest.suggestMarksForText(text, { examples });
    if (!suggested.length) {
      alert("Подсказок нет по орфографии (´ х1 рр нн къ …). Разметьте вручную.");
      return;
    }
    pushHistory();
    doc.marks = suggested
      .map((m) => clampMark(m, text.length))
      .filter(Boolean);
    suggestToggleByDoc.set(toggleKey, true);
    selection = null;
    activeMarkIndex = -1;
    renderAll();
    scheduleSave();
    els.saveStatus.textContent = `Подсказки · ${doc.marks.length} (ещё раз — очистить)`;
    els.saveStatus.classList.add("ok");
  }

  function updatePublishSummary() {
    if (!els.publishList || !els.publishSummary) return;
    const checked = [...els.publishList.querySelectorAll('input[type="checkbox"]:checked')];
    const n = checked.length;
    const liveCount = Number(els.publishDialog?.dataset.liveCount || 0);
    const names = checked
      .slice(0, 8)
      .map((input) => input.dataset.title || input.value)
      .join(", ");
    const more = n > 8 ? ` и ещё ${n - 8}` : "";
    els.publishSummary.innerHTML =
      n === 0
        ? "Ничего не отмечено — на прод ничего не уйдёт."
        : `На прод уйдёт <strong>${n}</strong> док.${names ? `: ${escapeHtml(names)}${more}` : ""}. Итоговый пак ≈ <strong>${liveCount}</strong> (live) с заменой отмеченных.`;
  }

  function renderPublishList(candidates, liveCount) {
    if (!els.publishList) return;
    els.publishDialog.dataset.liveCount = String(liveCount);
    els.publishList.innerHTML = candidates
      .map((c) => {
        const badges = [
          `<span class="publish-badge ${c.kind}">${c.kind === "new" ? "новый" : "изменён"}</span>`,
          c.hasTranslit ? "" : `<span class="publish-badge warn">нет транслита</span>`,
          c.marks ? `<span class="publish-badge">меток ${c.marks}</span>` : `<span class="publish-badge warn">без меток</span>`,
        ]
          .filter(Boolean)
          .join("");
        return `<label class="publish-row">
          <input type="checkbox" value="${escapeHtml(c.id)}" data-title="${escapeHtml(c.title)}" data-ready="${c.defaultChecked ? "1" : "0"}" ${c.defaultChecked ? "checked" : ""} />
          <span>
            <span class="publish-row-title">${escapeHtml(c.title)}</span>
            <div class="publish-row-meta">${badges}<br /><code>${escapeHtml(c.id)}</code></div>
          </span>
        </label>`;
      })
      .join("");
    updatePublishSummary();
  }

  function setPublishChecks(mode) {
    if (!els.publishList) return;
    const boxes = [...els.publishList.querySelectorAll('input[type="checkbox"]')];
    for (const box of boxes) {
      if (mode === "none") box.checked = false;
      else if (mode === "all") box.checked = true;
      else if (mode === "ready") {
        box.checked = box.dataset.ready === "1";
      }
    }
    updatePublishSummary();
  }

  /**
   * Opens checklist; resolves with selected ids or null if cancelled.
   */
  function openPublishChecklist(candidates, liveCount) {
    return new Promise((resolve) => {
      if (!els.publishDialog || !els.publishForm) {
        resolve(null);
        return;
      }
      renderPublishList(candidates, liveCount);
      if (els.publishHint) {
        els.publishHint.textContent =
          `Изменений относительно прод: ${candidates.length}. Черновик уже/будет сохранён целиком. На waydean.ru уйдут только отмеченные.`;
      }

      const onClose = () => {
        els.publishDialog.removeEventListener("close", onClose);
        if (els.publishDialog.returnValue !== "ok") {
          resolve(null);
          return;
        }
        const ids = [...els.publishList.querySelectorAll('input[type="checkbox"]:checked')].map(
          (el) => el.value
        );
        resolve(ids);
      };
      els.publishDialog.addEventListener("close", onClose);
      els.publishDialog.showModal();
    });
  }

  async function cloudPublish() {
    if (!globalThis.TajweedCloud) {
      alert("Cloud-модуль не загружен");
      return;
    }
    commitCurrentToLibrary();
    const draftDocs = library.docs.map((d) => normalizeDoc(d));
    els.saveStatus.textContent = "Подготовка…";
    els.saveStatus.classList.remove("ok");
    try {
      await globalThis.TajweedCloud.saveDraftLibrary({
        version: LIBRARY_VERSION,
        activeId: library.activeId,
        docs: draftDocs,
        savedAt: nowIso(),
      });
      const livePack = await globalThis.TajweedCloud.fetchLivePack();
      const liveDocs = Array.isArray(livePack?.docs) ? livePack.docs : [];
      const candidates = globalThis.TajweedCloud.listPublishCandidates(draftDocs, liveDocs);
      if (!candidates.length) {
        els.saveStatus.textContent = "Нет изменений vs прод";
        els.saveStatus.classList.add("ok");
        alert("Черновик совпадает с прод-паком — публиковать нечего.");
        return;
      }
      const selectedIds = await openPublishChecklist(candidates, liveDocs.length);
      if (!selectedIds) {
        els.saveStatus.textContent = "Публикация отменена";
        return;
      }
      if (!selectedIds.length) {
        alert("Ничего не отмечено — на прод не уйдёт.");
        els.saveStatus.textContent = "Публикация отменена";
        return;
      }
      const mergedDocs = globalThis.TajweedCloud.mergeSelectedDocs(
        liveDocs,
        draftDocs,
        selectedIds
      );
      const titles = selectedIds
        .map((id) => draftDocs.find((d) => d.id === id)?.title || id)
        .slice(0, 12);
      if (
        !confirm(
          `Опубликовать ${selectedIds.length} док. на waydean.ru?\n` +
            `${titles.join("\n")}${selectedIds.length > 12 ? "\n…" : ""}\n\n` +
            `Итоговый пак: ${mergedDocs.length} docs (остальной live без изменений).`
        )
      ) {
        els.saveStatus.textContent = "Публикация отменена";
        return;
      }
      els.saveStatus.textContent = "Публикация…";
      const result = await globalThis.TajweedCloud.publishLibrary({
        version: LIBRARY_VERSION,
        docs: mergedDocs,
      });
      els.saveStatus.textContent = `Прод · ${selectedIds.length} из ${mergedDocs.length} · ${result.publishedAt || "ok"}`;
      els.saveStatus.classList.add("ok");
    } catch (error) {
      els.saveStatus.textContent =
        error instanceof Error ? error.message : "Ошибка публикации";
      els.saveStatus.classList.remove("ok");
    }
  }

  async function cloudLoadDraft() {
    if (!globalThis.TajweedCloud) {
      alert("Cloud-модуль не загружен");
      return;
    }
    els.saveStatus.textContent = "Загрузка…";
    els.saveStatus.classList.remove("ok");
    try {
      const row = await globalThis.TajweedCloud.loadDraftLibrary();
      if (!row?.library) {
        els.saveStatus.textContent = "Черновик пуст";
        return;
      }
      applyCloudLibrary(
        row.library,
        `Черновик · ${row.updatedBy || "cloud"}${row.updatedAt ? ` · ${row.updatedAt.slice(0, 16)}` : ""}`
      );
    } catch (error) {
      els.saveStatus.textContent =
        error instanceof Error ? error.message : "Ошибка загрузки";
      els.saveStatus.classList.remove("ok");
    }
  }

  async function cloudPullLive() {
    if (!globalThis.TajweedCloud) {
      alert("Cloud-модуль не загружен");
      return;
    }
    if (!confirm("Подтянуть текущий пак с waydean.ru в редактор?")) return;
    els.saveStatus.textContent = "Прод…";
    els.saveStatus.classList.remove("ok");
    try {
      const pack = await globalThis.TajweedCloud.fetchLivePack();
      applyCloudLibrary(pack, `Прод · ${Array.isArray(pack.docs) ? pack.docs.length : 0} док.`);
    } catch (error) {
      els.saveStatus.textContent =
        error instanceof Error ? error.message : "Ошибка прод-пака";
      els.saveStatus.classList.remove("ok");
    }
  }

  function importPayload(parsed) {
    if (parsed && Array.isArray(parsed.docs)) {
      for (const item of parsed.docs) {
        const d = seedDoc(item);
        if (!d.id) d.id = `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const idx = library.docs.findIndex((x) => x.id === d.id);
        if (idx >= 0) library.docs[idx] = d;
        else library.docs.push(d);
      }
      if (parsed.activeId && library.docs.some((d) => d.id === parsed.activeId)) {
        library.activeId = parsed.activeId;
      }
      ensureSeeds(library);
      switchToDoc(library.activeId || library.docs[0].id);
      return;
    }
    loadDoc(parsed);
  }


  function uniqueDocId(base) {
    const root = String(base || "doc")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "doc";
    let id = root;
    let n = 2;
    while (library.docs.some((d) => d.id === id)) {
      id = `${root}-${n}`;
      n += 1;
    }
    return id;
  }

  function allTemplates() {
    const byId = new Map();
    for (const item of [...SEEDS, ...EXTRAS]) {
      if (!item || !item.id) continue;
      byId.set(item.id, item);
    }
    return [...byId.values()];
  }

  function fillAddTemplateSelect() {
    if (!els.addTemplate) return;
    const present = new Set(library.docs.map((d) => d.id));
    const templates = allTemplates().filter((t) => t.id !== "azkar-blank-custom");
    els.addTemplate.innerHTML = templates
      .map((t) => {
        const inLib = present.has(t.id) ? " · уже в списке" : "";
        return `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title || t.id)}${inLib}</option>`;
      })
      .join("");
  }

  function openAddDialog({ mode = "empty" } = {}) {
    if (!els.addDialog) return;
    fillAddTemplateSelect();
    const modeInput = els.addForm.querySelector(`input[name="addMode"][value="${mode}"]`);
    if (modeInput) modeInput.checked = true;
    syncAddDialogMode();
    if (mode === "duplicate") {
      els.addTitle.value = `${doc.title || doc.id || "Азкар"} (копия)`;
    } else if (mode === "template") {
      const opt = els.addTemplate.selectedOptions[0];
      els.addTitle.value = opt ? opt.textContent.replace(/ · уже в списке$/, "") : "";
    } else {
      els.addTitle.value = "";
      els.addTitle.placeholder = "Название нового азкара";
    }
    els.addDialog.showModal();
    queueMicrotask(() => els.addTitle.focus());
  }

  function syncAddDialogMode() {
    if (!els.addForm) return;
    const mode = (els.addForm.querySelector('input[name="addMode"]:checked') || {}).value || "empty";
    if (els.addTemplateField) els.addTemplateField.hidden = mode !== "template";
    if (mode === "duplicate") {
      els.addTitle.value = `${doc.title || doc.id || "Азкар"} (копия)`;
    } else if (mode === "template") {
      const t = allTemplates().find((x) => x.id === els.addTemplate.value);
      if (t) els.addTitle.value = t.title || t.id;
    }
  }

  function createDocFromAddDialog() {
    const mode = (els.addForm.querySelector('input[name="addMode"]:checked') || {}).value || "empty";
    const title = String(els.addTitle.value || "").trim() || "Новый азкар";
    commitCurrentToLibrary();

    let next;
    if (mode === "duplicate") {
      next = normalizeDoc(doc);
      next.marks = clone(doc.marks);
      next.title = title;
      next.id = uniqueDocId(`${doc.id || "doc"}-copy`);
    } else if (mode === "template") {
      const tpl = allTemplates().find((x) => x.id === els.addTemplate.value) || emptyDoc();
      next = seedDoc(tpl);
      next.title = title;
      // If template id already used, keep content but new id so we never overwrite.
      if (library.docs.some((d) => d.id === next.id)) {
        next.id = uniqueDocId(next.id);
      }
      // Keep sample marks from template when present; never touches existing docs.
      if (!next.transliteration) next.transliteration = "";
    } else {
      next = emptyDoc();
      next.title = title;
      next.id = uniqueDocId(title);
    }
    next.updatedAt = nowIso();
    loadDoc(next);
    els.saveStatus.textContent = `Добавлено: ${next.title}`;
    els.saveStatus.classList.add("ok");
  }

  function bindChrome() {
    const bindMeta = (el, key) => {
      if (!el) return;
      el.addEventListener("input", () => {
        doc[key] = el.value;
        if (key === "id") {
          // keep select in sync later via save
        }
        renderJson();
        scheduleSave();
      });
    };
    bindMeta(els.title, "title");
    bindMeta(els.id, "id");
    bindMeta(els.arabic, "arabic");

    if (els.translit) {
      els.translit.addEventListener("input", () => {
        applyTransliteration(els.translit.value, { history: false });
        scheduleSave();
      });
    }

    if (els.docSelect) {
      els.docSelect.addEventListener("change", () => {
        switchToDoc(els.docSelect.value);
      });
    }

    $("btnAccent").addEventListener("click", toggleAccent);
    $("btnHidden").addEventListener("click", toggleHidden);
    if (els.btnInterdental) {
      els.btnInterdental.addEventListener("click", () => toggleRule("interdental"));
    }
    $("btnClearSel").addEventListener("click", clearSelectionMarks);
    $("btnUndo").addEventListener("click", undo);
    $("btnRedo").addEventListener("click", redo);
    $("btnHelp").addEventListener("click", () => els.helpDialog.showModal());
    $("btnCloseHelp").addEventListener("click", () => els.helpDialog.close());
    $("btnSeedMissing").addEventListener("click", () => {
      ensureSeeds(library);
      // re-add any deleted seeds
      for (const seed of SEEDS) {
        if (!library.docs.some((d) => d.id === seed.id)) library.docs.push(seedDoc(seed));
      }
      renderDocSelect();
      scheduleSave();
      els.saveStatus.textContent = "Эталоны на месте";
      els.saveStatus.classList.add("ok");
    });
    $("btnNew").addEventListener("click", () => openAddDialog({ mode: "empty" }));
    if ($("btnDuplicate")) {
      $("btnDuplicate").addEventListener("click", () => openAddDialog({ mode: "duplicate" }));
    }
    if (els.addForm) {
      els.addForm.addEventListener("change", (e) => {
        if (e.target && e.target.name === "addMode") syncAddDialogMode();
        if (e.target && e.target.id === "addDocTemplate") syncAddDialogMode();
      });
      els.addForm.addEventListener("submit", (e) => {
        const submitter = e.submitter;
        if (submitter && submitter.value === "ok") {
          e.preventDefault();
          createDocFromAddDialog();
          els.addDialog.close();
        }
      });
    }
    $("btnDeleteDoc").addEventListener("click", () => {
      if (library.docs.length <= 1) {
        alert("Нельзя удалить последний документ");
        return;
      }
      if (!confirm(`Удалить «${doc.title || doc.id}»?`)) return;
      // Preserve edits made just before deletion, but don't let a pending autosave
      // or the subsequent switch put this document back into the library.
      commitCurrentToLibrary();
      clearTimeout(saveTimer);
      library.docs = library.docs.filter((d) => d.id !== doc.id);
      library.activeId = library.docs[0].id;
      switchToDoc(library.activeId, { commitCurrent: false });
    });
    $("btnExport").addEventListener("click", downloadJson);
    $("btnExportAll").addEventListener("click", downloadLibrary);
    const btnCloudSave = $("btnCloudSave");
    const btnCloudLoad = $("btnCloudLoad");
    const btnCloudPublish = $("btnCloudPublish");
    const btnCloudPull = $("btnCloudPull");
    if (btnCloudSave) btnCloudSave.addEventListener("click", () => void cloudSaveDraft());
    if (btnCloudLoad) btnCloudLoad.addEventListener("click", () => void cloudLoadDraft());
    if (btnCloudPublish) btnCloudPublish.addEventListener("click", () => void cloudPublish());
    if (btnCloudPull) btnCloudPull.addEventListener("click", () => void cloudPullLive());
    const btnSuggest = $("btnSuggestMarks");
    if (btnSuggest) btnSuggest.addEventListener("click", applySuggestedMarks);
    const btnPubReady = $("btnPublishSelectReady");
    const btnPubAll = $("btnPublishSelectAll");
    const btnPubNone = $("btnPublishSelectNone");
    if (btnPubReady) btnPubReady.addEventListener("click", () => setPublishChecks("ready"));
    if (btnPubAll) btnPubAll.addEventListener("click", () => setPublishChecks("all"));
    if (btnPubNone) btnPubNone.addEventListener("click", () => setPublishChecks("none"));
    if (els.publishList) {
      els.publishList.addEventListener("change", (e) => {
        if (e.target && e.target.matches('input[type="checkbox"]')) updatePublishSummary();
      });
    }
    if (els.publishForm) {
      els.publishForm.addEventListener("submit", (e) => {
        const submitter = e.submitter;
        if (submitter && submitter.value === "ok") {
          const n = els.publishList.querySelectorAll('input[type="checkbox"]:checked').length;
          if (!n) {
            e.preventDefault();
            alert("Отметьте хотя бы один документ или нажмите Отмена.");
          }
        }
      });
    }
    $("btnCopyJson").addEventListener("click", copyJson);
    $("btnImport").addEventListener("click", () => els.fileInput.click());
    $("btnSortMarks").addEventListener("click", () => {
      pushHistory();
      doc.marks.sort((a, b) => a.start - b.start || a.end - b.end);
      renderAll();
    });
    $("btnEditPlain").addEventListener("click", () => {
      els.plainText.value = doc.transliteration;
      els.plainDialog.showModal();
    });
    els.plainDialog.addEventListener("close", () => {
      if (els.plainDialog.returnValue !== "ok") return;
      applyTransliteration(els.plainText.value, { history: true });
    });
    els.fileInput.addEventListener("change", async () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      els.fileInput.value = "";
      if (!file) return;
      try {
        importPayload(JSON.parse(await file.text()));
      } catch {
        alert("Не удалось прочитать JSON");
      }
    });

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        setSelection(null, null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        clearSelectionMarks();
        return;
      }
      if (e.key.toLowerCase() === "a" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleAccent();
        return;
      }
      if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleHidden();
        return;
      }
      const rule = RULES.find((r) => r.key === e.key);
      if (rule) {
        e.preventDefault();
        toggleRule(rule.id);
      }
    });
  }

  function boot() {
    for (const [key, node] of Object.entries(els)) {
      if (!node) {
        console.error("Tajweed editor: missing DOM node", key, els);
        return;
      }
    }

    renderRulesUi();
    bindCanvasPointer();
    bindChrome();

    const stored = loadStored();
    const backup = readBackupLibrary();
    let recoveredFromBackup = false;
    if (stored && backup && isRicherLibrary(backup, stored)) {
      library = backup;
      recoveredFromBackup = true;
    } else {
      library = stored || backup || emptyLibrary();
      recoveredFromBackup = !stored && Boolean(backup);
    }
    ensureSeeds(library);
    const active = library.docs.find((d) => d.id === library.activeId) || library.docs[0];
    doc = normalizeDoc(active || emptyDoc());
    if (!doc.id && active) doc.id = active.id;
    syncForm();
    renderDocSelect();
    renderAll();
    scheduleSave();
    if (recoveredFromBackup) {
      const st = libraryStats(library);
      els.saveStatus.textContent = `Восстановлен бэкап · меток ${st.marks}`;
      els.saveStatus.classList.add("ok");
    }
  }

  boot();
})();
