import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

function setup(saveRelease) {
  const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  function readReleaseForm()"), source.indexOf("  async function syncRelease()"));
  const original = { extra: "keep", android: { minVersion: "1", rustore: { extraStore: true }, apk: { checksum: "abc" } }, ios: { extraIOS: true } };
  const values = { rustoreLatestVersion: "2.0", rustoreVersionCode: "8", rustoreUrl: "https://example.com", apkLatestVersion: "2.1", apkVersionCode: "9", apkUrl: "https://example.com/a", iosLatestVersion: "3.0", iosBuildNumber: "10", appStoreUrl: "https://example.com/i", messageRu: "Текст", messageEn: "Text" };
  const state = { release: original, dirty: true };
  const context = { state, IS_PRODUCTION: true, FormData: class { get(key) { return values[key]; } }, $: () => ({}), window: { AdminSupabase: { saveRelease } }, setDirty() {}, toast() {} };
  runInNewContext(code + ";globalThis.read = readReleaseForm; globalThis.save = saveRelease;", context);
  return { context, state, original };
}

test("editing release settings preserves unshown fields at every level", () => {
  const { context } = setup(async () => {});
  const result = context.read();
  assert.equal(result.extra, "keep");
  assert.equal(result.android.minVersion, "1");
  assert.equal(result.android.rustore.extraStore, true);
  assert.equal(result.android.apk.checksum, "abc");
  assert.equal(result.ios.extraIOS, true);
  assert.equal(result.android.rustore.versionCode, 8);
});

test("a failed save does not replace the last saved release", async () => {
  const { context, state, original } = setup(async () => { throw new Error("offline"); });
  assert.equal(await context.save(), false);
  assert.equal(state.release, original);
});

test("legacy Android APK values remain visible in the form", () => {
  const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  function fillReleaseForm()"), source.indexOf("  function readReleaseForm()"));
  const fields = Object.fromEntries(["apkLatestVersion", "apkVersionCode", "apkUrl"].map((name) => [name, { value: "" }]));
  const state = { release: { android: { latestVersion: "4.2", versionCode: 42, apkUrl: "https://example.com/app.apk" } } };
  const form = { elements: { namedItem: (name) => fields[name] } };
  const context = { state, IS_PRODUCTION: true, document: { activeElement: null }, $: (selector) => selector === "#release-form" ? form : {} };
  runInNewContext(code + ";globalThis.fill = fillReleaseForm;", context);
  context.fill();
  assert.equal(fields.apkLatestVersion.value, "4.2");
  assert.equal(fields.apkVersionCode.value, "42");
  assert.equal(fields.apkUrl.value, "https://example.com/app.apk");
});

test("store sync does not discard unsaved release edits", async () => {
  const source = readFileSync(new URL("./terra-admin.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("  async function syncRelease()"), source.indexOf("  function dedupeReviews("));
  let calls = 0;
  const context = { state: { dirty: true }, IS_PRODUCTION: true, $: () => ({}), window: { AdminSupabase: { syncAppRelease: async () => { calls++; return {}; } } }, fillReleaseForm() {}, toast() {} };
  runInNewContext(code + ";globalThis.sync = syncRelease;", context);
  await context.sync();
  assert.equal(calls, 0);
  assert.equal(context.state.dirty, true);
});

test("local preview cannot report an unsaved release as saved", async () => {
  const { context, state } = setup(async () => {});
  context.IS_PRODUCTION = false;
  let dirtyChanged = false;
  context.setDirty = () => { dirtyChanged = true; };
  assert.equal(await context.save({ silent: true }), false);
  assert.equal(state.dirty, true);
  assert.equal(dirtyChanged, false);
});
