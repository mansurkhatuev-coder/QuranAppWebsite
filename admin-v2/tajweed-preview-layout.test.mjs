import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const html = readFileSync(new URL("tajweed-editor/index.html", root), "utf8");
const css = readFileSync(new URL("tajweed-editor/workbench-preview.css", root), "utf8");

test("preview styles activate only when the editor is embedded in the workbench", () => {
  assert.match(html, /workbenchPreview[^<]*dataset\.workbenchPreview\s*=\s*["']true["']/);
});

test("reference inputs precede the toolbar and markup canvas as requested", () => {
  assert.match(css, /\.toolbar\s*\{[^}]*order:\s*5/s);
  assert.match(css, /\.stage\s*\{[^}]*order:\s*6/s);
  assert.match(css, /\.arabic-bar\s*\{[^}]*order:\s*3/s);
  assert.match(css, /\.translit-bar\s*\{[^}]*order:\s*4/s);
});

test("collapsed inspector panels remain reachable from the rule toolbar", () => {
  assert.match(html, /id="btnShowMarks"[^>]*aria-controls="marks-panel"/);
  assert.match(html, /id="btnShowJson"[^>]*aria-controls="json-panel"/);
  assert.match(html, /id="marks-panel"/);
  assert.match(html, /id="json-panel"/);
  assert.match(css, /\.side-panels\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.side-panels\.is-open\s*\{[^}]*display:\s*grid/s);
});

test("availability controls live in the Tajweed header instead of below the editor", () => {
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] || "";
  assert.match(topbar, /class="availability-panel"/);
  assert.match(topbar, /id="btnAvailability"/);
  assert.match(topbar, /id="btnAvailabilityRefresh"/);
  assert.doesNotMatch(html, /<\/header>\s*<section class="availability-panel"/);
});

test("wide preview places Arabic and transliteration inputs beside one another", () => {
  assert.match(html, /<div class="source-fields">[\s\S]*?class="arabic-bar"[\s\S]*?class="translit-bar"[\s\S]*?<\/div>/);
  assert.match(css, /\.source-fields\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(/s);
  assert.match(css, /@media\s*\(max-width:\s*(?:860|900)px\)[\s\S]*?\.source-fields\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
