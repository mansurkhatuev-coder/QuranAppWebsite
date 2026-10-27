import { buildExportPreview, DEFAULT_EXPORT_SETTINGS, normalizeExportSettings } from "./remotion-preview/src/export-studio-model.mjs";
import {
  chooseVideoBitrate,
  getBrowserVideoSupport,
  getRecordedVideoDurationIssue,
  readVideoExportHandoff,
  recordCanvasVideo
} from "./remotion-preview/src/browser-export-model.mjs?v=20261018-wall-clock-duration-1";
import { createWaydeanVideoLink, listWaydeanVideos, uploadWaydeanVideo } from "./browser-video-storage.mjs?v=20261016-account-upload";
import {
  buildBrowserRenderPlan,
  createBrowserCanvasFrameRenderer,
  getSourceFrameForBrowserExport
} from "./remotion-preview/src/browser-canvas-renderer.mjs?v=20261027-tree-orthogonal-connectors-1";
import { createTransitionAudioBuffer, createTransitionAudioTrack, getTransitionCueFrames } from "./browser-transition-sound.mjs?v=20261018-timestamped-audio";
import { VIDEO_FORMATS } from "./remotion-preview/src/composition-config.mjs";
import { getPreviewPlaybackFrame } from "./preview-playback.mjs?v=20261015-preview-play";

const root = document.getElementById("browser-export-root");
const handoff = readVideoExportHandoff(window.sessionStorage);
const requiresTreeHandoff = new URLSearchParams(window.location.search).get("source") === "tree";
if (requiresTreeHandoff && !handoff) {
  const error = new Error("WAYDEAN_TREE_HANDOFF_MISSING");
  error.name = "WaydeanTreeHandoffMissingError";
  throw error;
}
const DEMO_PEOPLE = [
  { id: "demo-1", name: "Первое поколение", generation: 1, parent: null, born: 1880, died: null },
  { id: "demo-2", name: "Следующее поколение", generation: 2, parent: "demo-1", born: 1907, died: null },
  { id: "demo-3", name: "Продолжение рода", generation: 3, parent: "demo-2", born: 1934, died: null },
  { id: "demo-4", name: "Новая ветвь", generation: 4, parent: "demo-3", born: 1961, died: null }
];
const people = handoff?.tree.people?.length ? handoff.tree.people : DEMO_PEOPLE;
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
let videoObjectPath = "";
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
  videoObjectPath = "";
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = "";
  const ready = root.querySelector(".browser-export-ready");
  ready.hidden = true;
  ready.replaceChildren();
}

