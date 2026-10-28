/**
 * Conservative tajweed mark suggestions for Chechen-style transliteration.
 * Orthography-only (no “paint every а/и” phrase transfer).
 * Shared by editor + scripts/suggest_azkar_tajweed_marks.js
 */
(function initTajweedSuggest(root) {
  'use strict';

  const VALID_RULES = new Set([
    'madd2',
    'madd246',
    'madd45',
    'madd6',
    'ghunna',
    'qalqala',
    'tafkheem',
    'silent',
    'interdental',
  ]);

  /** Precomposed vowels with acute (common in azkar packs). */
  const ACUTE_VOWELS = new Map([
    ['á', 'а'],
    ['Á', 'А'],
    ['é', 'е'],
    ['É', 'Е'],
    ['í', 'и'],
    ['Í', 'И'],
    ['ó', 'о'],
    ['Ó', 'О'],
    ['ú', 'у'],
    ['Ú', 'У'],
    ['ý', 'ы'],
    ['Ý', 'Ы'],
    ['é', 'е'],
  ]);

  function clampMark(mark, len) {
    const start = Math.max(0, Math.min(Number(mark.start) || 0, len));
    const end = Math.max(0, Math.min(Number(mark.end) || 0, len));
    if (end <= start) return null;
    const rules = (Array.isArray(mark.rules) ? mark.rules : [])
      .filter((id) => VALID_RULES.has(id))
      .filter((id, i, all) => all.indexOf(id) === i);
    return {
      start,
      end,
      rules,
      accent: Boolean(mark.accent),
      hidden: Boolean(mark.hidden),
      note: String(mark.note || ''),
    };
  }

  function markKey(m) {
    return `${m.start}:${m.end}:${m.rules.join(',')}:${m.accent ? 1 : 0}:${m.hidden ? 1 : 0}`;
  }

  function push(marks, start, end, rules, accent) {
    if (end <= start) return;
    marks.push({
      start,
      end,
      rules: rules.slice(),
      accent: Boolean(accent),
      hidden: false,
      note: '',
    });
  }

  function collapseAdjacent(marks) {
    if (!marks.length) return marks;
    const sorted = marks.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [];
    for (const m of sorted) {
      const prev = out[out.length - 1];
      const same =
        prev &&
        prev.rules.join(',') === m.rules.join(',') &&
        prev.accent === m.accent &&
        prev.hidden === m.hidden &&
        prev.end >= m.start;
      if (same) {
        prev.end = Math.max(prev.end, m.end);
        continue;
      }
      out.push({ ...m, rules: m.rules.slice() });
    }
    return out;
  }

  function dedupe(marks) {
    const seen = new Set();
    return marks.filter((m) => {
      const k = markKey(m);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Safe orthography suggestions only:
   * - acute / combining acute → madd2 + accent
   * - macron-below / ҙ → interdental
   * - х1/хI, г1, т1 → tafkheem
   * - рр → tafkheem; нн/мм/вв → ghunna
   * - къ word-final after vowel → qalqala, else tafkheem
   * - аIузу / аlузу style з before у → interdental
   */
  function applyHeuristics(text) {
    const marks = [];
    const n = text.length;

    for (let i = 0; i < n; i += 1) {
      const ch = text[i];

      // Precomposed á ó í …
      if (ACUTE_VOWELS.has(ch)) {
        push(marks, i, i + 1, ['madd2'], true);
        continue;
      }

      // Combining acute on previous letter
      if (ch === '\u0301' || ch === '\u00B4' || ch === '´') {
        if (i > 0) push(marks, i - 1, i, ['madd2'], true);
        continue;
      }

      // Combining macron below → interdental on previous
      if (ch === '\u0331') {
        if (i > 0) push(marks, i - 1, i, ['interdental'], false);
        continue;
      }
    }

    // Digraphs (case-insensitive where useful)
    const digraphs = [
      // х1 / хI / хl (латинская L часто вместо единицы)
      { re: /х[1IІlL]/g, rules: ['tafkheem'], accent: false },
      { re: /Х[1IІlL]/g, rules: ['tafkheem'], accent: false },
      { re: /г[1IІlL]/gi, rules: ['tafkheem'], accent: false },
      { re: /т[1IІlL]/gi, rules: ['tafkheem'], accent: false },
      { re: /с̣|с\u0323/gi, rules: ['tafkheem'], accent: false },
      { re: /рр/gi, rules: ['tafkheem'], accent: false },
      { re: /нн/gi, rules: ['ghunna'], accent: false },
      { re: /мм/gi, rules: ['ghunna'], accent: false },
      { re: /вв/gi, rules: ['ghunna'], accent: false },
      { re: /з̱|ҙ/gi, rules: ['interdental'], accent: false },
    ];

    for (const { re, rules, accent } of digraphs) {
      const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
      let m;
      while ((m = rx.exec(text)) !== null) {
        push(marks, m.index, m.index + m[0].length, rules, accent);
        if (!m[0].length) rx.lastIndex += 1;
      }
    }

    // къ: qalqala at word end after vowel; otherwise tafkheem (Қаф)
    {
      const rx = /къ/gi;
      let m;
      while ((m = rx.exec(text)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        const before = start > 0 ? text[start - 1] : '';
        const after = end < n ? text[end] : '';
        const afterIsBoundary = !after || /[\s.,!?;:\n\-]/.test(after);
        const beforeIsVowel = /[аеиоуыэюяАЕИОУЫЭЮЯáéíóúýÁÉÍÓÚÝ]/.test(before);
        if (beforeIsVowel && afterIsBoundary) {
          push(marks, start, end, ['qalqala'], false);
        } else {
          push(marks, start, end, ['tafkheem'], false);
        }
      }
    }

    // аIузу / аlузу — з before у (interdental in Фалкъ/Нас)
    {
      const rx = /[аaAА][IІlл]?[уuУ]зу/gi;
      let m;
      while ((m = rx.exec(text)) !== null) {
        const sn = m[0];
        const zAt = sn.toLowerCase().lastIndexOf('з');
        if (zAt >= 0) push(marks, m.index + zAt, m.index + zAt + 1, ['interdental'], false);
      }
    }

    return marks;
  }

  /**
   * @param {string} text
   * @param {{ examples?: object[] }} [opts] examples ignored (kept for API compat)
   */
  function suggestMarksForText(text, opts) {
    void opts;
    const src = String(text || '');
    if (!src.trim()) return [];
    const raw = applyHeuristics(src)
      .map((m) => clampMark(m, src.length))
      .filter(Boolean);
    return dedupe(collapseAdjacent(raw));
  }

  function suggestMarksForDoc(doc, examples) {
    return suggestMarksForText(String(doc?.transliteration || ''), { examples });
  }

  /** Kept for CLI/debug; empty — phrase transfer disabled (was over-painting vowels). */
  function buildPhraseBook() {
    return [];
  }

  const api = {
    suggestMarksForText,
    suggestMarksForDoc,
    buildPhraseBook,
    VALID_RULES: [...VALID_RULES],
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.TajweedSuggest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
