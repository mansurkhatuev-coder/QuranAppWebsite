import { HOTI_PEOPLE } from "./hoti-people.mjs?v=20261015-abdul-1952";
import { buildExportPreview, DEFAULT_EXPORT_SETTINGS, normalizeExportSettings } from "./remotion-preview/src/export-studio-model.mjs";
import {
  getBrowserVideoSupport,
  readVideoExportHandoff,
  recordCanvasVideo
} from "./remotion-preview/src/browser-export-model.mjs";
import {
  buildBrowserRenderPlan,
  createBrowserCanvasFrameRenderer,
  getSourceFrameForBrowserExport
} from "./remotion-preview/src/browser-canvas-renderer.mjs";
import { createTransitionAudioTrack, getTransitionCueFrames } from "./browser-transition-sound.mjs?v=20261015-click-sync";
import { VIDEO_FORMATS } from "./remotion-preview/src/composition-config.mjs";
import { getPreviewPlaybackFrame } from "./preview-playback.mjs?v=20261015-preview-play";

const root = document.getElementById("browser-export-root");
const handoff = readVideoExportHandoff(window.sessionStorage);
const people = handoff?.tree.people ?? HOTI_PEOPLE;
let settings = normalizeExportSettings(handoff?.settings ?? DEFAULT_EXPORT_SETTINGS, people);
let preview = buildExportPreview(settings, people);
let frame = 0;
let previewPlan = null;
let previewFrameRenderer = null;
let playbackRequestId = null;
let playbackStartedAt = 0;
let playbackStartFrame = 0;
let background = null;
let videoBlob = null;
let videoUrl = "";
let renderController = null;
let rendering = false;
let transitionSoundStyle = "click";
let soundPreviewPlayer = null;
let soundPreviewTimer = 0;
let support = { supported: false, mimeType: "", reason: "Проверяем поддержку видеозаписи…" };

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

function timeLabel(seconds) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function clearVideo() {
  videoBlob = null;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = "";
  const ready = root.querySelector(".browser-export-ready");
  ready.hidden = true;
  ready.replaceChildren();
}

function setPreviewPlaybackButton(playing) {
  const button = root.querySelector("#browser-export-play");
  if (!button) return;
  button.textContent = playing ? "❚❚ Пауза" : "▶ Воспроизвести";
  button.setAttribute("aria-pressed", String(playing));
}

function stopPreviewPlayback() {
  if (playbackRequestId !== null) cancelAnimationFrame(playbackRequestId);
  playbackRequestId = null;
  setPreviewPlaybackButton(false);
}

function paintPreviewFrame() {
  previewFrameRenderer?.(frame);
  root.querySelector("#browser-export-scrub").value = String(frame);
}

function startPreviewPlayback() {
  if (rendering || !previewPlan || preview.durationFrames < 2) return;
  const lastFrame = preview.durationFrames - 1;
  if (frame >= lastFrame) frame = 0;
  playbackStartFrame = frame;
  playbackStartedAt = performance.now();
  setPreviewPlaybackButton(true);

  const tick = now => {
    if (playbackRequestId === null) return;
    frame = getPreviewPlaybackFrame({
      startFrame: playbackStartFrame,
      elapsedMs: now - playbackStartedAt,
      sourceFps: previewPlan.sourceFps,
      totalFrames: preview.durationFrames
    });
    paintPreviewFrame();
    if (frame >= lastFrame) {
      playbackRequestId = null;
      setPreviewPlaybackButton(false);
      return;
    }
    playbackRequestId = requestAnimationFrame(tick);
  };

  playbackRequestId = requestAnimationFrame(tick);
}

function updatePreview() {
  stopPreviewPlayback();
  preview = buildExportPreview(settings, people);
  frame = Math.min(frame, Math.max(0, preview.durationFrames - 1));
  previewPlan = buildBrowserRenderPlan(preview.story, settings.aspectRatio);
  const canvas = root.querySelector("#browser-export-frame");
  canvas.width = previewPlan.width;
  canvas.height = previewPlan.height;
  previewFrameRenderer = background
    ? createBrowserCanvasFrameRenderer({ canvas, story: preview.story, backgroundImage: background })
    : null;
  paintPreviewFrame();
  root.querySelector("#browser-export-scrub").max = String(Math.max(0, preview.durationFrames - 1));
  root.querySelector("#browser-export-play").disabled = preview.durationFrames < 2 || rendering;
  root.querySelector(".browser-export-summary").innerHTML = [
    `${preview.sceneCount} сцен`, `${preview.peopleCount} человек`, timeLabel(preview.durationSeconds),
    `${previewPlan.width} × ${previewPlan.height} · ${previewPlan.fps} кадр/с`
  ].map(value => `<span>${escapeHtml(value)}</span>`).join("");
  root.querySelector("#browser-export-start").disabled = !support.supported || !background || rendering;
  root.querySelector("#browser-export-mime").textContent = support.mimeType
    ? `Локальный формат записи: ${support.mimeType.split(";")[0]}.`
    : "Браузер сам выберет доступный формат файла.";
}