function setPreviewPlaybackButton(playing) {
  const button = root.querySelector("#browser-export-play");
  if (!button) return;
  const icon = playing
    ? '<svg viewBox="0 0 20 20" focusable="false"><path d="M6 4.5h3v11H6zm5 0h3v11h-3z"/></svg>'
    : '<svg viewBox="0 0 20 20" focusable="false"><path d="M6.5 3.8a.8.8 0 0 1 1.2-.7l9 6.1a1 1 0 0 1 0 1.6l-9 6.1a.8.8 0 0 1-1.2-.7z"/></svg>';
  button.innerHTML = '<span class="browser-export-play-icon" aria-hidden="true">' + icon + '</span><span class="browser-export-play-label">' + (playing ? "Пауза" : "Воспроизвести") + '</span>';
  button.setAttribute("aria-label", playing ? "Приостановить предпросмотр видео" : "Воспроизвести предпросмотр видео");
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
        <a class="browser-export-brand" href="/drewo/waydean-preview.html?state=all-tree" target="_top" aria-label="Вернуться к семейному древу">
          <span class="brand-mark" aria-hidden="true">✦</span><span><strong>WAYDEAN</strong><small>СЕМЕЙНОЕ ДРЕВО</small></span>
        </a>
        <a class="browser-export-back" href="/drewo/waydean-preview.html?state=all-tree" target="_top"><span aria-hidden="true">←</span> Назад к древу</a>
        <span class="browser-export-badge"><i></i> РЕНДЕР НА УСТРОЙСТВЕ</span>
      </header>
      <section class="browser-export-intro">
        <span class="browser-export-eyebrow">МОБИЛЬНЫЙ ЭКСПОРТ · ${people.length} ЗАПИСЕЙ</span>
        <h1>История рода в видео</h1>
        <p>Видео рендерится на телефоне и после записи автоматически загружается в закрытый раздел вашего аккаунта.</p>
      </section>
      ${handoff ? "" : `<p class="browser-export-demo-note" role="status">Открыт демонстрационный пример. Откройте экспорт из загруженного дерева, чтобы создать видео своей семьи.</p>`}
      <div class="browser-export-grid">
        <section class="browser-export-preview" aria-label="Предпросмотр кадра">
          <div class="browser-export-canvas-wrap"><canvas id="browser-export-frame" aria-label="Кадр выбранной сцены"></canvas></div>
          <div class="browser-export-timeline-controls">
            <button id="browser-export-play" class="browser-export-play" type="button" aria-label="Воспроизвести предпросмотр видео" aria-pressed="false"><span class="browser-export-play-icon" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M6.5 3.8a.8.8 0 0 1 1.2-.7l9 6.1a1 1 0 0 1 0 1.6l-9 6.1a.8.8 0 0 1-1.2-.7z"/></svg></span><span class="browser-export-play-label">Воспроизвести</span></button>
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
              <option value="whoosh">Кинематографичный «вжух»</option>
              <option value="none">Без звука</option>
            </select></label>
            <button type="button" class="browser-export-sound-preview">Прослушать</button>
          </div>
          <p class="browser-export-sound-status" role="status">Короткий мягкий щелчок звучит при появлении подсветки следующей карточки.</p>
          <div class="browser-export-local-note"><strong>Рендер на телефоне · сохранение в аккаунте</strong><span>Видео собирается в реальном времени и загружается после записи. Не закрывайте страницу. Для длинной истории оставьте экран включённым и подключите стабильный Wi‑Fi. В аккаунт загружаются ролики до 50 МБ; готовый файл можно сохранить в Фото или Файлы.</span></div>
          <button id="browser-export-start" type="button" class="browser-export-start">Создать видео на устройстве</button>
          <div class="browser-export-progress" role="progressbar" aria-label="Рендер видео" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
          <button type="button" class="browser-export-cancel" hidden>Остановить</button>
          <p id="browser-export-mime" class="browser-export-note"></p>
          <p class="browser-export-error" role="alert" hidden></p>
          <p class="browser-export-unsupported" role="status" hidden></p>
          <div class="browser-export-ready" hidden></div>
        </section>
      </div>
      <section class="browser-export-library" aria-label="Видео в аккаунте" hidden>
        <div class="browser-export-library-heading"><h2>Видео в аккаунте</h2><p class="browser-export-library-status" role="status"></p></div>
        <div class="browser-export-library-items"></div>
      </section>
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
    root.querySelector(".browser-export-sound-status").textContent = getSoundDescription(transitionSoundStyle);
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

function getSoundDescription(style) {
  if (style === "none") return "Звук переходов отключён.";
  if (style === "whoosh") return "Мягкий кинематографичный «вжух» совпадает с появлением подсветки следующей карточки.";
  return "Короткий мягкий щелчок прозвучит при появлении подсветки следующей карточки.";
}

function inspectRecordedDuration(blob) {
  return new Promise(resolve => {
    let objectUrl = "";
    let video;
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    };
    const timer = window.setTimeout(() => finish(null), 5000);
    try {
      video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => finish(video.duration);
      video.onerror = () => finish(null);
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
    } catch {
      finish(null);
    }
  });
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
  const player = await createTransitionAudioTrack({ style: transitionSoundStyle, monitor: true });
  const status = root.querySelector(".browser-export-sound-status");
  if (!player) {
    status.textContent = "Предпрослушивание звука не поддерживается этим браузером.";
    return;
  }
  try {
    soundPreviewPlayer = player;
    await player.resume();
    player.playCue();
    status.textContent = transitionSoundStyle === "whoosh" ? "Воспроизводится «вжух» для перехода." : "Воспроизводится короткий мягкий щелчок.";
    soundPreviewTimer = window.setTimeout(() => {
      void stopSoundPreview();
      status.textContent = getSoundDescription(transitionSoundStyle);
    }, Math.max(300, player.duration * 1000 + 180));
  } catch {
    await stopSoundPreview();
    status.textContent = "Не удалось воспроизвести звук перехода.";
  }
}

