(() => {
  "use strict";

  const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’ʻʾʼ][\p{L}\p{M}\p{N}]+)*/gu;
  const SENTENCE_BREAK_RE = /[.!?;\n]/;

  function tokenKey(value) {
    return String(value || "").normalize("NFC").toLocaleLowerCase("ru-RU");
  }

  function tokenize(text) {
    const value = String(text || "");
    return Array.from(value.matchAll(WORD_RE), (match) => ({
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      key: tokenKey(match[0]),
    }));
  }

  function selectedTokens(tokens, start, end) {
    const a = Math.max(0, Number(start) || 0);
    const b = Math.max(a, Number(end) || 0);
    return tokens.filter((token) => token.start < b && token.end > a);
  }

  function toMatch(pairs, { matchedWords = pairs.length, ratio = 1 } = {}) {
    if (!pairs.length) return null;
    return {
      start: pairs[0].target.start,
      end: pairs[pairs.length - 1].target.end,
      wordPairs: pairs.map(({ source, target }) => ({
        sourceToken: { start: source.start, end: source.end, raw: source.raw, key: source.key },
        targetToken: { start: target.start, end: target.end, raw: target.raw, key: target.key },
      })),
      matchedWords,
      ratio,
    };
  }

  function findExactMatches(text, start, end) {
    const tokens = tokenize(text);
    const source = selectedTokens(tokens, start, end);
    if (!source.length) return [];

    const matches = [];
    for (let offset = 0; offset <= tokens.length - source.length; offset += 1) {
      const target = tokens.slice(offset, offset + source.length);
      if (!source.every((token, index) => token.key === target[index].key)) continue;
      const match = toMatch(source.map((token, index) => ({ source: token, target: target[index] })));
      if (match) matches.push(match);
    }
    return matches;
  }

  function sentenceTokenGroups(text, tokens) {
    if (!tokens.length) return [];
    const groups = [];
    let current = [tokens[0]];
    for (let index = 1; index < tokens.length; index += 1) {
      const previous = tokens[index - 1];
      const next = tokens[index];
      const gap = text.slice(previous.end, next.start);
      if (SENTENCE_BREAK_RE.test(gap)) {
        groups.push(current);
        current = [];
      }
      current.push(next);
    }
    groups.push(current);
    return groups;
  }

  function alignInOrder(source, target) {
    const rows = source.length + 1;
    const cols = target.length + 1;
    const table = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = source.length - 1; i >= 0; i -= 1) {
      for (let j = target.length - 1; j >= 0; j -= 1) {
        table[i][j] = source[i].key === target[j].key
          ? 1 + table[i + 1][j + 1]
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }

    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < source.length && j < target.length) {
      if (source[i].key === target[j].key) {
        pairs.push({ source: source[i], target: target[j] });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
    return pairs;
  }

  function hasExactSequence(source, target) {
    if (!source.length || source.length > target.length) return false;
    for (let offset = 0; offset <= target.length - source.length; offset += 1) {
      if (source.every((token, index) => token.key === target[offset + index].key)) return true;
    }
    return false;
  }

  function findSimilarCandidates(text, start, end) {
    const value = String(text || "");
    const tokens = tokenize(value);
    const source = selectedTokens(tokens, start, end);
    if (source.length < 2) return [];

    const sourceStart = source[0].start;
    const sourceEnd = source[source.length - 1].end;
    const candidates = [];
    for (const group of sentenceTokenGroups(value, tokens)) {
      const groupStart = group[0].start;
      const groupEnd = group[group.length - 1].end;
      if (groupStart < sourceEnd && groupEnd > sourceStart) continue;
      if (hasExactSequence(source, group)) continue;

      const pairs = alignInOrder(source, group);
      const ratio = pairs.length / source.length;
      if (pairs.length < 2 || ratio < 0.5) continue;
      const candidate = toMatch(pairs, { matchedWords: pairs.length, ratio });
      if (candidate) {
        candidate.start = groupStart;
        candidate.end = groupEnd;
        candidates.push(candidate);
      }
    }
    return candidates.sort((a, b) => b.ratio - a.ratio || b.matchedWords - a.matchedWords || a.start - b.start);
  }

  function hasVisualMarkup(mark) {
    return Boolean((Array.isArray(mark.rules) && mark.rules.length) || mark.accent || mark.hidden);
  }

  function copyVisualMarkup(mark, start, end) {
    return {
      start,
      end,
      rules: Array.isArray(mark.rules) ? mark.rules.slice() : [],
      accent: Boolean(mark.accent),
      hidden: Boolean(mark.hidden),
    };
  }

  function mergeClearRanges(text, ranges) {
    const sorted = ranges
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of sorted) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else if (previous && /^\s*$/.test(text.slice(previous.end, range.start))) {
        previous.end = range.end;
      } else {
        merged.push({ start: range.start, end: range.end });
      }
    }
    return merged;
  }

  function subtractRange(mark, range) {
    if (mark.end <= range.start || mark.start >= range.end) return [mark];
    const pieces = [];
    if (mark.start < range.start) pieces.push({ ...mark, end: range.start });
    if (mark.note) {
      pieces.push({
        ...mark,
        start: Math.max(mark.start, range.start),
        end: Math.min(mark.end, range.end),
        rules: [],
        accent: false,
        hidden: false,
      });
    }
    if (mark.end > range.end) pieces.push({ ...mark, start: range.end });
    return pieces;
  }

  function subtractRanges(marks, ranges) {
    let result = marks;
    for (const range of ranges) result = result.flatMap((mark) => subtractRange(mark, range));
    return result;
  }

  function isMeaningfulMark(mark) {
    return Boolean((Array.isArray(mark.rules) && mark.rules.length) || mark.accent || mark.hidden || mark.note);
  }

  function tokenAtOffset(tokens, expected) {
    if (!expected) return null;
    return tokens.find((token) => token.start === expected.start && token.end === expected.end) || null;
  }

  function applyToTargets(text, marks, sourceRange, targetRanges) {
    const value = String(text || "");
    const documentTokens = tokenize(value);
    const sourceTokens = selectedTokens(documentTokens, sourceRange?.start, sourceRange?.end);
    const sourceMarks = Array.isArray(marks) ? marks : [];
    const targets = Array.isArray(targetRanges) ? targetRanges : [];
    if (!sourceTokens.length || !targets.length) {
      return { marks: sourceMarks.map((mark) => ({ ...mark })), appliedTargets: 0, skippedTargets: targets.length };
    }

    const clearRanges = [];
    const copiedMarks = [];
    const acceptedTargets = [];
    let appliedTargets = 0;
    let skippedTargets = 0;

    for (const target of targets) {
      const targetStart = Number(target?.start);
      const targetEnd = Number(target?.end);
      const overlapsSource = targetStart < sourceRange.end && targetEnd > sourceRange.start;
      const overlapsAcceptedTarget = acceptedTargets.some((accepted) =>
        targetStart < accepted.end && targetEnd > accepted.start,
      );
      if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart || overlapsSource || overlapsAcceptedTarget) {
        skippedTargets += 1;
        continue;
      }

      const pairs = Array.isArray(target.wordPairs) ? target.wordPairs : [];
      let safePairs = 0;
      let skippedPair = false;
      for (const pair of pairs) {
        const sourceToken = pair.sourceToken;
        const targetToken = pair.targetToken;
        const currentSourceToken = tokenAtOffset(documentTokens, sourceToken);
        const currentTargetToken = tokenAtOffset(documentTokens, targetToken);
        const belongsToSource = sourceTokens.some((token) =>
          token.start === sourceToken?.start && token.end === sourceToken?.end,
        );
        if (
          !sourceToken
          || !targetToken
          || !currentSourceToken
          || !currentTargetToken
          || !belongsToSource
          || currentSourceToken.raw !== sourceToken.raw
          || currentTargetToken.raw !== targetToken.raw
          || currentSourceToken.key !== sourceToken.key
          || currentTargetToken.key !== targetToken.key
          || sourceToken.end - sourceToken.start !== targetToken.end - targetToken.start
        ) {
          skippedPair = true;
          continue;
        }
        const selectedStart = Math.max(Number(sourceRange.start) || 0, sourceToken.start);
        const selectedEnd = Math.min(Number(sourceRange.end) || 0, sourceToken.end);
        if (selectedEnd <= selectedStart) continue;

        const targetStart = targetToken.start + selectedStart - sourceToken.start;
        const targetEnd = targetToken.start + selectedEnd - sourceToken.start;
        clearRanges.push({ start: targetStart, end: targetEnd });
        safePairs += 1;

        for (const mark of sourceMarks) {
          const markStart = Math.max(mark.start, selectedStart, sourceToken.start);
          const markEnd = Math.min(mark.end, selectedEnd, sourceToken.end);
          if (markEnd <= markStart || !hasVisualMarkup(mark)) continue;
          copiedMarks.push(copyVisualMarkup(
            mark,
            targetToken.start + markStart - sourceToken.start,
            targetToken.start + markEnd - sourceToken.start,
          ));
        }
      }
      if (safePairs) {
        appliedTargets += 1;
        acceptedTargets.push({ start: targetStart, end: targetEnd });
      }
      if (skippedPair || !safePairs) skippedTargets += 1;
    }

    const mergedRanges = mergeClearRanges(value, clearRanges);
    const nextMarks = subtractRanges(sourceMarks.map((mark) => ({
      ...mark,
      rules: Array.isArray(mark.rules) ? mark.rules.slice() : [],
    })), mergedRanges)
      .concat(copiedMarks)
      .filter(isMeaningfulMark)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    return { marks: nextMarks, appliedTargets, skippedTargets };
  }

  window.AdminV2TajweedReapplyMarkup = Object.freeze({
    findExactMatches,
    findSimilarCandidates,
    applyToTargets,
  });
})();
