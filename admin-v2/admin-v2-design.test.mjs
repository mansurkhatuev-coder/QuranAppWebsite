import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const adminScript = readFileSync(new URL("./admin-v2.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./figma-refinement.css", import.meta.url), "utf8");
const ceHtml = readFileSync(new URL("./ce-locale/index.html", import.meta.url), "utf8");
const ceScript = readFileSync(new URL("./ce-locale/workbench.js", import.meta.url), "utf8");
const cePacksHtml = readFileSync(new URL("./ce-locale/packs/index.html", import.meta.url), "utf8");
const tajweedCss = readFileSync(new URL("./tajweed-editor/workbench-preview.css", import.meta.url), "utf8");

test("material editor presents the Arabic text before catalog metadata", () => {
  const arabic = html.indexOf('id="arabic"');
  const metadata = html.indexOf('id="title-field"');
  const repeat = html.indexOf('id="repeat"');
  assert.ok(arabic >= 0 && metadata >= 0 && repeat >= 0);
  assert.ok(arabic < metadata, "Arabic text should be the first editing field");
  assert.ok(arabic < repeat, "reading parameters should stay after core text");
  assert.match(html, /<details class="form-panel more-fields metadata-fields">/);
});

test("catalog section cards use a compact, explicitly sized action icon", () => {
  assert.match(css, /\.catalog-section-action\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(css, /\.catalog-section-action\s+svg\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s);
});

test("admin and embedded Tajweed use neutral graphite instead of green theme surfaces", () => {
  assert.match(css, /--canvas:\s*#111315/i);
  assert.match(css, /--panel:\s*#1b1e21/i);
  assert.match(css, /\.topbar\s*\{[^}]*background:\s*rgba\(17, 19, 21/s);
  assert.match(css, /\.editor-footer\s*\{[^}]*background:\s*rgba\(17, 19, 21/s);
  assert.match(tajweedCss, /\.ait-panel\s*\{\s*background:#191c1f/);
});

test("the full-screen Tajweed keyboard view stays graphite on phones", () => {
  assert.match(css, /body\.tajweed-keyboard-open\s+#tajweed-view\s*\{[^}]*background:\s*var\(--canvas\)/s);
});

test("overview and catalogue supporting labels stay readable", () => {
  assert.match(css, /\.eyebrow\s*,\s*\.stat span\s*,\s*\.store-row small\s*,\s*\.quick-list small\s*,\s*\.table-head\s*,\s*\.catalog-row small\s*\{[^}]*font-size:\s*12px/s);
});

test("draft activity uses an inline SVG instead of a text glyph", () => {
  assert.match(adminScript, /<svg class="empty-glyph"[^>]*width="16"[^>]*height="16"[^>]*viewBox="0 0 24 24"/);
  assert.doesNotMatch(adminScript, /<span class="empty-glyph">✓<\/span>/);
});

test("the translation workbench uses styled SVG icons for actions and navigation", () => {
  assert.match(ceHtml, /id="save-reviewed"[^>]*><svg/);
  assert.match(ceHtml, /id="next-unreviewed"[^>]*>[^<]*<svg/);
  assert.doesNotMatch(ceHtml, /href="\.\.\/index\.html">←/);
  assert.doesNotMatch(ceHtml, /id="refresh-app"[^>]*>↻/);
  assert.doesNotMatch(ceHtml, /id="save-reviewed"[^>]*>✓/);
  assert.doesNotMatch(ceHtml, /id="next-unreviewed"[^>]*>Далее →/);
  assert.doesNotMatch(cePacksHtml, /href="\.\.\/index\.html">←/);
  assert.doesNotMatch(ceScript, /reviewBtn\.textContent\s*=\s*isReviewed\(row\)[^;]*✓/);
  assert.doesNotMatch(ceScript, /nextBtn\.textContent\s*=\s*'Далее →'/);
  assert.doesNotMatch(ceScript, /createToolButton\('Яндекс ↗'/);
  assert.match(ceScript, /function createWorkbenchIcon/);
});