async function startExport() {
  const canvas = root.querySelector("#browser-export-frame");
  if (!canvas || !background || !support.supported) return;
  clearVideo();
  const plan = buildBrowserRenderPlan(preview.story, settings.aspectRatio);
  const drawFrame = createBrowserCanvasFrameRenderer({ canvas, story: preview.story, backgroundImage: background });
  stopPreviewPlayback();
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
  let wakeLock = null;
  let audioPlayer = null;
  try {
    try { wakeLock = await navigator.wakeLock?.request?.("screen"); } catch { wakeLock = null; }
    root.querySelector("#browser-export-start").textContent = "Готовим точный рендер…";
    const { canEncodeTimestampedMp4, encodeTimestampedMp4 } = await import("./assets/browser-encoder/browser-local-encoder.js?v=20261018-timestamped-mp4");
    const expectedDuration = plan.totalFrames / plan.fps;
    const videoBitrate = chooseVideoBitrate({ durationSeconds: expectedDuration });
    const timestampedMp4Supported = await canEncodeTimestampedMp4({
      width: plan.width, height: plan.height, bitrate: videoBitrate, includeAudio: transitionSoundStyle !== "none"
    });
    const drawOutputFrame = outputFrame => drawFrame(getSourceFrameForBrowserExport(outputFrame, plan));
    let recordedBlob;
    if (timestampedMp4Supported) {
      const audioBuffer = transitionSoundStyle === "none" ? null : await createTransitionAudioBuffer({
        style: transitionSoundStyle,
        cueTimes: [...cueFrames].map(outputFrame => outputFrame / plan.fps),
        durationSeconds: expectedDuration
      });
      if (transitionSoundStyle !== "none" && !audioBuffer) {
        root.querySelector(".browser-export-sound-status").textContent = "Не удалось подготовить звуковую дорожку; видео будет без звука.";
      }
      recordedBlob = await encodeTimestampedMp4({
        canvas, totalFrames: plan.totalFrames, fps: plan.fps, bitrate: videoBitrate, audioBuffer,
        signal: renderController.signal,
        drawFrame: drawOutputFrame,
        onProgress: (current, total) => { if (current % plan.fps === 0) updateProgress(current, total); }
      });
    } else {
      audioPlayer = await createTransitionAudioTrack({ style: transitionSoundStyle });
      if (transitionSoundStyle !== "none" && !audioPlayer) {
        root.querySelector(".browser-export-sound-status").textContent = "Не удалось загрузить выбранный звук; видео будет без звука.";
      }
      await audioPlayer?.resume();
      recordedBlob = await recordCanvasVideo({
        canvas, totalFrames: plan.totalFrames, fps: plan.fps, durationSeconds: expectedDuration, signal: renderController.signal,
        audioTracks: audioPlayer?.audioTracks,
        onTimingWait: () => { root.querySelector("#browser-export-start").textContent = "Завершаем запись видео…"; },
        drawFrame: async outputFrame => {
          drawOutputFrame(outputFrame);
          if (cueFrames.has(outputFrame)) audioPlayer?.playCue();
        },
        onProgress: (current, total) => { if (current % plan.fps === 0 || current === total) updateProgress(current, total); }
      });
    }
    const actualDuration = await inspectRecordedDuration(recordedBlob);
    const durationIssue = getRecordedVideoDurationIssue(actualDuration, expectedDuration);
    if (durationIssue) {
      showError(durationIssue === "unknown"
        ? "Браузер не подтвердил длительность записи. Файл не будет показан или загружен. Повторите рендер, не сворачивая страницу."
        : durationIssue === "too-long"
          ? `Браузер вернул аномальную длительность файла (ожидалось около ${timeLabel(expectedDuration)}). Файл не сохранён и не загружен. Повторите рендер после обновления страницы.`
          : `Запись получилась ускоренной: ${timeLabel(actualDuration)} вместо ${timeLabel(expectedDuration)}. Файл отброшен, загрузки не было. Повторите рендер, оставив страницу открытой.`);
      return;
    }
    videoBlob = recordedBlob;
    videoUrl = URL.createObjectURL(videoBlob);
    const extension = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    const fileName = `waydean-family-story.${extension}`;
    const ready = root.querySelector(".browser-export-ready");
    ready.hidden = false;
    ready.innerHTML = `<strong>Видео готово</strong><video controls playsinline></video><button type="button" class="browser-export-start browser-export-save-local">Сохранить в Фото или Файлы</button><a class="browser-export-download" download="${fileName}">Скачать видео</a><section class="browser-export-account-upload" aria-live="polite"><div class="browser-export-upload-heading"><strong>Сохранение в аккаунт</strong><span class="browser-export-upload-status">Готовим защищённую загрузку…</span></div><div class="browser-export-upload-progress" role="progressbar" aria-label="Загрузка видео в аккаунт" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><a class="browser-export-account-login" href="/admin/" target="_blank" rel="noopener" hidden>Войти в аккаунт Waydean</a><a class="browser-export-account-link" target="_blank" rel="noopener" hidden>Открыть сохранённое видео</a><button type="button" class="browser-export-start browser-export-retry" hidden>Повторить загрузку</button></section>`;
    ready.querySelector("video").src = videoUrl;
    ready.querySelector(".browser-export-download").href = videoUrl;
    ready.querySelector(".browser-export-save-local").addEventListener("click", () => void saveVideo(fileName));
    updateProgress(plan.totalFrames, plan.totalFrames);
    root.querySelector(".browser-export-cancel").hidden = true;
    await uploadVideoToAccount(fileName);
  } catch (error) {
    showError(error instanceof DOMException && error.name === "AbortError" ? "Экспорт остановлен." : error instanceof Error ? error.message : "Не удалось создать видео на этом устройстве.");
  } finally {
    try { await wakeLock?.release?.(); } catch { /* screen lock is optional */ }
    try { await audioPlayer?.close(); } catch { /* retain the video result if browser audio teardown fails */ }
    rendering = false; renderController = null;
    root.querySelector("#browser-export-start").disabled = !support.supported || !background;
    root.querySelector("#browser-export-start").textContent = "Создать видео на устройстве";
    root.querySelector("#browser-export-play").disabled = preview.durationFrames < 2;
    root.querySelector(".browser-export-cancel").hidden = true;
    root.querySelector("#browser-export-scrub").disabled = false;
  }
}

