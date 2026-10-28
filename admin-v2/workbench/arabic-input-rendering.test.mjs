import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
const css = readFileSync(fileURLToPath(new URL("arabic-input.css", root)), "utf8");
const js = readFileSync(fileURLToPath(new URL("arabic-input.js", root)), "utf8");

test("Arabic comma and question mark keep their readable UI font", () => {
  assert.match(
    css,
    /\.ait-key-special\[data-value="،"\],\s*\.ait-key-special\[data-value="؟"\]\s*\{[^}]*font-family:\s*Tahoma,\s*"Segoe UI",\s*Arial,\s*sans-serif;/s,
  );
  assert.ok(js.includes('const SPECIAL = ["أ", "إ", "آ", "ؤ", "ئ", "ء", "ة", "،", "؟", "ـ"]'));
});
