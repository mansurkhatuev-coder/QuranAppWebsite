import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

function loadOverlay() {
  const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  function overlayLocalDuaDrafts("), source.indexOf("  async function loadCatalog("));
  const context = {};
  runInNewContext(code + ";globalThis.overlay = overlayLocalDuaDrafts;", context);
  return context.overlay;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("local drafts restore edits and new records without confusing matching IDs across categories", () => {
  const overlay = loadOverlay();
  const support = [{ id: "same", category: "support_dua", text: "original" }];
  const general = [{ id: "same", category: "general_dua", text: "other" }];
  const drafts = { same: { id: "same", category: "support_dua", text: "edited", source: { extra: 5 }, localSavedAt: "time" }, "general_dua:new": { id: "new", category: "general_dua", text: "new" } };
  const result = plain(overlay(support, general, drafts));
  assert.deepEqual(result.support, [{ id: "same", category: "support_dua", text: "edited", source: { extra: 5 } }]);
  assert.deepEqual(result.general, [general[0], { id: "new", category: "general_dua", text: "new" }]);
  assert.equal(support[0].text, "original");
});

test("invalid local draft entries do not replace catalogue records", () => {
  const overlay = loadOverlay();
  const source = [{ id: "a", text: "original" }];
  const result = plain(overlay(source, [], { bad: null, empty: { id: "", category: "support_dua" }, unknown: { id: "a", category: "other" } }));
  assert.deepEqual(result.support, source);
});

test("saving and reopening a local catalogue restores the draft without touching another category", async () => {
  const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
  const loading = source.slice(source.indexOf("  function overlayLocalDuaDrafts("), source.indexOf("  function updateCounts()"));
  const saving = source.slice(source.indexOf("  function storeLocalDraft("), source.indexOf("  function replaceDuaItem("));
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const state = {};
  const context = { state, localStorage: storage, DRAFTS_KEY: "demo", IS_PRODUCTION: false, $: () => null,
    getJson: async (url) => url.includes("support-dua") ? [{ id: "shared", category: "support_dua", text: "old" }] : url.includes("general-dua") ? [{ id: "shared", category: "general_dua", text: "other" }] : url.includes("azkar-classic") ? [] : { docs: [] },
    recordFromItem: (item, category) => ({ id: item.id, category, original: item }), recordFromAzkarDoc: () => ({}), updateCounts() {}, renderCatalog() {}, renderBanners() {}, fillReleaseForm() {}, toast(message) { throw new Error(message); } };
  runInNewContext(loading + saving + ";globalThis.save = storeLocalDraft; globalThis.load = loadCatalog;", context);
  context.save({ id: "shared", category: "support_dua", text: "edited", source: { book: "book" } });
  assert.equal(await context.load({ quiet: true }), true);
  assert.equal(state.duaRecords.find((r) => r.category === "support_dua").original.text, "edited");
  assert.equal(state.duaRecords.find((r) => r.category === "general_dua").original.text, "other");
  assert.equal(state.duaRecords[0].original.source.book, "book");
  assert.equal("localSavedAt" in state.duaRecords[0].original, false);
});