async function uploadVideoToAccount(fileName) {
  if (!videoBlob) return;
  const section = root.querySelector(".browser-export-account-upload");
  const status = section?.querySelector(".browser-export-upload-status");
  const progress = section?.querySelector(".browser-export-upload-progress");
  const retry = section?.querySelector(".browser-export-retry");
  const login = section?.querySelector(".browser-export-account-login");
  const link = section?.querySelector(".browser-export-account-link");
  if (!section || !status || !progress || !retry || !login || !link) return;
  section.hidden = false;
  retry.hidden = true;
  login.hidden = true;
  link.hidden = true;
  status.textContent = "Загружаем видео в закрытый раздел аккаунта…";
  progress.setAttribute("aria-valuenow", "0");
  progress.querySelector("i").style.width = "0%";
  try {
    const result = await uploadWaydeanVideo({
      blob: videoBlob,
      fileName,
      title: settings.title,
      objectPath: videoObjectPath,
      client: window.AdminSupabase?.getClient?.(),
      config: window.SUPABASE_CONFIG,
      tusClient: window.tus,
      onObjectPath: path => { videoObjectPath = path; },
      onProgress: (uploaded, total) => {
        const percent = total ? Math.min(100, Math.round(uploaded / total * 100)) : 0;
        progress.setAttribute("aria-valuenow", String(percent));
        progress.querySelector("i").style.width = `${percent}%`;
        status.textContent = `Загружаем в аккаунт · ${percent}%`;
      }
    });
    progress.setAttribute("aria-valuenow", "100");
    progress.querySelector("i").style.width = "100%";
    status.textContent = "Видео сохранено в аккаунте. Временная ссылка действует 7 дней.";
    videoObjectPath = result.path;
    link.href = result.signedUrl;
    link.hidden = false;
    await loadVideoLibrary();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Не удалось сохранить видео в аккаунте. Видео пока доступно на этой странице — сохраните его в Фото или Файлы.";
    if (error?.uploaded) status.textContent = "Видео уже сохранено в закрытом разделе аккаунта, но временную ссылку не удалось создать.";
    login.hidden = error?.code !== "WAYDEAN_VIDEO_AUTH_REQUIRED";
    retry.hidden = Boolean(error?.uploaded);
    retry.onclick = error?.uploaded ? null : () => void uploadVideoToAccount(fileName);
  }
}

