(() => {
  "use strict";

  function isKnownRule(ruleMap, id) {
    if (ruleMap instanceof Set) return ruleMap.has(id);
    if (Array.isArray(ruleMap)) return ruleMap.includes(id);
    return Boolean(ruleMap && Object.prototype.hasOwnProperty.call(ruleMap, id));
  }

  function clampMark(mark, length, ruleMap) {
    if (!mark || typeof mark !== "object") return null;
    const start = Math.max(0, Math.min(Number(mark.start) || 0, length));
    const end = Math.max(0, Math.min(Number(mark.end) || 0, length));
    if (end <= start) return null;
    const sourceRules = Array.isArray(mark.rules) ? mark.rules : mark.rule ? [mark.rule] : [];
    return {
      ...mark,
      start,
      end,
      rules: sourceRules.filter((id) => isKnownRule(ruleMap, id)),
      accent: Boolean(mark.accent),
      hidden: Boolean(mark.hidden),
      note: String(mark.note || ""),
    };
  }

  function normalizeDoc(raw, { version = 2, ruleMap = {} } = {}) {
    const source = raw && typeof raw === "object" ? raw : {};
    const doc = {
      ...source,
      version,
      id: String(source.id || ""),
      title: String(source.title || ""),
      azkarIds: Array.isArray(source.azkarIds) ? source.azkarIds.map(String).filter(Boolean) : [],
      arabic: String(source.arabic || ""),
      transliteration: String(source.transliteration ?? source.text ?? ""),
      marks: [],
    };
    doc.marks = (Array.isArray(source.marks) ? source.marks : [])
      .map((mark) => clampMark(mark, doc.transliteration.length, ruleMap))
      .filter(Boolean);
    return doc;
  }

  window.AdminV2TajweedNormalization = Object.freeze({ clampMark, normalizeDoc });
})();
