import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./figma-refinement.css", import.meta.url), "utf8");
const terraCss = readFileSync(new URL("./terra-production.css", import.meta.url), "utf8");

test("overview includes an enabled glass preview switch that can be compared in place", () => {
  assert.match(html, /id="glass-preview-toggle"[^>]*aria-pressed="true"/);
  assert.match(html, /id="view-overview"[^>]*data-glass-preview="on"/);
});

test("Liquid Glass stays scoped to the overview and has a non-blurred fallback", () => {
  assert.match(css, /#view-overview\.glass-preview-on[\s\S]*?backdrop-filter:\s*blur\(/);
  assert.match(css, /@supports\s+not\s*\(backdrop-filter:\s*blur\(1px\)\)[\s\S]*?#view-overview\.glass-preview-on/);
  assert.doesNotMatch(css, /^\.panel\s*\{[^}]*backdrop-filter/m);
});

test("selected analytics values and store deltas are readable at dashboard scale", () => {
  assert.match(css, /#app-frame\s+\.chart-detail\s+strong\s*\{[^}]*font-size:\s*2[0-9]px/s);
  assert.match(css, /#app-frame\s+\.stat\s+strong\s*\{[^}]*font-size:\s*3[2-9]px/s);
  assert.match(css, /#app-frame\s+\.admin-analytics-value\s*\{[^}]*font-size:\s*3[0-9]px/s);
  assert.match(terraCss, /\.admin-store-delta\.is-up\s*\{[^}]*padding:/s);
  assert.match(terraCss, /\.admin-store-delta\.is-up\s*\{[^}]*font-size:\s*1[3-9]px/s);
});