async function loadVideoLibrary() {
  const section = root.querySelector(".browser-export-library");
  const status = section?.querySelector(".browser-export-library-status");
  const items = section?.querySelector(".browser-export-library-items");
  if (!section || !status || !items) return;
  try {
    const videos = await listWaydeanVideos({ client: window.AdminSupabase?.getClient?.(), limit: 20 });
    if (videos.length === 0 && !videoBlob) return;
    section.hidden = false;
    status.textContent = videos.length ? `${videos.length} сохранено` : "Сохранённых видео пока нет.";
    if (!videos.length) {
      items.replaceChildren();
      return;
    }
    items.innerHTML = videos.map(video => {
      const date = video.createdAt ? new Date(video.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "";
      const size = video.sizeBytes ? `${Math.max(1, Math.round(video.sizeBytes / (1024 * 1024)))} МБ` : "";
      const title = video.title || "История семьи";
      return `<article class="browser-export-library-item"><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml([date, size].filter(Boolean).join(" · "))}</small></div><button type="button" class="browser-export-library-open" data-video-path="${escapeHtml(video.path)}">Открыть</button></article>`;
    }).join("");
    items.querySelectorAll("[data-video-path]").forEach(button => button.addEventListener("click", () => void openLibraryVideo(button.dataset.videoPath, button)));
  } catch {
    section.hidden = true;
  }
}

async function openLibraryVideo(path, button) {
  const popup = window.open("about:blank", "_blank");
  const section = root.querySelector(".browser-export-library");
  const status = section?.querySelector(".browser-export-library-status");
  if (!popup) {
    if (status) status.textContent = "Разрешите новое окно и нажмите «Открыть» ещё раз.";
    return;
  }
  popup.opener = null;
  button.disabled = true;
  try {
    const signedUrl = await createWaydeanVideoLink({ client: window.AdminSupabase?.getClient?.(), path });
    popup.location.replace(signedUrl);
  } catch {
    popup.close();
    if (status) status.textContent = "Не удалось открыть это видео. Войдите в аккаунт и повторите попытку.";
  } finally {
    button.disabled = false;
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
  const timestampedEncoderAvailable = typeof globalThis.VideoEncoder === "function"
    && typeof globalThis.VideoFrame === "function";
  if (!support.supported && timestampedEncoderAvailable) {
    support = { supported: true, mimeType: "video/mp4", reason: "" };
  }
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
void loadVideoLibrary();
