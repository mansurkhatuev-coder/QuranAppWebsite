(() => {
  "use strict";

  const STORAGE_KEY = "tajweed-azkar-editor:v1";
  const SCHEMA_VERSION = 1;

  const RULES = [
    { id: "madd2", label: "Мадд 2", color: "#b27a4a", key: "1" },
    { id: "madd246", label: "Мадд 2–4–6", color: "#e27b24", key: "2" },
    { id: "madd45", label: "Мадд 4–5", color: "#c63b43", key: "3" },
    { id: "madd6", label: "Мадд 6", color: "#8b1e2d", key: "4" },
    { id: "ghunna", label: "Гунна", color: "#3f9a55", key: "5" },
    { id: "qalqala", label: "Калькаля", color: "#4fb6d3", key: "6" },
    { id: "tafkheem", label: "Тафхим", color: "#173f73", key: "7" },
    { id: "silent", label: "Слияние", color: "#8f959b", key: "8" },
  ];
  const RULE_MAP = Object.fromEntries(RULES.map((r) => [r.id, r]));
  const COLOR_PRIORITY = [
    "madd6", "madd45", "madd246", "madd2", "ghunna", "qalqala", "tafkheem", "silent",
  ];

  const SAMPLE = {
    version: SCHEMA_VERSION,
    id: "azkar-ikhlaas-test",
    title: "Аль‑Ихляс (тест для азкара)",
    arabic:
      "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\nقُلْ هُوَ ٱللَّهُ أَحَدٌ ۝ ٱللَّهُ ٱلصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ",
    transliteration:
      "Бисмилльах1иррохьманиррохьим.\nКъуль х1уваЛлох1у ахьад\nАллох1уссомад\nлам йалид валам йулад\nвалам йакуллах1у куфуван ахьад.",
    marks: [
      { start: 30, end: 32, rules: ["qalqala"], accent: false, hidden: false, note: "Къ — калькаля" },
      { start: 41, end: 43, rules: ["tafkheem"], accent: false, hidden: false, note: "Лл — тафхим" },
      { start: 52, end: 53, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
      { start: 54, end: 60, rules: ["tafkheem"], accent: false, hidden: true, note: "Аллох1 — тафхим + скрытый сад" },
      { start: 66, end: 67, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
      { start: 76, end: 77, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
      { start: 88, end: 89, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
    ],
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $("docTitle"),
    id: $("docId"),
    arabic: $("docArabic"),
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
  };

  let doc = emptyDoc();
  let selection = null;
  let activeMarkIndex = -1;
  let drag = null;
  const history = [];
  const future = [];
  let saveTimer = null;

  function emptyDoc() {
    return {
      version: SCHEMA_VERSION,
      id: "",
      title: "",
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

  function scheduleSave() {
    els.saveStatus.textContent = "Сохранение…";
    els.saveStatus.classList.remove("ok");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
        els.saveStatus.textContent = "Черновик сохранён в браузере";
        els.saveStatus.classList.add("ok");
      } catch {
        els.saveStatus.textContent = "Не удалось сохранить локально";
      }
    }, 250);
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeDoc(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function syncForm() {
    els.title.value = doc.title;
    els.id.value = doc.id;
    els.arabic.value = doc.arabic;
  }

  function exportObject() {
    return {
      version: SCHEMA_VERSION,
      id: doc.id,
      title: doc.title,
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
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rule-btn";
      btn.dataset.rule = rule.id;
      btn.title = `Клавиша ${rule.key}`;
      btn.innerHTML = `<span class="swatch" style="background:${rule.color}"></span><strong>${rule.label}</strong><small>${rule.key}</small>`;
      btn.addEventListener("click", () => toggleRule(rule.id));
      els.ruleGrid.appendChild(btn);
    }
  }

  function renderCanvas() {
    const text = doc.transliteration;
    if (!text) {
      els.canvas.innerHTML = `<div class="empty">Нет текста. Нажми «Эталон Ихляс» или «Правка текста».</div>`;
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
        span.style.fontWeight = primary === "silent" ? "500" : "700";
      }
      if (covering.some((m) => m.accent)) span.classList.add("has-accent");
      if (covering.some((m) => m.hidden)) span.classList.add("has-hidden");
      const secondary = secondaryRule(ruleIds, primary);
      if (secondary) {
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

  function downloadJson() {
    const blob = new Blob([JSON.stringify(exportObject(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(doc.id || "azkar-tajweed").replace(/[^\w.-]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportObject(), null, 2));
      els.saveStatus.textContent = "JSON скопирован";
      els.saveStatus.classList.add("ok");
    } catch {
      els.saveStatus.textContent = "Не удалось скопировать";
    }
  }

  function loadDoc(next) {
    doc = normalizeDoc(next);
    selection = null;
    activeMarkIndex = -1;
    history.length = 0;
    future.length = 0;
    syncForm();
    renderAll();
    scheduleSave();
  }

  function bindChrome() {
    const bindMeta = (el, key) => {
      el.addEventListener("input", () => {
        doc[key] = el.value;
        renderJson();
        scheduleSave();
      });
    };
    bindMeta(els.title, "title");
    bindMeta(els.id, "id");
    bindMeta(els.arabic, "arabic");

    $("btnAccent").addEventListener("click", toggleAccent);
    $("btnHidden").addEventListener("click", toggleHidden);
    $("btnClearSel").addEventListener("click", clearSelectionMarks);
    $("btnUndo").addEventListener("click", undo);
    $("btnRedo").addEventListener("click", redo);
    $("btnHelp").addEventListener("click", () => els.helpDialog.showModal());
    $("btnCloseHelp").addEventListener("click", () => els.helpDialog.close());
    $("btnLoadSample").addEventListener("click", () => {
      if (doc.marks.length && !confirm("Загрузить эталон? Текущий черновик будет заменён.")) return;
      loadDoc(SAMPLE);
    });
    $("btnNew").addEventListener("click", () => {
      if (doc.transliteration && !confirm("Создать пустой документ?")) return;
      loadDoc(emptyDoc());
    });
    $("btnExport").addEventListener("click", downloadJson);
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
      pushHistory();
      doc.transliteration = els.plainText.value;
      doc.marks = doc.marks
        .map((m) => clampMark(m, doc.transliteration.length))
        .filter(Boolean);
      selection = null;
      renderAll();
    });
    els.fileInput.addEventListener("change", async () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      els.fileInput.value = "";
      if (!file) return;
      try {
        loadDoc(JSON.parse(await file.text()));
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
    // Bridge HTML class names that differ slightly from CSS aliases.
    const map = [
      [".paper-panel", "paper-panel"],
      [".markup-canvas", "markup-canvas"],
      [".paper-hint", "paper-hint"],
      [".side-panels", "side-panels"],
      [".side-card", "side-card"],
      [".side-head", "side-head"],
      [".marks-list", "marks-list"],
      [".json-preview", "json-preview"],
      [".sel-pill", "sel-pill"],
      [".toolbar-label", "toolbar-label"],
      [".rule-strip", "rule-strip"],
      [".toolbar-sep", "toolbar-sep"],
    ];
    // no-op map kept for clarity; classes already match.

    for (const id of Object.values(els)) {
      if (!id) {
        console.error("Tajweed editor: missing DOM node", els);
        return;
      }
    }

    renderRulesUi();
    bindCanvasPointer();
    bindChrome();
    const stored = loadStored();
    if (stored && (stored.transliteration || stored.marks.length)) loadDoc(stored);
    else loadDoc(SAMPLE);
  }

  boot();
})();
