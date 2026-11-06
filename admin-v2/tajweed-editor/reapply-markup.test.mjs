import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function loadHelper() {
  const source = await readFile(new URL('./reapply-markup.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window });
  return window.AdminV2TajweedReapplyMarkup;
}

test('finds exact whole-word matches without matching word fragments', async () => {
  const helper = await loadHelper();
  const text = 'Subha subha, Subha subhan\nSUBHA.';
  const matches = helper.findExactMatches(text, 0, 5);

  assert.deepEqual(JSON.parse(JSON.stringify(matches.map(({ start, end }) => text.slice(start, end)))), ['Subha', 'subha', 'Subha', 'SUBHA']);
});

test('finds phrase matches when case and repeated whitespace differ', async () => {
  const helper = await loadHelper();
  const text = 'Allahumma ighfir lahu. ALLAHUMMA   IGHFIR  LAHU!';
  const matches = helper.findExactMatches(text, 0, text.indexOf('.'));

  assert.equal(matches.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(matches.map(({ start, end }) => text.slice(start, end).toLocaleLowerCase('ru-RU')))), [
    'allahumma ighfir lahu',
    'allahumma   ighfir  lahu',
  ]);
});

test('lists similar sentence candidates by ordered shared whole words', async () => {
  const helper = await loadHelper();
  const text = 'Allahumma ighfir lahu warhamhu. Allahumma ighfir lana warhamna. Allahumma ihdina.';
  const sourceEnd = text.indexOf('.');
  const candidates = helper.findSimilarCandidates(text, 0, sourceEnd);

  assert.equal(candidates.length, 1);
  assert.equal(text.slice(candidates[0].start, candidates[0].end), 'Allahumma ighfir lana warhamna');
  assert.equal(candidates[0].matchedWords, 2);
});

test('copies only visible marks from the selected word to the chosen exact occurrence', async () => {
  const helper = await loadHelper();
  const text = 'ghunnah ghunnah';
  const matches = helper.findExactMatches(text, 0, 7);
  const result = helper.applyToTargets(text, [
    { start: 0, end: 3, rules: ['ghunna'], accent: false, hidden: false, note: 'source note' },
  ], { start: 0, end: 7 }, [matches[1]]);

  assert.deepEqual(JSON.parse(JSON.stringify(result.marks)), [
    { start: 0, end: 3, rules: ['ghunna'], accent: false, hidden: false, note: 'source note' },
    { start: 8, end: 11, rules: ['ghunna'], accent: false, hidden: false },
  ]);
  assert.equal(result.appliedTargets, 1);
  assert.equal(text, 'ghunnah ghunnah');
});

test('replaces marks only inside a target token and preserves crossing mark fragments', async () => {
  const helper = await loadHelper();
  const text = 'abcdefg abcdefg xyz';
  const matches = helper.findExactMatches(text, 0, 7);
  const result = helper.applyToTargets(text, [
    { start: 0, end: 2, rules: ['ghunna'], accent: false, hidden: false },
    { start: 13, end: 18, rules: ['old-rule'], accent: false, hidden: false, note: 'keep target note' },
  ], { start: 0, end: 7 }, [matches[1]]);

  assert.deepEqual(JSON.parse(JSON.stringify(result.marks)), [
    { start: 0, end: 2, rules: ['ghunna'], accent: false, hidden: false },
    { start: 8, end: 10, rules: ['ghunna'], accent: false, hidden: false },
    { start: 13, end: 15, rules: [], accent: false, hidden: false, note: 'keep target note' },
    { start: 15, end: 18, rules: ['old-rule'], accent: false, hidden: false, note: 'keep target note' },
  ]);
});

test('skips source-overlapping and mutually overlapping targets', async () => {
  const helper = await loadHelper();
  const text = 'a a a a a';
  const matches = helper.findExactMatches(text, 0, 3);
  const sourceMarks = [
    { start: 0, end: 1, rules: ['source-first'], accent: false, hidden: false },
    { start: 2, end: 3, rules: ['source-second'], accent: false, hidden: false },
  ];

  const result = helper.applyToTargets(text, sourceMarks, { start: 0, end: 3 }, matches);

  assert.equal(result.appliedTargets, 1);
  assert.equal(result.skippedTargets, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.marks)), [
    ...sourceMarks,
    { start: 4, end: 5, rules: ['source-first'], accent: false, hidden: false },
    { start: 6, end: 7, rules: ['source-second'], accent: false, hidden: false },
  ]);
});

test('does not change different words in an approved similar candidate', async () => {
  const helper = await loadHelper();
  const text = 'Allahumma ighfir lahu warhamhu. Allahumma ighfir lana warhamna.';
  const sourceStart = text.indexOf('ighfir');
  const sourceEnd = text.indexOf('.');
  const sourceRange = { start: 0, end: sourceEnd };
  const candidate = helper.findSimilarCandidates(text, sourceRange.start, sourceRange.end)[0];
  const changedWord = text.indexOf('lana');
  const targetStart = text.indexOf('ighfir', sourceEnd + 1);
  const result = helper.applyToTargets(text, [
    { start: sourceStart, end: sourceStart + 2, rules: ['madd2'], accent: false, hidden: false },
    { start: changedWord, end: changedWord + 4, rules: ['ghunna'], accent: false, hidden: false },
  ], sourceRange, [candidate]);

  assert.ok(result.marks.some((mark) => mark.start === targetStart && mark.rules.includes('madd2')));
  assert.ok(result.marks.some((mark) => mark.start === changedWord && mark.rules.includes('ghunna')));
});

test('skips an NFC-equivalent token when original character offsets cannot be mapped safely', async () => {
  const helper = await loadHelper();
  const text = 'é x e\u0301 y';
  const matches = helper.findExactMatches(text, 0, 1);
  const result = helper.applyToTargets(text, [
    { start: 0, end: 1, rules: ['ghunna'], accent: false, hidden: false },
  ], { start: 0, end: 1 }, [matches[1]]);

  assert.equal(matches.length, 2);
  assert.equal(result.appliedTargets, 0);
  assert.equal(result.skippedTargets, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.marks)), [
    { start: 0, end: 1, rules: ['ghunna'], accent: false, hidden: false },
  ]);
  assert.equal(text, 'é x e\u0301 y');
});

test('skips stale target offsets when the document tokens changed', async () => {
  const helper = await loadHelper();
  const originalText = 'a b. a b.';
  const staleTarget = helper.findExactMatches(originalText, 0, 3)[1];
  const currentText = 'x y. x y.';
  const marks = [
    { start: 0, end: 1, rules: ['source'], accent: false, hidden: false },
  ];

  const result = helper.applyToTargets(currentText, marks, { start: 0, end: 3 }, [staleTarget]);

  assert.equal(result.appliedTargets, 0);
  assert.equal(result.skippedTargets, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.marks)), marks);
});
