import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const studioSource = readFileSync(new URL("./browser-export-studio.mjs", import.meta.url), "utf8");
const studioHtml = readFileSync(new URL("./browser-export.html", import.meta.url), "utf8");

test("browser video export header has a visible route back to the tree", () => {
  assert.match(studioSource, /class="browser-export-back"[^>]*href="\/drewo\/waydean-preview\.html\?state=all-tree"/s);
  assert.match(studioSource, /Назад к древу/);
});

test("browser video export lets the user choose and preview transition sounds", () => {
  assert.match(studioHtml, /browser-export-studio\.mjs\?v=20261015-preview-play/);
  assert.match(studioSource, /id="browser-export-sound"/);
  assert.match(studioSource, /value="click" selected/);
  assert.match(studioSource, /Приятный щелчок/);
  assert.match(studioSource, /value="none"/);
  assert.match(studioSource, /появлении подсветки следующей карточки/);
  assert.match(studioSource, /browser-export-sound-preview/);
});

test("video preview has an accessible play control and frame-based playback", () => {
  assert.match(studioSource, /id="browser-export-play"/);
  assert.match(studioSource, /Воспроизвести/);
  assert.match(studioSource, /Пауза/);
  assert.match(studioSource, /requestAnimationFrame/);
  assert.match(studioSource, /cancelAnimationFrame/);
});

test("published browser export does not statically depend on the ignored local family snapshot", () => {
  assert.doesNotMatch(studioSource, /^import\s+\{\s*HOTI_PEOPLE\s*\}\s+from\s+["']\.\/hoti-people\.mjs/m);
  assert.match(studioSource, /DEMO_PEOPLE/);
  assert.match(studioSource, /Откройте экспорт из загруженного дерева/);
});
