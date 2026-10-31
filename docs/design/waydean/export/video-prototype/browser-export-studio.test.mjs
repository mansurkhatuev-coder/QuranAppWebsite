import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studioSource = readFileSync(new URL("./browser-export-studio.mjs", import.meta.url), "utf8");
const studioHtml = readFileSync(new URL("./browser-export.html", import.meta.url), "utf8");
const canvasRendererSource = readFileSync(new URL("./remotion-preview/src/browser-canvas-renderer.mjs", import.meta.url), "utf8");
const projectModelSource = readFileSync(new URL("./remotion-preview/src/project-model.mjs", import.meta.url), "utf8");
const studioCss = readFileSync(new URL("./browser-export.css", import.meta.url), "utf8");

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

test("central person search and list are one accessible searchable picker", () => {
  assert.match(studioHtml, /browser-export-studio\.mjs\?v=20261031-large-tree-path-camera-1/);
  assert.match(studioSource, /id="browser-export-person-search"[^>]*role="combobox"/);
  assert.match(studioSource, /id="browser-export-person-results"[^>]*role="listbox"/);
  assert.match(studioSource, /data-person-option/);
  assert.match(studioSource, /aria-activedescendant/);
  assert.doesNotMatch(studioSource, /id="browser-export-person"/);
  assert.match(studioCss, /\.browser-export-person-picker/);
});

test("browser video export lets the user choose and preview transition sounds", () => {
  assert.match(studioHtml, /import\("\.\/browser-export-studio\.mjs\?v=20261031-large-tree-path-camera-1"\)/);
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

test("smooth tree camera code uses fresh cache keys in the published module chain", () => {
  assert.match(studioSource, /browser-canvas-renderer\.mjs\?v=20261031-large-tree-path-camera-1/);
  assert.match(canvasRendererSource, /project-model\.mjs\?v=20261031-large-tree-path-camera-1/);
  assert.match(canvasRendererSource, /cinematic-timeline\.mjs\?v=20261031-large-tree-path-camera-1/);
  assert.match(projectModelSource, /cinematic-timeline\.mjs\?v=20261031-large-tree-path-camera-1/);
});

test("video export exposes the selectable video background presets and persists the chosen ID", () => {
  assert.match(studioSource, /VIDEO_BACKGROUND_PRESETS/);
  assert.match(studioSource, /data-video-background=/);
  assert.match(studioSource, /backgroundId:/);
  assert.match(studioSource, /browser-export-backgrounds/);
  assert.match(studioSource, /openVideoBackgroundReader/);
  assert.match(studioSource, /startRealtimeVideoBackground\(backgroundVideoElement\)/);
  assert.match(studioSource, /realtimeVideoBackgroundActive && isVideoElementFrameRenderable\(backgroundVideoElement\)/);
  assert.match(studioSource, /await backgroundReader\.getSampleAt\(getVideoBackgroundOutputTimestamp\(outputFrame, plan\.fps\)\)/);
  assert.match(studioSource, /isVideoElementFrameRenderable\(backgroundVideoElement\)/);
  assert.doesNotMatch(studioSource, /playbackRate\s*=\s*settings\.speed/);
  assert.match(studioSource, /выбранным постером/);
});

test("combined Flow background reels disclose their duration and play once in preview and export", () => {
  assert.match(studioSource, /preset\.clipSeconds/);
  assert.match(studioSource, /без повтора/);
  assert.match(studioSource, /video\.loop = preset\.loop !== false/);
  assert.match(studioSource, /loop: video\.loop/);
  assert.match(studioSource, /loop: preset\.loop !== false/);
});

test("video export speed control accelerates the tree animation while backgrounds remain at normal speed", () => {
  assert.match(studioSource, /id="browser-export-speed"/);
  assert.match(studioSource, /VIDEO_SPEED_OPTIONS/);
  assert.match(studioSource, /update\(\{ speed: Number\(event\.currentTarget\.value\) \}\)/);
  assert.match(studioSource, /settings\.speed/);
  assert.match(studioSource, /Скорость анимации/);
  assert.match(studioSource, /playbackRate = 1/);
  assert.doesNotMatch(studioSource, /outputFrame \/ plan\.fps \* plan\.speed/);
  assert.doesNotMatch(studioSource, /playbackRate = settings\.speed/);
  assert.match(studioSource, /timeLabel\(previewPlan\.durationSeconds\)/);
  assert.match(studioSource, /localStorage\.setItem\(EXPORT_SETTINGS_STORAGE_KEY, JSON\.stringify\(settings\)\)/);
  assert.match(studioCss, /\.browser-export-speed input/);
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
