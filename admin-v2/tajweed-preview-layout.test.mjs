import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const html = readFileSync(new URL("tajweed-editor/index.html", root), "utf8");
const css = readFileSync(new URL("tajweed-editor/workbench-preview.css", root), "utf8");

test("preview styles activate only when the editor is embedded in the workbench", () => {
  assert.match(html, /workbenchPreview[^<]*dataset\.workbenchPreview\s*=\s*["']true["']/);
});

test("the markup canvas precedes the secondary Arabic and transliteration inputs", () => {
  assert.match(css, /\.toolbar\s*\{[^}]*order:\s*3/s);
  assert.match(css, /\.stage\s*\{[^}]*order:\s*4/s);
  assert.match(css, /\.arabic-bar\s*\{[^}]*order:\s*5/s);
  assert.match(css, /\.translit-bar\s*\{[^}]*order:\s*6/s);
});

test("collapsed inspector panels remain reachable from the rule toolbar", () => {
  assert.match(html, /id="btnShowMarks"[^>]*aria-controls="marks-panel"/);
  assert.match(html, /id="btnShowJson"[^>]*aria-controls="json-panel"/);
  assert.match(html, /id="marks-panel"/);
  assert.match(html, /id="json-panel"/);
  assert.match(css, /\.side-panels\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.side-panels\.is-open\s*\{[^}]*display:\s*grid/s);
});
