import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");

test("replacing a draft targets its category as well as its ID", () => {
  const code = source.slice(source.indexOf("  function replaceDuaItem("), source.indexOf("  async function saveDuaDraft("));
  const state = { duaRecords: [{ id: "same", category: "support_dua", original: { text: "support" } }, { id: "same", category: "general_dua", original: { text: "general" } }], azkarRecords: [], tajweedDocuments: [] };
  const context = { state, recordFromItem: (item, category) => ({ id: item.id, category, original: item }), updateCounts() {}, renderCatalog() {}, renderEditor() {} };
  runInNewContext(code + ";globalThis.replace = replaceDuaItem;", context);
  context.replace({ id: "same", category: "general_dua", text: "edited" });
  assert.equal(state.duaRecords[0].original.text, "support");
  assert.equal(state.duaRecords[1].original.text, "edited");
});

test("editing keeps original category and additional benefit metadata", () => {
  const code = source.slice(source.indexOf("  function buildDuaItem()"), source.indexOf("  function storeLocalDraft("));
  const state = { currentRecord: { id: "same", category: "general_dua", original: { benefitHadith: { referenceId: "h1" } } } };
  const form = { category: "general_dua", title: "Title", navTitle: "Title", arabic: "نص", transliteration: "", count: 1, group: "", authenticity: "unknown", importance: "core", tags: [], source: "", sourceUrl: "", sourceNote: "", benefitSummary: "", benefitSource: "", benefitUrl: "", extra: [] };
  const context = { state, readForm: () => form, sourceLabel: () => "", translationsToItemFields: () => ({}), newDuaId: () => "new" };
  runInNewContext(code + ";globalThis.build = buildDuaItem;", context);
  const item = context.build();
  assert.equal(item.category, "general_dua");
  assert.equal(item.benefitHadith.referenceId, "h1");
});

test("saving unchanged source preserves its structured type and metadata", () => {
  const code = source.slice(source.indexOf("  function buildDuaItem()"), source.indexOf("  function storeLocalDraft("));
  const originalSource = { type: "hadith", referenceId: "42", url: "https://example.test" };
  const state = { currentRecord: { id: "a", category: "support_dua", source: "hadith", original: { source: originalSource } } };
  const form = { title: "Title", navTitle: "Title", arabic: "نص", transliteration: "", count: 1, group: "", category: "support_dua", authenticity: "unknown", importance: "core", tags: [], source: "hadith", sourceUrl: "https://example.test", sourceNote: "", benefitSummary: "", benefitSource: "", benefitUrl: "", extra: [] };
  const context = { state, readForm: () => form, sourceLabel: (value) => value?.book || value?.summary || value?.type || "", translationsToItemFields: () => ({}) };
  runInNewContext(code + ";globalThis.build = buildDuaItem;", context);
  const item = context.build();
  assert.deepEqual(JSON.parse(JSON.stringify(item.source)), originalSource);
  assert.deepEqual(originalSource, { type: "hadith", referenceId: "42", url: "https://example.test" });
});

test("a blank source remains absent after saving", () => {
  const code = source.slice(source.indexOf("  function buildDuaItem()"), source.indexOf("  function storeLocalDraft("));
  const state = { currentRecord: { id: "a", category: "support_dua", original: {} } };
  const form = { title: "Title", navTitle: "Title", arabic: "نص", transliteration: "", count: 1, group: "", category: "support_dua", authenticity: "unknown", importance: "core", tags: [], source: "", sourceUrl: "", sourceNote: "", benefitSummary: "", benefitSource: "", benefitUrl: "", extra: [] };
  const context = { state, readForm: () => form, sourceLabel: () => "", translationsToItemFields: () => ({}) };
  runInNewContext(code + ";globalThis.build = buildDuaItem;", context);
  assert.equal(context.build().source, undefined);
});

test("editing a summary-only source updates the summary and preserves identifiers", () => {
  const code = source.slice(source.indexOf("  function buildDuaItem()"), source.indexOf("  function storeLocalDraft("));
  const state = { currentRecord: { id: "a", category: "support_dua", original: { source: { type: "hadith", summary: "old", referenceId: 5 } } } };
  const form = { title: "Title", navTitle: "Title", arabic: "نص", transliteration: "", count: 1, group: "", category: "support_dua", authenticity: "unknown", importance: "core", tags: [], source: "new", sourceUrl: "", sourceNote: "", benefitSummary: "", benefitSource: "", benefitUrl: "", extra: [] };
  const context = { state, readForm: () => form, sourceLabel: (value) => value?.book || value?.summary || value?.type || "", translationsToItemFields: () => ({}) };
  runInNewContext(code + ";globalThis.build = buildDuaItem;", context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.build().source)), { type: "hadith", summary: "new", referenceId: 5 });
});

test("new material keeps the legacy default repetition count of three", () => {
  const start = source.indexOf('    $("#new-material").addEventListener("click", () => {');
  const end = source.indexOf('\n    $("#material-form").addEventListener("input"', start);
  assert.ok(start >= 0 && end > start);
  const handlers = new Map();
  let createdRecord = null;
  const context = {
    $: (selector) => ({ addEventListener: (_event, handler) => handlers.set(selector, handler) }),
    renderEditor: (record) => { createdRecord = record; },
  };
  runInNewContext(source.slice(start, end), context);
  handlers.get("#new-material")();
  assert.equal(createdRecord.count, 3);

  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="repeat" type="number" min="1" value="3"/);
});
