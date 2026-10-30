import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("admin exports keep source records, names and correct catalog counts", async () => {
  const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  function buildDuaManifest()"), source.indexOf("  function bannerInputValue("));
  const support = { id: "s", text: "نص", extra: { kept: true } };
  const general = { id: "g", text: "دعاء" };
  const state = { catalog: { manifest: { version: 4 } }, duaRecords: [{ category: "support_dua", original: support }, { category: "general_dua", original: general }], release: { custom: true }, announcements: [], dailyAyahPool: [], dailyDuaPool: [] };
  let blob, filename;
  const context = { state, Blob, URL: { createObjectURL(value) { blob = value; return "blob:test"; }, revokeObjectURL() {} }, document: { createElement() { return { set href(value) {}, set download(value) { filename = value; }, click() {} }; } }, window: { setTimeout() {} }, toast(message) { throw new Error(message); } };
  runInNewContext(code + ";globalThis.exportAdmin = exportAdminJson;", context);
  for (const [kind, name, expected] of [["support", "support-dua.json", [support]], ["general", "general-dua.json", [general]], ["release", "app-release.json", state.release]]) {
    context.exportAdmin(kind);
    assert.equal(filename, name);
    assert.deepEqual(JSON.parse(await blob.text()), expected);
  }
  context.exportAdmin("manifest");
  const manifest = JSON.parse(await blob.text());
  assert.equal(filename, "remote-dua.manifest.json");
  assert.equal(manifest.version, 5);
  assert.equal(manifest.packs.support_dua.itemCount, 1);
  assert.equal(manifest.packs.general_dua.itemCount, 1);
});
