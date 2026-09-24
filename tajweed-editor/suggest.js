/**
 * Suggest tajweed marks on Chechen-style transliteration.
 * Learns phrase snippets from marked example docs + orthography heuristics.
 * Shared by editor (browser) and scripts/suggest_azkar_tajweed_marks.js (Node).
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

  const ACUTE = /[\u0301\u00B4´]/;
  const MACRON_BELOW = /\u0331/;

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

  function mergeMarkLists(lists, len) {
    const byKey = new Map();
    for (const list of lists) {
      for (const raw of list) {
        const m = clampMark(raw, len);
        if (!m || (!m.rules.length && !m.accent && !m.hidden)) continue;
        const key = `${m.start}:${m.end}`;
        const prev = byKey.get(key);
        if (!prev) {
          byKey.set(key, m);
          continue;
        }
        const rules = [...new Set([...prev.rules, ...m.rules])];
        byKey.set(key, {
          ...prev,
          rules,
          accent: prev.accent || m.accent,
          hidden: prev.hidden || m.hidden,
          note: prev.note || m.note,
        });
      }
    }
    return [...byKey.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  /** Build phrase → mark template from example docs (snippet length 1–12). */
  function buildPhraseBook(examples) {
    /** @type {Map<string, { rules: string[], accent: boolean, hidden: boolean, hits: number }>} */
    const book = new Map();
    for (const doc of examples || []) {
      const text = String(doc.transliteration || '');
      if (!text) continue;
      for (const raw of doc.marks || []) {
        const m = clampMark(raw, text.length);
        if (!m) continue;
        const snippet = text.slice(m.start, m.end);
        if (!snippet || snippet.length > 12) continue;
        if (/^\s+$/.test(snippet)) continue;
        // Single-char phrases over-match; keep only accent/hidden/interdental cues
        if (
          snippet.length === 1 &&
          !m.accent &&
          !m.hidden &&
          !(m.rules.length === 1 && m.rules[0] === 'interdental')
        ) {
          continue;
        }
        const prev = book.get(snippet);
        if (!prev || prev.hits < 1) {
          book.set(snippet, {
            rules: m.rules.slice(),
            accent: m.accent,
            hidden: m.hidden,
            hits: 1,
          });
        } else {
          prev.hits += 1;
          // Prefer richer rule set when conflict
          if (m.rules.length > prev.rules.length) prev.rules = m.rules.slice();
          prev.accent = prev.accent || m.accent;
          prev.hidden = prev.hidden || m.hidden;
        }
      }
    }
    return [...book.entries()]
      .map(([snippet, meta]) => ({ snippet, ...meta }))
      .sort((a, b) => b.snippet.length - a.snippet.length || b.hits - a.hits);
  }

  function applyPhraseBook(text, phraseBook) {
    const marks = [];
    const covered = new Uint8Array(text.length);
    for (const entry of phraseBook) {
      const sn = entry.snippet;
      if (!sn) continue;
      let from = 0;
      while (from < text.length) {
        const idx = text.indexOf(sn, from);
        if (idx < 0) break;
        let overlap = false;
        for (let i = idx; i < idx + sn.length; i += 1) {
          if (covered[i]) {
            overlap = true;
            break;
          }
        }
        if (!overlap) {
          marks.push({
            start: idx,
            end: idx + sn.length,
            rules: entry.rules.slice(),
            accent: entry.accent,
            hidden: entry.hidden,
            note: '',
          });
          for (let i = idx; i < idx + sn.length; i += 1) covered[i] = 1;
        }
        from = idx + 1;
      }
    }
    return marks;
  }

  function isLetter(ch) {
    return /[A-Za-zА-Яа-яЁёIІӀӏ]/.test(ch);
  }

  function applyHeuristics(text) {
    const marks = [];
    const n = text.length;

    const pushRange = (start, end, rules, accent = false) => {
      if (end <= start) return;
      marks.push({ start, end, rules, accent, hidden: false, note: '' });
    };

    // Combining acute / ´ → madd2 + accent on that char (or previous letter)
    for (let i = 0; i < n; i += 1) {
      const ch = text[i];
      if (ACUTE.test(ch) || ch === '´' || ch === '\u00B4') {
        let t = i;
        if (!isLetter(ch) && i > 0 && isLetter(text[i - 1])) t = i - 1;
        if (isLetter(text[t]) || ACUTE.test(text[t])) {
          pushRange(t, t + 1, ['madd2'], true);
        }
      }
      if (MACRON_BELOW.test(ch) || ch === '\u0331') {
        const t = i > 0 ? i - 1 : i;
        pushRange(t, t + 1, ['interdental'], false);
      }
    }

    // Digraphs / orthography tokens
    const patterns = [
      { re: /х[1IІ]/gi, rules: ['tafkheem'] },
      { re: /Х[1IІ]/g, rules: ['tafkheem'] },
      { re: /г[1IІ]/gi, rules: ['tafkheem'] },
      { re: /къ/gi, rules: ['tafkheem'] },
      { re: /хь/gi, rules: ['tafkheem'] },
      { re: /т[1IІ]/gi, rules: ['tafkheem'] },
      { re: /с̣|с\u0323/gi, rules: ['tafkheem'] },
      { re: /нн/gi, rules: ['ghunna'] },
      { re: /мм/gi, rules: ['ghunna'] },
      { re: /вв/gi, rules: ['ghunna'] },
      { re: /рр/gi, rules: ['tafkheem'] },
      { re: /з̱|з\u0331|ҙ/gi, rules: ['interdental'] },
      { re: /з(?=[уУ])/g, rules: ['interdental'] }, // аlузу / аIузу style
    ];

    for (const { re, rules } of patterns) {
      re.lastIndex = 0;
      let m;
      const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
      const rx = new RegExp(re.source, flags);
      while ((m = rx.exec(text)) !== null) {
        pushRange(m.index, m.index + m[0].length, rules, false);
        if (m[0].length === 0) rx.lastIndex += 1;
      }
    }

    // Isolated qalqala-ish: final къ at word end after vowel often qalqala in examples (холакъ)
    {
      const rx = /([аеиоуыэюяАЕИОУЫЭЮЯ])(къ)(?=[\s.,!?;:]|$)/g;
      let m;
      while ((m = rx.exec(text)) !== null) {
        pushRange(m.index + m[1].length, m.index + m[0].length, ['qalqala'], false);
      }
    }

    return marks;
  }

  function collapseAdjacent(marks) {
    if (!marks.length) return marks;
    const sorted = marks.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    const out = [];
    for (const m of sorted) {
      const prev = out[out.length - 1];
      const sameRules =
        prev &&
        prev.rules.join(',') === m.rules.join(',') &&
        prev.accent === m.accent &&
        prev.hidden === m.hidden &&
        prev.end >= m.start;
      if (sameRules) {
        prev.end = Math.max(prev.end, m.end);
        continue;
      }
      out.push({ ...m, rules: m.rules.slice() });
    }
    return out;
  }

  /**
   * @param {string} text
   * @param {{ examples?: object[], preferExisting?: object[] }} [opts]
   */
  function suggestMarksForText(text, opts) {
    const src = String(text || '');
    if (!src.trim()) return [];
    const examples = opts && Array.isArray(opts.examples) ? opts.examples : [];
    const phraseBook = buildPhraseBook(examples);
    const fromPhrases = applyPhraseBook(src, phraseBook);

    const covered = new Uint8Array(src.length);
    for (const m of fromPhrases) {
      for (let i = m.start; i < m.end; i += 1) covered[i] = 1;
    }

    const rawHeuristics = applyHeuristics(src);
    const fromHeuristics = rawHeuristics.filter((m) => {
      for (let i = m.start; i < m.end; i += 1) {
        if (covered[i]) return false;
      }
      return true;
    });

    let merged = mergeMarkLists([fromPhrases, fromHeuristics], src.length);
    merged = collapseAdjacent(merged);

    if (opts && Array.isArray(opts.preferExisting) && opts.preferExisting.length) {
      merged = mergeMarkLists([opts.preferExisting, merged], src.length);
      merged = collapseAdjacent(merged);
    }

    const seen = new Set();
    return merged.filter((m) => {
      const k = markKey(m);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function suggestMarksForDoc(doc, examples) {
    const text = String(doc?.transliteration || '');
    return suggestMarksForText(text, { examples });
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