function renderShell() {
  const options = people.map(person => `<option value="${escapeHtml(person.id)}"${person.id === settings.selectedPersonId ? " selected" : ""}>${escapeHtml(person.name)} · поколение ${escapeHtml(person.generation)}</option>`).join("");
  const formatButtons = Object.entries(VIDEO_FORMATS).map(([ratio, format]) => `
    <button type="button" data-ratio="${ratio}" aria-pressed="${settings.aspectRatio === ratio}">
      <strong>${ratio}</strong><small>${escapeHtml(format.label)}</small>
    </button>`).join("");
  root.innerHTML = `
    <div class="browser-export-shell">
      <header class="browser-export-header">
        <a class="browser-export-brand" href="/drewo/waydean-preview.html?state=all-tree" aria-label="Вернуться к семейному древу">
          <span class="brand-mark" aria-hidden="true">✦</span><span><strong>WAYDEAN</strong><small>СЕМЕЙНОЕ ДРЕВО</small></span>
        </a>
        <a class="browser-export-back" href="/drewo/waydean-preview.html?state=all-tree"><span aria-hidden="true">←</span> Назад к древу</a>
        <span class="browser-export-badge"><i></i> РЕНДЕР НА УСТРОЙСТВЕ</span>
      </header>
      <section class="browser-export-intro">
        <span class="browser-export-eyebrow">МОБИЛЬНЫЙ ЭКСПОРТ · ${people.length} ЗАПИСЕЙ</span>
        <h1>История рода в видео</h1>
        <p>Кадры собираются и записываются прямо в браузере. Данные дерева остаются на устройстве.</p>
      </section>
      ${handoff ? "" : `<p class="browser-export-demo-note" role="status">Открыта локальная демонстрация HOTI. Чтобы экспортировать своё дерево, переходите сюда из загруженного дерева.</p>`}
      <div class="browser-export-grid">
        <section class="browser-export-preview" aria-label="Предпросмотр кадра">
          <div class="browser-export-canvas-wrap"><canvas id="browser-export-frame" aria-label="Кадр выбранной сцены"></canvas></div>
          <div class="browser-export-timeline-controls">
            <button id="browser-export-play" type="button" aria-label="Воспроизвести предпросмотр видео" aria-pressed="false">▶ Воспроизвести</button>
            <label class="browser-export-frame">Сцена и кадр<input id="browser-export-scrub" type="range" min="0" max="${Math.max(0, preview.durationFrames - 1)}" value="0" aria-label="Кадр сцены"></label>
          </div>
          <div class="browser-export-summary" aria-label="Параметры видео"></div>
        </section>
        <section class="browser-export-controls" aria-label="Настройки видео">
          <label class="browser-export-field">Название истории<input id="browser-export-title" maxlength="80" value="${escapeHtml(settings.title)}"></label>
          <label class="browser-export-field">Область дерева<select id="browser-export-scope">
            <option value="all"${settings.scopeType === "all" ? " selected" : ""}>Всё дерево</option>
            <option value="path"${settings.scopeType === "path" ? " selected" : ""}>Мой путь</option>
            <option value="branch"${settings.scopeType === "branch" ? " selected" : ""}>Моя ветвь</option>
          </select></label>
          <label class="browser-export-field">Центральный человек<select id="browser-export-person">${options}</select></label>
          <div class="browser-export-formats" role="group" aria-label="Формат кадра">${formatButtons}</div>
          <label class="browser-export-dates"><input id="browser-export-dates" type="checkbox"${settings.includeDates ? " checked" : ""}> Показывать даты в кадрах</label>
          <div class="browser-export-sound-control">
            <label class="browser-export-field" for="browser-export-sound">Звук переходов<select id="browser-export-sound">
              <option value="click" selected>Приятный щелчок</option>
              <option value="none">Без звука</option>
            </select></label>
            <button type="button" class="browser-export-sound-preview">Прослушать</button>
          </div>
          <p class="browser-export-sound-status" role="status">Короткий мягкий щелчок звучит при появлении подсветки следующей карточки.</p>
          <div class="browser-export-local-note"><strong>Только на этом устройстве</strong><span>Браузер записывает видео в реальном времени; длинный ролик может занять несколько минут. Не закрывайте вкладку. Для большого дерева начните с ветви.</span></div>
          <button id="browser-export-start" type="button" class="browser-export-start">Создать видео на устройстве</button>
          <div class="browser-export-progress" role="progressbar" aria-label="Рендер видео" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
          <button type="button" class="browser-export-cancel" hidden>Остановить</button>
          <p id="browser-export-mime" class="browser-export-note"></p>
          <p class="browser-export-error" role="alert" hidden></p>
          <p class="browser-export-unsupported" role="status" hidden></p>
          <div class="browser-export-ready" hidden></div>
        </section>
      </div>
    </div>`;
  bindEvents();
  updatePreview();
}

