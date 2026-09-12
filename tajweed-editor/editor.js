(() => {
  "use strict";

  const STORAGE_KEY = "tajweed-azkar-editor:v1";
  const SCHEMA_VERSION = 1;

  const RULES = [
    { id: "madd2", label: "Мадд 2", hint: "2 счёта", color: "#b27a4a", key: "1" },
    { id: "madd2_4_6", label: "Мадд 2–4–6", hint: "переменный", color: "#e27b24", key: "2" },
    { id: "madd4_5", label: "Мадд 4–5", hint: "4–5 счётов", color: "#c63b43", key: "3" },
    { id: "madd6", label: "Мадд 6", hint: "6 счётов", color: "#8b1e2d", key: "4" },
    { id: "ghunna", label: "Гунна", hint: "носовой", color: "#3f9a55", key: "5" },
    { id: "qalqala", label: "Калькаля", hint: "отскок", color: "#4fb6d3", key: "6" },
    { id: "tafkheem", label: "Тафхим", hint: "твёрдые + ر", color: "#173f73", key: "7" },
    { id: "silent", label: "Слияние", hint: "серый / не чит.", color: "#8f959b", key: "8" },
  ];

  const RULE_MAP = Object.fromEntries(RULES.map((r) => [r.id, r]));
  const COLOR_PRIORITY = [
    "madd6",
    "madd4_5",
    "madd2_4_6",
    "madd2",
    "ghunna",
    "qalqala",
    "tafkheem",
    "silent",
  ];

  const SAMPLE = {
    version: SCHEMA_VERSION,
    id: "azkar-ikhlaas-test",
    title: "Аль‑Ихляс (тест для азкара)",
    arabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\nقُلْ هُوَ ٱللَّهُ أَحَدٌ ۝ ٱللَّهُ ٱلصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ",
    transliteration:
      "Бисмилльах1иррохьманиррохьим.\nКъуль х1уваЛлох1у ахьад\nАллох1уссомад\nлам йалид валам йулад\nвалам йакуллах1у куфуван ахьад.",
    marks: [
      // Starter marks only — not final verified tajweed. Edit freely.
      { start: 30, end: 32, rules: ["qalqala"], accent: false, hidden: false, note: "Къ — калькаля" },
      { start: 41, end: 43, rules: ["tafkheem"], accent: false, hidden: false, note: "Лл — тафхим" },
      { start: 52, end: 53, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
      { start: 54, end: 60, rules: ["tafkheem"], accent: false, hidden: true, note: "Аллох1 — тафхим + скрытый сад" },
      { start: 66, end: 67, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
      { start: 76, end: 77, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
      { start: 88, end: 89, rules: ["qalqala"], accent: false, hidden: false, note: "д — калькаля" },
    ],
  };

  const els = {
    title: document.getElementById("docTitle"),
    id: document.getElementById("docId"),
    arabic: document.getElementById("docArabic"),
    canvas: document.getElementById("markupCanvas"),
    ruleGrid: document.getElementById("ruleGrid"),
    legendList: document.getElementById("legendList"),
    selMeta: document.getElementById("selMeta"),
    marksList: document.getElementById("marksList"),
    markCount: document.getElementById("markCount"),
    jsonPreview: document.getElementById("jsonPreview"),
    saveStatus: document.getElementById("saveStatus"),
    plainDialog: document.getElementById("plainDialog"),
    plainText: document.getElementById("plainText"),
    helpDialog: document.getElementById("helpDialog"),
    fileInput: document.getElementById("fileInput"),
    btnAccent: document.getElementById("btnAccent"),
    btnHidden: document.getElementById("btnHidden"),
  };

  /** @type {{version:number,id:string,title:string,arabic:string,transliteration:string,marks:Array}} */
  let doc = emptyDoc();
  let selection = null; // {start,end} half-open
  let activeMarkIndex = -1;
  let drag = null;
  const history = [];
  const future = [];
  let saveTimer = null;
  let suppressHistory = false;

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeDoc(raw) {
    const base = emptyDoc();
    const src = raw && typeof raw === "object" ? raw : {};
    base.version = SCHEMA_VERSION;
    base.id = String(src.id || "");
    base.title = String(src.title || "");
    base.arabic = String(src.arabic || "");
    base.transliteration = String(src.transliteration || src.text || "");
    const marks = Array.isArray(src.marks) ? src.marks : [];
    base.marks = marks
      .map((m) => ({
        start: Math.max(0, Number(m.start) || 0),
        end: Math.max(0, Number(m.end) || 0),
        rules: Array.isArray(m.rules)
          ? m.rules.filter((id) => RULE_MAP[id])
          : m.rule && RULE_MAP[m.rule]
            ? [m.rule]
            : [],
        accent: Boolean(m.accent),
        hidden: Boolean(m.hidden),
        note: String(m.note || ""),
      }))
      .filter((m) => m.end > m.start)
      .map((m) => clampMark(m, base.transliteration.length))
      .filter(Boolean);
    return base;
  }

  function clampMark(mark, len) {
    const start = Math.max(0, Math.min(mark.start, len));
    const end = Math.max(0, Math.min(mark.end, len));
    if (end <= start) return null;
    return { ...mark, start, end };
  }

  function pushHistory() {
    if (suppressHistory) return;
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
    els.saveStatus.classList.remove("saved");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
        els.saveStatus.textContent = "Черновик сохранён в браузере";
        els.saveStatus.classList.add("saved");
      } catch {
        els.saveStatus.textContent = "Не удалось сохранить локально";
      }
    }, 250);
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeDoc(JSON.parse(raw));
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

  function marksCovering(index) {
    return doc.marks.filter((m) => index >= m.start && index < m.end);
  }

  function primaryRule(ruleIds) {
    for (const id of COLOR_PRIORITY) {
      if (ruleIds.includes(id)) return id;
    }
    return null;
  }

  function secondaryRule(ruleIds, primary) {
    const rest = ruleIds.filter((id) => id !== primary);
    return rest[0] || null;
  }

  function ensureSelection() {
    if (!selection || selection.end <= selection.start) {
      flashStatus("Сначала выдели фрагмент");
      return false;
    }
    return true;
  }

  function flashStatus(text) {
    els.selMeta.textContent = text;
  }

  function setSelection(start, end) {
    if (start == null || end == null || end <= start) {
      selection = null;
    } else {
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
    return doc.marks.filter(
      (m) => m.start < selection.end && m.end > selection.start
    );
  }

  function updateLayerButtons() {
    if (!selection) {
      els.btnAccent.classList.remove("active");
      els.btnHidden.classList.remove("active");
      return;
    }
    const overlapping = selectionMarks();
    const accentOn = overlapping.some((m) => m.accent);
    const hiddenOn = overlapping.some((m) => m.hidden);
    els.btnAccent.classList.toggle("active", accentOn);
    els.btnHidden.classList.toggle("active", hiddenOn);

    for (const btn of els.ruleGrid.querySelectorAll(".rule-btn")) {
      const id = btn.dataset.rule;
      const on = overlapping.some((m) => m.rules.includes(id));
      btn.classList.toggle("active", on);
    }
  }

  function upsertMarkForSelection(mutate) {
    if (!ensureSelection()) return;
    pushHistory();
    const { start, end } = selection;
    // Prefer exact-range mark; else create one for the selection.
    let mark = doc.marks.find((m) => m.start === start && m.end === end);
    if (!mark) {
      mark = { start, end, rules: [], accent: false, hidden: false, note: "" };
      doc.marks.push(mark);
    }
    mutate(mark);
    // Drop empty marks
    doc.marks = doc.marks.filter(
      (m) => m.rules.length > 0 || m.accent || m.hidden || m.note
    );
    renderAll();
  }

  function toggleRule(ruleId) {
    upsertMarkForSelection((mark) => {
      if (mark.rules.includes(ruleId)) {
        mark.rules = mark.rules.filter((id) => id !== ruleId);
      } else {
        mark.rules = [...mark.rules, ruleId];
      }
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

  function renderRulesUi() {
    els.ruleGrid.innerHTML = "";
    for (const rule of RULES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rule-btn";
      btn.dataset.rule = rule.id;
      btn.title = `Клавиша ${rule.key}`;
      btn.innerHTML = `<span class="swatch" style="background:${rule.color}"></span><span><strong>${rule.label}</strong><small>${rule.hint} · ${rule.key}</small></span>`;
      btn.addEventListener("click", () => toggleRule(rule.id));
      els.ruleGrid.appendChild(btn);
    }

    els.legendList.innerHTML = RULES.map(
      (r) =>
        `<li><span class="swatch" style="background:${r.color}"></span><span>${r.label} — ${r.hint}</span></li>`
    ).join("");
    els.legendList.innerHTML +=
      `<li><span class="swatch" style="background:transparent;box-shadow:inset 0 2px 0 #1d241f"></span><span>Черта сверху — ударение</span></li>` +
      `<li><span class="swatch" style="background:transparent;outline:1px dashed #666"></span><span>Пунктир — скрытый элемент</span></li>`;
  }

  function renderCanvas() {
    const text = doc.transliteration;
    const frag = document.createDocumentFragment();

    if (!text) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Нет текста. Нажми «Эталон Ихляс» или «Правка текста».";
      els.canvas.replaceChildren(empty);
      return;
    }

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const span = document.createElement("span");
      span.className = "ch";
      span.dataset.i = String(i);

      if (ch === "\n") {
        span.classList.add("nl");
        span.textContent = "";
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

      if (selection && i >= selection.start && i < selection.end) {
        span.classList.add("selected");
      }

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
      els.marksList.innerHTML = `<div class="empty">Меток пока нет — выдели текст и назначь правило.</div>`;
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
      drag = { anchor: i, live: i };
      setSelection(i, i + 1);
      e.preventDefault();
    });

    els.canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const i = indexFromEventTarget(e.target);
      if (i == null) return;
      drag.live = i;
      const start = Math.min(drag.anchor, drag.live);
      const end = Math.max(drag.anchor, drag.live) + 1;
      setSelection(start, end);
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
    const name = (doc.id || "azkar-tajweed").replace(/[^\w.-]+/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportObject(), null, 2));
      flashStatus("JSON скопирован");
    } catch {
      flashStatus("Не удалось скопировать — используй экспорт");
    }
  }

  function loadDoc(next, { resetHistory = true } = {}) {
    doc = normalizeDoc(next);
    selection = null;
    activeMarkIndex = -1;
    if (resetHistory) {
      history.length = 0;
      future.length = 0;
    }
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

    document.getElementById("btnAccent").addEventListener("click", toggleAccent);
    document.getElementById("btnHidden").addEventListener("click", toggleHidden);
    document.getElementById("btnClearSel").addEventListener("click", clearSelectionMarks);
    document.getElementById("btnUndo").addEventListener("click", undo);
    document.getElementById("btnRedo").addEventListener("click", redo);
    document.getElementById("btnHelp").addEventListener("click", () => els.helpDialog.showModal());
    document.getElementById("btnCloseHelp").addEventListener("click", () => els.helpDialog.close());
    document.getElementById("btnLoadSample").addEventListener("click", () => {
      if (doc.marks.length && !confirm("Загрузить эталон? Текущий черновик в редакторе будет заменён (локальный автосейв перезапишется).")) {
        return;
      }
      loadDoc(SAMPLE);
    });
    document.getElementById("btnNew").addEventListener("click", () => {
      if (doc.transliteration && !confirm("Создать пустой документ?")) return;
      loadDoc(emptyDoc());
    });
    document.getElementById("btnExport").addEventListener("click", downloadJson);
    document.getElementById("btnCopyJson").addEventListener("click", copyJson);
    document.getElementById("btnImport").addEventListener("click", () => els.fileInput.click());
    document.getElementById("btnSelectAll").addEventListener("click", () => {
      if (!doc.transliteration) return;
      setSelection(0, doc.transliteration.length);
    });
    document.getElementById("btnSortMarks").addEventListener("click", () => {
      pushHistory();
      doc.marks.sort((a, b) => a.start - b.start || a.end - b.end);
      renderAll();
    });

    document.getElementById("btnEditPlain").addEventListener("click", () => {
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
        const text = await file.text();
        loadDoc(JSON.parse(text));
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
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection) {
          e.preventDefault();
          clearSelectionMarks();
        }
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
    renderRulesUi();
    bindCanvasPointer();
    bindChrome();

    const stored = loadStored();
    if (stored && (stored.transliteration || stored.marks.length)) {
      loadDoc(stored);
    } else {
      loadDoc(SAMPLE);
    }
  }

  boot();
})();
