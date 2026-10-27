import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studioSource = readFileSync(new URL("./browser-export-studio.mjs", import.meta.url), "utf8");
const studioHtml = readFileSync(new URL("./browser-export.html", import.meta.url), "utf8");

function collectPublishedModuleGraph(entryPath, visited = new Set()) {
  const filePath = resolve(entryPath);
  if (visited.has(filePath)) return visited;
  visited.add(filePath);
  const source = readFileSync(filePath, "utf8");
  const imports = [...source.matchAll(/(?:\bfrom\s*|^\s*import\s*)["']([^"']+)["']/gm)];

  for (const [, specifier] of imports) {
    if (!specifier.startsWith(".")) continue;
    const unresolved = resolve(dirname(filePath), specifier.split(/[?#]/, 1)[0]);
    const candidates = /\.[a-z0-9]+$/i.test(unresolved)
      ? [unresolved]
      : [`${unresolved}.mjs`, `${unresolved}.js`, `${unresolved}.json`];
    const dependency = candidates.find(candidate => existsSync(candidate));
    assert.ok(dependency, `Published module import ${specifier} from ${filePath} must exist`);
    collectPublishedModuleGraph(dependency, visited);
  }
  return visited;
}

test("browser video export header has a visible route back to the tree", () => {
  assert.match(studioSource, /class="browser-export-back"[^>]*href="\/drewo\/waydean-preview\.html\?state=all-tree"/s);
  assert.match(studioSource, /Назад к древу/);
});

test("browser video export lets the user choose and preview transition sounds", () => {
  assert.match(studioHtml, /import\("\.\/browser-export-studio\.mjs\?v=20261028-continuous-camera-exit-2"\)/);
  assert.match(studioSource, /id="browser-export-sound"/);
  assert.match(studioSource, /value="click" selected/);
  assert.match(studioSource, /Приятный щелчок/);
  assert.match(studioSource, /Кинематографичный «вжух»/);
  assert.match(studioSource, /value="whoosh"/);
  assert.match(studioSource, /value="none"/);
  assert.match(studioSource, /появлении подсветки следующей карточки/);
  assert.match(studioSource, /browser-export-sound-preview/);
  assert.match(studioSource, /browser-export-model\.mjs\?v=20261018-wall-clock-duration-1/);
  assert.match(studioSource, /Завершаем запись видео/);
});

test("browser video export auto-uploads finished renders to the private account library", () => {
  assert.match(studioHtml, /assets\/tus\.min\.js/);
  assert.match(studioHtml, /supabase-config\.js/);
  assert.match(studioSource, /uploadWaydeanVideo\(/);
  assert.match(studioSource, /автоматически загружается в закрытый раздел/);
  assert.match(studioSource, /Сохранить в Фото или Файлы/);
  assert.match(studioSource, /Повторить загрузку/);
  assert.match(studioSource, /готовый файл можно сохранить в Фото или Файлы/);
});

test("account login opens separately so the rendered video stays in the current export page", () => {
  assert.match(studioSource, /class="browser-export-account-login" href="\/admin\/" target="_blank" rel="noopener"/);
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

test("published browser export module graph does not require the ignored family snapshot", () => {
  const entryPath = fileURLToPath(new URL("./browser-export-studio.mjs", import.meta.url));
  const dependencies = [...collectPublishedModuleGraph(entryPath)];
  assert.equal(dependencies.some(filePath => filePath.endsWith("hoti-people.mjs")), false,
    dependencies.filter(filePath => filePath.endsWith("hoti-people.mjs")).join("\n"));
});

test("published browser export replaces the loading message with a visible error if the module fails", () => {
  assert.match(studioHtml, /browser-export-error/);
  assert.match(studioHtml, /root\.replaceChildren\(message\)/);
  assert.match(studioHtml, /Не удалось открыть видеоэкспорт/);
});
