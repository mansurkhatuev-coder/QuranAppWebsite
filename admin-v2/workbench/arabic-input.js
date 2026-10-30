(() => {
  "use strict";

  const PREFS_KEY = "unified-arabic-input:v1";
  const LEGACY_FONT_KEY = "arabic-word-desk-font";
  const fontMigration = {
    "KFGQPC Uthmanic": "KFGQPC Uthmanic Fixed",
    "Uthmanic Hafs": "Uthmanic Hafs Fixed",
  };
  const FONT_OPTIONS = [
    { value: "KFGQPC Uthmanic Fixed", label: "KFGQPC Uthmanic" },
    { value: "Uthmanic Hafs Fixed", label: "Uthmanic Hafs" },
    { value: "Amiri Quran", label: "Amiri Quran" },
  ];
  const DEFAULTS = { font: FONT_OPTIONS[0].value, textSize: 104, keySize: 42 };
  const DIACRITIC_RE = /^[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08E7-\u08FF]$/;
  const TANWIN_RE = /[\u064B\u064C\u064D\u08E7\u08E8\u08E9\u08F0\u08F1\u08F2]/;
  const ARABIC_LETTER_RE = /^[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06FA-\u06FC\u0671]$/;
  const LETTERS = ["ا", "أ", "إ", "آ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي", "ى", "ة", "ء", "ؤ", "ئ"];
  const MARKS = ["َ", "ُ", "ِ", "ْ", "ّ", "ً", "ٌ", "ٍ", "ٓ"];
  const COMPOUND_MARKS = ["َّ", "ُّ", "ِّ", "ّْ", "ًّ", "ٌّ", "ٍّ", "َّ", "ُّ", "ِّ"];
  const TANWIN_VARIANTS = ["ࣰ", "ࣱ", "ࣲ", "ࣷ", "ࣸ", "ࣹ"];
  const SPECIAL = ["أ", "إ", "آ", "ؤ", "ئ", "ء", "ة", "،", "؟", "ـ"];
  const GROUPS = [
    { label: "", values: LETTERS, kind: "letter" },
    { label: "همزة الوصل · хамзатуль-васль", values: ["ٱ"], kind: "wasla" },
    { label: "Обычные огласовки и танвин", values: MARKS, kind: "mark" },
    { label: "Составные огласовки", values: COMPOUND_MARKS, kind: "compound" },
    { label: "Танвин со смещённым начертанием", values: TANWIN_VARIANTS, kind: "variant" },
    { label: "Малый мадд-алиф без разрыва букв", values: ["ٰ"], kind: "small-madd" },
    { label: "Малый мим · икляб", values: ["ۢ"], kind: "iqlab-meem" },
    { label: "Хамза без разрыва букв", values: ["ٔ", "ٕ"], kind: "attached-hamza" },
    { label: "Кружок над непроизносимой буквой", values: ["۟"], kind: "silent-zero" },
    { label: "", values: [...SPECIAL, " "], kind: "special" },
  ];

  const instances = new WeakMap();

  function clamp(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
  }

  function readPreferences() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
      const legacyValue = window.localStorage.getItem(LEGACY_FONT_KEY);
      const legacyFont = fontMigration[legacyValue] || legacyValue;
      return {
        font: FONT_OPTIONS.some((option) => option.value === saved.font)
          ? saved.font
          : FONT_OPTIONS.some((option) => option.value === legacyFont) ? legacyFont : DEFAULTS.font,
        textSize: clamp(saved.textSize, 54, 180, DEFAULTS.textSize),
        keySize: clamp(saved.keySize, 38, 92, DEFAULTS.keySize),
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function isMark(char) {
    return Boolean(char && DIACRITIC_RE.test(char));
  }

  function isArabicLetter(char) {
    return Boolean(char && ARABIC_LETTER_RE.test(char));
  }

  function removeDiacritics(text) {
    return [...text].filter((char) => !isMark(char)).join("");
  }

  function normalizeArabicText(text) {
    return String(text ?? "")
      .replace(/\u08AD/g, "ٰ")
      .replace(/۝(?=[٠-٩])/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g, "")
      .replace(/[ \t\r\n]+/g, " ")
      .trim();
  }

  function toArabicIndicDigits(value) {
    return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  }

  function makeButton(doc, text, action, extraClass = "") {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = `ait-button ${extraClass}`.trim();
    button.dataset.action = action;
    button.textContent = text;
    return button;
  }

  function createPanel(doc, preferences) {
    const panel = doc.createElement("section");
    panel.className = "ait-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Арабская клавиатура и оформление текста");
    panel.lang = "ru";

    const header = doc.createElement("div");
    header.className = "ait-header";
    const title = doc.createElement("strong");
    title.textContent = "Арабская клавиатура";
    const close = makeButton(doc, "", "close", "ait-close");
    const closeIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    closeIcon.setAttribute("viewBox", "0 0 24 24");
    closeIcon.setAttribute("aria-hidden", "true");
    const closePath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    closePath.setAttribute("d", "m6 6 12 12M18 6 6 18");
    closeIcon.append(closePath);
    close.replaceChildren(closeIcon);
    close.setAttribute("aria-label", "Закрыть клавиатуру");
    header.append(title, close);

    const activeFieldSlot = doc.createElement("div");
    activeFieldSlot.className = "ait-active-field-slot";
    activeFieldSlot.hidden = true;
    activeFieldSlot.setAttribute("aria-label", "Активное поле арабского текста");

    const settings = doc.createElement("div");
    settings.className = "ait-settings";

    const fontLabel = doc.createElement("label");
    fontLabel.className = "ait-font-control";
    fontLabel.append(doc.createTextNode("Коранический шрифт"));
    const fontSelect = doc.createElement("select");
    fontSelect.className = "ait-font-select";
    fontSelect.setAttribute("aria-label", "Коранический шрифт");
    FONT_OPTIONS.forEach((option) => {
      const item = doc.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      fontSelect.appendChild(item);
    });
    fontSelect.value = preferences.font;
    fontLabel.appendChild(fontSelect);

    const textSizeLabel = doc.createElement("label");
    textSizeLabel.className = "ait-range-control";
    const textSizeName = doc.createElement("span");
    textSizeName.textContent = "Размер текста";
    const textSize = doc.createElement("input");
    textSize.type = "range";
    textSize.min = "54";
    textSize.max = "180";
    textSize.value = String(preferences.textSize);
    textSize.setAttribute("aria-label", "Размер текста, от 54 до 180 пикселей");
    const textSizeValue = doc.createElement("output");
    textSizeValue.textContent = `${preferences.textSize} px`;
    textSizeLabel.append(textSizeName, textSize, textSizeValue);

    const keySizeLabel = doc.createElement("label");
    keySizeLabel.className = "ait-range-control";
    const keySizeName = doc.createElement("span");
    keySizeName.textContent = "Размер клавиш";
    const keySize = doc.createElement("input");
    keySize.type = "range";
    keySize.min = "38";
    keySize.max = "92";
    keySize.value = String(preferences.keySize);
    keySize.setAttribute("aria-label", "Размер клавиш, от 38 до 92 пикселей");
    const keySizeValue = doc.createElement("output");
    keySizeValue.textContent = `${preferences.keySize} px`;
    keySizeLabel.append(keySizeName, keySize, keySizeValue);
    settings.append(fontLabel, textSizeLabel, keySizeLabel);

    const ayahRow = doc.createElement("div");
    ayahRow.className = "ait-ayah-row";
    const ayahLabel = doc.createElement("label");
    ayahLabel.textContent = "Номер аята";
    const ayahInput = doc.createElement("input");
    ayahInput.type = "number";
    ayahInput.min = "1";
    ayahInput.max = "9999";
    ayahInput.value = "1";
    ayahInput.inputMode = "numeric";
    ayahInput.className = "ait-ayah-number";
    ayahInput.setAttribute("aria-label", "Номер аята");
    ayahLabel.appendChild(ayahInput);
    const ayahButton = makeButton(doc, "١", "ayah", "ait-ayah-insert");
    ayahButton.title = "Вставить или заменить номер аята арабскими цифрами. Шрифт сам рисует номер в кораническом орнаменте.";
    const ayahNote = doc.createElement("small");
    ayahNote.className = "ait-ayah-note";
    ayahNote.textContent = "Шрифт сам рисует номер в кораническом орнаменте";
    ayahRow.append(ayahLabel, ayahButton);
    const removeButton = makeButton(doc, "Удалить огласовку", "remove-mark", "ait-remove-mark");
    removeButton.title = "Удаляет только арабские диакритические знаки, сохраняя буквы";
    ayahRow.appendChild(removeButton);

    const keyboard = doc.createElement("div");
    keyboard.className = "ait-keyboard";
    GROUPS.forEach((group) => {
      const groupWrap = doc.createElement("div");
      groupWrap.className = `ait-key-group ait-group-${group.kind}`;
      if (group.label) {
        const label = doc.createElement("div");
        label.className = "ait-group-label";
        label.textContent = group.label;
        groupWrap.appendChild(label);
      }
      const row = doc.createElement("div");
      row.className = "ait-key-row";
      group.values.forEach((value) => {
        const display = group.kind === "small-madd" ? "اٰ"
          : group.kind === "attached-hamza" ? `ـ${value}`
            : group.kind === "silent-zero" ? `ا${value}`
              : value === " " ? "Пробел" : value;
        const button = makeButton(doc, display, "key", `ait-key ait-key-${group.kind}`);
        button.dataset.value = value;
        button.dataset.kind = group.kind;
        button.lang = group.kind === "special" && value === " " ? "ru" : "ar";
        button.dir = "rtl";
        button.title = keyTitle(group.kind, value);
        row.appendChild(button);
      });
      groupWrap.appendChild(row);
      keyboard.appendChild(groupWrap);
    });

    panel.append(header, activeFieldSlot, settings, ayahRow, ayahNote, keyboard);
    return { panel, activeFieldSlot, fontSelect, textSize, textSizeValue, keySize, keySizeValue, ayahInput, ayahButton };
  }

  function keyTitle(kind, value) {
    if (kind === "variant") return "Коранический вариант танвина";
    if (kind === "compound") return "Составной знак: шадда и огласовка";
    if (kind === "small-madd") return "U+0670. Малый мадд-алиф прикрепляется к предыдущей букве.";
    if (kind === "iqlab-meem") return "U+06E2. Малый верхний мим прикрепляется к предыдущей букве.";
    if (kind === "attached-hamza") return `U+${value === "ٔ" ? "0654" : "0655"}. Комбинируемая хамза прикрепляется к предыдущей букве.`;
    if (kind === "silent-zero") return "U+06DF. Малый верхний ноль прикрепляется к предыдущей букве.";
    if (kind === "wasla") return "U+0671. Хамзатуль-васль заменяет ближайший обычный алиф.";
    return "";
  }

  function mount(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 9)) {
      throw new TypeError("ArabicInputTools.mount(root) expects an Element or Document.");
    }
    const existing = instances.get(root);
    if (existing) return existing;

    const doc = root.nodeType === 9 ? root : root.ownerDocument;
    const host = root.nodeType === 9 ? root.body : root;
    if (!doc || !host) throw new TypeError("ArabicInputTools.mount(root) needs a document body.");

    const preferences = readPreferences();
    const fields = new Map();
    const panelParts = createPanel(doc, preferences);
    const { panel } = panelParts;
    host.appendChild(panel);
    let target = null;
    let panelOpen = false;
    let destroyed = false;
    let dockedField = null;
    let mobileKeyboardMode = false;

    function isSmallScreen() {
      return Boolean(doc.defaultView.matchMedia?.("(max-width: 620px)").matches);
    }

    function setMobileKeyboardMode(open) {
      const next = Boolean(open && isSmallScreen());
      if (mobileKeyboardMode === next) return;
      mobileKeyboardMode = next;
      doc.documentElement.classList.toggle("ait-mobile-keyboard-open", next);
      const detail = { open: next, mobile: true };
      window.dispatchEvent(new CustomEvent("admin-v2:keyboard-mode", { detail }));
      if (window.parent !== window) {
        window.parent.postMessage({ type: "admin-v2:keyboard-mode", ...detail }, window.location.origin);
      }
    }

    function restoreDockedField() {
      if (!dockedField) return;
      const { group, marker } = dockedField;
      if (marker.parentNode) {
        marker.parentNode.insertBefore(group, marker);
        marker.remove();
      } else if (group.parentNode === panelParts.activeFieldSlot) {
        group.remove();
      }
      dockedField = null;
      panelParts.activeFieldSlot.hidden = true;
    }

    function dockField(field) {
      restoreDockedField();
      const group = field.closest("label") || field;
      const parent = group.parentNode;
      if (!parent) return;
      const marker = doc.createComment("Arabic keyboard field position");
      parent.insertBefore(marker, group);
      panelParts.activeFieldSlot.hidden = false;
      panelParts.activeFieldSlot.appendChild(group);
      dockedField = { group, marker };
    }

    function savePreferences() {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
      } catch {
        // Storage can be blocked in private browsing; the controls still work for this mount.
      }
    }

    function applyPreferences(field) {
      field.style.setProperty("--ait-font-family", `"${preferences.font}"`);
      const sizeScale = Number(field.dataset.aitSizeScale) || 1;
      field.style.setProperty("--ait-text-size", `${Math.round(preferences.textSize * sizeScale)}px`);
      field.style.setProperty("--ait-key-size", `${preferences.keySize}px`);
    }

    function applyPanelPreferences() {
      panel.style.setProperty("--ait-font-family", `"${preferences.font}"`);
      panel.style.setProperty("--ait-text-size", `${preferences.textSize}px`);
      panel.style.setProperty("--ait-key-size", `${preferences.keySize}px`);
    }

    function setExpanded(field, value) {
      const record = fields.get(field);
      if (record) record.trigger.setAttribute("aria-expanded", String(value));
    }

    function updateTriggers() {
      fields.forEach((record, field) => setExpanded(field, panelOpen && field === target));
    }

    function liveSelection(field) {
      try {
        return { start: field.selectionStart, end: field.selectionEnd, direction: field.selectionDirection || "none" };
      } catch {
        return { start: 0, end: 0, direction: "none" };
      }
    }

    function selectionFor(field) {
      if (doc.activeElement === field) {
        const current = liveSelection(field);
        fields.get(field).bookmark = current;
        return current;
      }
      const record = fields.get(field);
      return record?.bookmark || liveSelection(field);
    }

    function focusField(field, bookmark) {
      if (!field || !field.isConnected) return;
      const x = doc.defaultView.scrollX;
      const y = doc.defaultView.scrollY;
      try {
        field.focus({ preventScroll: true });
      } catch {
        field.focus();
      }
      const start = clamp(bookmark?.start, 0, field.value.length, field.value.length);
      const end = clamp(bookmark?.end, start, field.value.length, start);
      try {
        field.setSelectionRange(start, end, bookmark?.direction || "none");
      } catch {
        // A replaced or detached field may not allow selection changes.
      }
      const record = fields.get(field);
      if (record) record.bookmark = { start, end, direction: bookmark?.direction || "none" };
      doc.defaultView.requestAnimationFrame(() => doc.defaultView.scrollTo(x, y));
    }

    function dispatchInput(field, value) {
      const InputEventCtor = doc.defaultView.InputEvent;
      let event;
      try {
        event = new InputEventCtor("input", { bubbles: true, inputType: "insertText", data: value });
      } catch {
        event = new doc.defaultView.Event("input", { bubbles: true });
      }
      field.dispatchEvent(event);
    }

    function replace(field, start, end, value) {
      const oldValue = field.value.slice(start, end);
      if (oldValue === value) {
        focusField(field, { start: end, end, direction: "none" });
        return;
      }
      field.setRangeText(value, start, end, "end");
      const caret = start + value.length;
      focusField(field, { start: caret, end: caret, direction: "none" });
      dispatchInput(field, value);
    }

    function getPreviousArabicCluster(text, caret) {
      let base = Math.min(caret, text.length) - 1;
      while (base >= 0 && isMark(text[base])) base -= 1;
      if (base < 0 || !isArabicLetter(text[base])) return null;
      let marksEnd = base + 1;
      while (marksEnd < text.length && isMark(text[marksEnd])) marksEnd += 1;
      return { base, marksStart: base + 1, marksEnd };
    }

    function insertText(value) {
      if (!target) return;
      const { start, end } = selectionFor(target);
      const text = target.value;
      if (TANWIN_RE.test(value) && start === end) {
        const cluster = getPreviousArabicCluster(text, start);
        if (cluster) {
          const oldMarks = text.slice(cluster.marksStart, cluster.marksEnd);
          const keptMarks = [...oldMarks].filter((char) => !TANWIN_RE.test(char)).join("");
          replace(target, cluster.base, cluster.marksEnd, text[cluster.base] + keptMarks + value);
          return;
        }
      }
      replace(target, start, end, value);
    }

    function insertAttachedMark(value) {
      if (!target) return;
      const { start } = selectionFor(target);
      const text = target.value;
      let caret = start;
      while (caret > 0 && isMark(text[caret - 1])) caret -= 1;
      let base = caret - 1;
      while (base >= 0 && isMark(text[base])) base -= 1;
      if (base < 0 || /\s/.test(text[base])) {
        insertText(value);
        return;
      }
      let insertAt = base + 1;
      while (insertAt < text.length && isMark(text[insertAt])) insertAt += 1;
      if (text.slice(base + 1, insertAt).includes(value)) {
        focusField(target, { start: insertAt, end: insertAt, direction: "none" });
        return;
      }
      replace(target, insertAt, insertAt, value);
    }

    function insertWasla() {
      if (!target) return;
      const { start, end } = selectionFor(target);
      const text = target.value;
      if (text.slice(start, end) === "ا") {
        replace(target, start, end, "ٱ");
      } else if (start > 0 && text[start - 1] === "ا") {
        replace(target, start - 1, start, "ٱ");
      } else if (start < text.length && text[start] === "ا") {
        replace(target, start, start + 1, "ٱ");
      } else {
        replace(target, start, end, "ٱ");
      }
    }

    function ayahRangeAtCaret(text, caret) {
      const left = text.slice(0, caret).match(/[٠-٩]+$/)?.[0] || "";
      const right = text.slice(caret).match(/^[٠-٩]+/)?.[0] || "";
      return left || right ? { start: caret - left.length, end: caret + right.length } : null;
    }

    function insertAyah() {
      if (!target) return;
      const { start, end } = selectionFor(target);
      const parsed = Number(panelParts.ayahInput.value);
      const number = toArabicIndicDigits(Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 9999) : 1);
      const nearby = ayahRangeAtCaret(target.value, start) || ayahRangeAtCaret(target.value, end);
      replace(target, nearby?.start ?? start, nearby?.end ?? end, number);
    }

    function removeMark() {
      if (!target) return;
      const { start, end } = selectionFor(target);
      const text = target.value;
      const ayahRange = start === end ? ayahRangeAtCaret(text, start) : null;
      if (ayahRange) {
        replace(target, ayahRange.start, ayahRange.end, "");
      } else if (start !== end) {
        replace(target, start, end, removeDiacritics(text.slice(start, end)));
      } else {
        let clusterStart = start;
        while (clusterStart > 0 && isMark(text[clusterStart - 1])) clusterStart -= 1;
        const marks = [...text.slice(clusterStart, start)];
        if (marks.length) replace(target, clusterStart, start, marks.slice(0, -1).join(""));
        else focusField(target, { start, end, direction: "none" });
      }
    }

    function openFor(field) {
      if (!field || !fields.has(field)) return;
      target = field;
      const mobile = isSmallScreen();
      if (mobile) dockField(field);
      else restoreDockedField();
      panelOpen = true;
      panel.hidden = false;
      setMobileKeyboardMode(mobile);
      updateTriggers();
      focusField(field, selectionFor(field));
    }

    function closePanel() {
      panelOpen = false;
      panel.hidden = true;
      restoreDockedField();
      setMobileKeyboardMode(false);
      updateTriggers();
    }

    function handleViewportResize() {
      if (panelOpen && target && isSmallScreen() !== mobileKeyboardMode) openFor(target);
    }

    function isEditableArabicField(field) {
      return field.matches('textarea[dir="rtl"][lang="ar"]') && !field.readOnly && !field.disabled;
    }

    function restoreStyle(field, property, original) {
      if (original.value) field.style.setProperty(property, original.value, original.priority);
      else field.style.removeProperty(property);
    }

    function detachField(field) {
      const record = fields.get(field);
      if (!record) return;
      field.removeEventListener("focus", record.onFocus);
      field.removeEventListener("select", record.onSelection);
      field.removeEventListener("keyup", record.onSelection);
      field.removeEventListener("click", record.onSelection);
      field.removeEventListener("input", record.onSelection);
      field.removeEventListener("blur", record.onSelection);
      record.trigger.removeEventListener("pointerdown", record.onTriggerPointerDown);
      record.trigger.removeEventListener("click", record.onTriggerClick);
      record.tools.remove();
      if (!record.hadClass) field.classList.remove("ait-managed-field");
      restoreStyle(field, "--ait-font-family", record.originalFont);
      restoreStyle(field, "--ait-text-size", record.originalTextSize);
      restoreStyle(field, "--ait-key-size", record.originalKeySize);
      fields.delete(field);
      if (target === field) {
        target = null;
        closePanel();
      }
    }

    function attachField(field) {
      const current = fields.get(field);
      if (!isEditableArabicField(field)) {
        if (current) detachField(field);
        return;
      }
      if (current) {
        if (field.nextElementSibling !== current.tools) field.after(current.tools);
        applyPreferences(field);
        return;
      }

      const tools = doc.createElement("div");
      tools.className = "ait-field-tools";
      const trigger = makeButton(doc, "أ ب  ⌨", "open", "ait-trigger");
      trigger.setAttribute("aria-label", "Открыть арабскую клавиатуру для этого поля");
      trigger.setAttribute("aria-expanded", "false");
      tools.appendChild(trigger);
      const record = {
        tools,
        trigger,
        bookmark: liveSelection(field),
        hadClass: field.classList.contains("ait-managed-field"),
        originalFont: { value: field.style.getPropertyValue("--ait-font-family"), priority: field.style.getPropertyPriority("--ait-font-family") },
        originalTextSize: { value: field.style.getPropertyValue("--ait-text-size"), priority: field.style.getPropertyPriority("--ait-text-size") },
        originalKeySize: { value: field.style.getPropertyValue("--ait-key-size"), priority: field.style.getPropertyPriority("--ait-key-size") },
      };
      record.onFocus = () => {
        target = field;
        record.bookmark = liveSelection(field);
        if (panelOpen) updateTriggers();
        else openFor(field);
      };
      record.onSelection = () => { record.bookmark = liveSelection(field); };
      record.onTriggerPointerDown = (event) => event.preventDefault();
      record.onTriggerClick = () => openFor(field);
      field.addEventListener("focus", record.onFocus);
      field.addEventListener("select", record.onSelection);
      field.addEventListener("keyup", record.onSelection);
      field.addEventListener("click", record.onSelection);
      field.addEventListener("input", record.onSelection);
      field.addEventListener("blur", record.onSelection);
      trigger.addEventListener("pointerdown", record.onTriggerPointerDown);
      trigger.addEventListener("click", record.onTriggerClick);
      fields.set(field, record);
      field.classList.add("ait-managed-field");
      applyPreferences(field);
      field.after(tools);
    }

    function allFields() {
      const selector = 'textarea[dir="rtl"][lang="ar"]';
      const found = [...root.querySelectorAll(selector)];
      if (root.nodeType === 1 && root.matches(selector)) found.unshift(root);
      return found;
    }

    function syncFields() {
      if (destroyed) return;
      const found = allFields();
      const foundSet = new Set(found);
      fields.forEach((_record, field) => {
        if (!foundSet.has(field) || !isEditableArabicField(field)) detachField(field);
      });
      found.forEach(attachField);
    }

    function handlePanelClick(event) {
      const button = event.target.closest("button[data-action]");
      if (!button || !panel.contains(button)) return;
      event.preventDefault();
      const action = button.dataset.action;
      if (action === "close") closePanel();
      else if (action === "ayah") insertAyah();
      else if (action === "remove-mark") removeMark();
      else if (action === "key") {
        if (button.dataset.kind === "wasla") insertWasla();
        else if (["small-madd", "iqlab-meem", "attached-hamza", "silent-zero"].includes(button.dataset.kind)) insertAttachedMark(button.dataset.value);
        else insertText(button.dataset.value);
      }
    }

    function handlePanelPointerDown(event) {
      const button = event.target.closest("button[data-action]");
      if (button && button.dataset.action !== "close") event.preventDefault();
    }

    function updateAyahPreview() {
      const parsed = Number(panelParts.ayahInput.value);
      const number = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 9999) : 1;
      panelParts.ayahButton.textContent = toArabicIndicDigits(number);
    }

    panel.addEventListener("pointerdown", handlePanelPointerDown);
    panel.addEventListener("click", handlePanelClick);
    panelParts.ayahInput.addEventListener("input", updateAyahPreview);
    applyPanelPreferences();
    panelParts.fontSelect.addEventListener("change", () => {
      preferences.font = panelParts.fontSelect.value;
      applyPanelPreferences();
      fields.forEach((_record, field) => applyPreferences(field));
      savePreferences();
    });
    panelParts.textSize.addEventListener("input", () => {
      preferences.textSize = clamp(panelParts.textSize.value, 54, 180, DEFAULTS.textSize);
      panelParts.textSizeValue.textContent = `${preferences.textSize} px`;
      applyPanelPreferences();
      fields.forEach((_record, field) => applyPreferences(field));
      savePreferences();
    });
    panelParts.keySize.addEventListener("input", () => {
      preferences.keySize = clamp(panelParts.keySize.value, 38, 92, DEFAULTS.keySize);
      panelParts.keySizeValue.textContent = `${preferences.keySize} px`;
      applyPanelPreferences();
      fields.forEach((_record, field) => applyPreferences(field));
      savePreferences();
    });

    doc.defaultView.addEventListener("resize", handleViewportResize);
    function handleEscape(event) {
      if (event.key === "Escape" && panelOpen) closePanel();
    }
    host.addEventListener("keydown", handleEscape);

    syncFields();
    const observer = new doc.defaultView.MutationObserver(syncFields);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["dir", "lang", "readonly", "disabled"] });

    const instance = {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        observer.disconnect();
        doc.defaultView.removeEventListener("resize", handleViewportResize);
        host.removeEventListener("keydown", handleEscape);
        [...fields.keys()].forEach(detachField);
        panel.remove();
        instances.delete(root);
      },
    };
    instances.set(root, instance);
    return instance;
  }

  window.ArabicInputTools = Object.freeze({ mount, normalizeArabicText });
})();