function bindEvents() {
  root.querySelector("#browser-export-title").addEventListener("input", event => update({ title: event.currentTarget.value }));
  root.querySelector("#browser-export-scope").addEventListener("change", event => update({ scopeType: event.currentTarget.value }));
  root.querySelector("#browser-export-person").addEventListener("change", event => update({ selectedPersonId: event.currentTarget.value }));
  root.querySelector("#browser-export-dates").addEventListener("change", event => update({ includeDates: event.currentTarget.checked }));
  root.querySelector("#browser-export-sound").addEventListener("change", event => {
    transitionSoundStyle = event.currentTarget.value;
    clearVideo();
    root.querySelector(".browser-export-sound-preview").disabled = transitionSoundStyle === "none";
    root.querySelector(".browser-export-sound-status").textContent = transitionSoundStyle === "none"
      ? "Звук переходов отключён."
      : "Короткий мягкий щелчок прозвучит при появлении подсветки следующей карточки.";
  });
  root.querySelector(".browser-export-sound-preview").addEventListener("click", () => void previewTransitionSound());
  root.querySelector("#browser-export-play").addEventListener("click", () => {
    if (playbackRequestId !== null) stopPreviewPlayback();
    else startPreviewPlayback();
  });
  root.querySelectorAll("[data-ratio]").forEach(button => button.addEventListener("click", () => {
    settings = normalizeExportSettings({ ...settings, aspectRatio: button.dataset.ratio }, people);
    root.querySelectorAll("[data-ratio]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    clearVideo(); updatePreview();
  }));
  root.querySelector("#browser-export-scrub").addEventListener("input", event => {
    stopPreviewPlayback();
    frame = Number(event.currentTarget.value);
    paintPreviewFrame();
  });
  root.querySelector("#browser-export-start").addEventListener("click", () => void startExport());
  root.querySelector(".browser-export-cancel").addEventListener("click", () => renderController?.abort());
}

function update(patch) {
  settings = normalizeExportSettings({ ...settings, ...patch }, people);
  clearVideo(); updatePreview();
}

function showError(message) {
  const error = root.querySelector(".browser-export-error");
  error.textContent = message;
  error.hidden = !message;
}

function updateProgress(current, total) {
  const percent = Math.round(current / total * 100);
  const progress = root.querySelector(".browser-export-progress");
  progress.setAttribute("aria-valuenow", String(percent));
  progress.querySelector("i").style.width = `${percent}%`;
  root.querySelector("#browser-export-start").textContent = `Создаём видео · ${percent}%`;
}

async function stopSoundPreview() {
  window.clearTimeout(soundPreviewTimer);
  soundPreviewTimer = 0;
  const player = soundPreviewPlayer;
  soundPreviewPlayer = null;
  await player?.close();
}

async function previewTransitionSound() {
  if (transitionSoundStyle === "none") return;
  await stopSoundPreview();
  const player = createTransitionAudioTrack({ style: transitionSoundStyle, monitor: true });
  const status = root.querySelector(".browser-export-sound-status");
  if (!player) {
    status.textContent = "Предпрослушивание звука не поддерживается этим браузером.";
    return;
  }
  try {
    soundPreviewPlayer = player;
    await player.resume();
    player.playCue();
    status.textContent = "Воспроизводится короткий мягкий щелчок.";
    soundPreviewTimer = window.setTimeout(() => {
      void stopSoundPreview();
      status.textContent = "Короткий мягкий щелчок звучит при появлении подсветки следующей карточки.";
    }, 300);
  } catch {
    await stopSoundPreview();
    status.textContent = "Не удалось воспроизвести звук перехода.";
  }
}

async function startExport() {
  const canvas = root.querySelector("#browser-export-frame");
  if (!canvas || !background || !support.supported) return;
  const plan = buildBrowserRenderPlan(preview.story, settings.aspectRatio);
  const drawFrame = createBrowserCanvasFrameRenderer({ canvas, story: preview.story, backgroundImage: background });
  stopPreviewPlayback();
  const audioPlayer = createTransitionAudioTrack({ style: transitionSoundStyle });
  const cueFrames = new Set(getTransitionCueFrames(preview.story.timeline.shots, {
    sourceFps: plan.sourceFps,
    fps: plan.fps,
    totalFrames: plan.totalFrames,
    transitionFrames: preview.story.timeline.transitionFrames
  }));
  renderController = new AbortController();
  rendering = true;
  root.querySelector("#browser-export-start").disabled = true;
  root.querySelector("#browser-export-play").disabled = true;
  root.querySelector(".browser-export-cancel").hidden = false;
  root.querySelector("#browser-export-scrub").disabled = true;
  showError(""); updateProgress(0, plan.totalFrames);
  try {
    if (transitionSoundStyle !== "none" && !audioPlayer) {
      root.querySelector(".browser-export-sound-status").textContent = "В этом браузере звуковая дорожка недоступна; видео будет без звука.";
    }
    await audioPlayer?.resume();
    videoBlob = await recordCanvasVideo({
      canvas, totalFrames: plan.totalFrames, fps: plan.fps, signal: renderController.signal,
      audioTracks: audioPlayer?.audioTracks,
      drawFrame: outputFrame => {
        drawFrame(getSourceFrameForBrowserExport(outputFrame, plan));
        if (cueFrames.has(outputFrame)) audioPlayer?.playCue();
      },
      onProgress: (current, total) => { if (current % plan.fps === 0 || current === total) updateProgress(current, total); }
    });
    videoUrl = URL.createObjectURL(videoBlob);
    const extension = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    const fileName = `waydean-family-story.${extension}`;
    const ready = root.querySelector(".browser-export-ready");
    ready.hidden = false;
    ready.innerHTML = `<strong>Видео готово</strong><video controls playsinline></video><button type="button" class="browser-export-start">Сохранить в Фото или Файлы</button><a download="${fileName}">Скачать видео</a>`;
    ready.querySelector("video").src = videoUrl;
    ready.querySelector("a").href = videoUrl;
    ready.querySelector("button").addEventListener("click", () => void saveVideo(fileName));
    updateProgress(plan.totalFrames, plan.totalFrames);
  } catch (error) {
    showError(error instanceof DOMException && error.name === "AbortError" ? "Экспорт остановлен." : error instanceof Error ? error.message : "Не удалось создать видео на этом устройстве.");
  } finally {
    try { await audioPlayer?.close(); } catch { /* retain the video result if browser audio teardown fails */ }
    rendering = false; renderController = null;
    root.querySelector("#browser-export-start").disabled = !support.supported || !background;
    root.querySelector("#browser-export-start").textContent = "Создать видео на устройстве";
    root.querySelector("#browser-export-play").disabled = preview.durationFrames < 2;
    root.querySelector(".browser-export-cancel").hidden = true;
    root.querySelector("#browser-export-scrub").disabled = false;
  }
}

async function saveVideo(fileName) {
  if (!videoBlob || !videoUrl) return;
  try {
    const file = new File([videoBlob], fileName, { type: videoBlob.type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: settings.title });
      return;
    }
    const link = document.createElement("a"); link.href = videoUrl; link.download = fileName; link.click();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) showError("Не удалось открыть сохранение. Используйте ссылку «Скачать видео».");
  }
}

function showSupport() {
  support = getBrowserVideoSupport({ canvas: root.querySelector("#browser-export-frame") });
  if (!support.supported) {
    const note = root.querySelector(".browser-export-unsupported");
    note.textContent = `${support.reason} Попробуйте актуальный Safari или Chrome.`;
    note.hidden = false;
  }
  updatePreview();
}

function loadBackground() {
  const image = new Image();
  image.onload = () => { background = image; updatePreview(); };
  image.onerror = () => showError("Не удалось загрузить изображение фона. Проверьте, что файл семейного дерева открыт по HTTPS.");
  image.src = new URL("./remotion-preview/public/waydean-cinematic-background.png", window.location.href).href;
}

renderShell();
showSupport();
loadBackground();
