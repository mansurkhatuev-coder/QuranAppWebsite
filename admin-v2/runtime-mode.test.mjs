import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("./runtime-mode.js", import.meta.url), "utf8");

function runtimeFor(href) {
  const location = new URL(href);
  const window = { location };
  vm.runInNewContext(source, { window, URL });
  return window.AdminV2Runtime;
}

test("live mode is limited to the secure canonical Admin V2 route", () => {
  const runtime = runtimeFor("https://waydean.ru/admin-v2/workbench/index.html?embedded=1");
  assert.equal(runtime.mode, "production");
  assert.equal(runtime.isProduction, true);
  assert.equal(runtime.isPreview, false);
});

test("local preview remains read-only and never enters production mode", () => {
  const runtime = runtimeFor("http://127.0.0.1:8783/admin-v2/legacy.html?embed=1");
  assert.equal(runtime.mode, "preview");
  assert.equal(runtime.isProduction, false);
  assert.equal(runtime.isPreview, true);
});

test("lookalike domains, insecure production URLs, and other routes are not live", () => {
  for (const href of [
    "https://waydean.ru.attacker.example/admin-v2/",
    "http://waydean.ru/admin-v2/",
    "https://waydean.ru/admin/",
    "https://preview.waydean.ru/admin-v2/",
  ]) {
    assert.notEqual(runtimeFor(href).mode, "production", href);
  }
});
