import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { makeCancelSignal } from "@remotion/renderer";
import { HOTI_PEOPLE } from "../hoti-people.mjs";
import { REMOTION_COMPOSITION } from "./src/composition-config.mjs";
import { configureRenderTempDirectory } from "./src/render-temp-directory.mjs";
import {
  getLocalRenderConcurrency,
  isValidRenderJobId,
  LOCAL_RENDER_SCALE,
  normalizeRenderSettings
} from "./src/render-job-model.mjs";
import { pipeRenderDownload } from "./src/render-download.mjs";
import { createRenderJobStore } from "./src/render-job-store.mjs";
import { isAllowedLocalRequest } from "./request-origin-guard.mjs";

const projectDirectory = path.dirname(fileURLToPath(import.meta.url));
const prototypeDirectory = path.resolve(projectDirectory, "..");
const port = Number(process.env.WAYDEAN_EXPORT_STUDIO_PORT || 8781);
const require = createRequire(import.meta.url);
const validPersonIds = new Set(HOTI_PEOPLE.map(person => person.id));
const renderTempDirectory = configureRenderTempDirectory(process.env, tmpdir());
const renderBundleDirectory = path.join(renderTempDirectory, `waydean-remotion-bundle-${process.pid}`);
const renderOutputDirectory = path.join(renderTempDirectory, "waydean-local-renders");
const renderJobStore = await createRenderJobStore({
  directory: path.join(renderTempDirectory, "waydean-local-render-jobs"),
  outputDirectory: renderOutputDirectory,
  validPersonIds,
  maxQueued: 3
});
let activeRenderJobId = null;
let drainPromise = null;
const activeCancellations = new Map();
let renderBundlePromise = null;
const renderBrowserExecutable = [
  process.env.WAYDEAN_REMOTION_BROWSER,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe")
].find(candidate => candidate && existsSync(candidate));

function sendJson(response, statusCode, data) {
  const body = Buffer.from(JSON.stringify(data));
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.byteLength,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function readJsonBody(request, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

async function getRenderBundle(job) {
  if (!renderBundlePromise) {
    const { bundle } = await import("@remotion/bundler");
    renderBundlePromise = bundle({
      entryPoint: path.join(projectDirectory, "src/index.ts"),
      outDir: renderBundleDirectory,
      rootDir: projectDirectory,
      publicDir: path.join(projectDirectory, "public"),
      enableCaching: false,
      onProgress: progress => {
        job.progress = Math.min(0.08, Math.max(0, progress * 0.08));
        job.stage = "Подготовка композиции";
      }
    }).catch(error => {
      renderBundlePromise = null;
      throw error;
    });
  }
  return renderBundlePromise;
}

function outputPathFor(id) {
  return path.join(renderOutputDirectory, `${id}.mp4`);
}

function scheduleQueueDrain() {
  if (drainPromise) return drainPromise;
  drainPromise = (async () => {
    while (true) {
      const job = renderJobStore.nextQueued();
      if (!job) break;
      activeRenderJobId = job.id;
      await renderJob(job);
      activeRenderJobId = null;
    }
  })().catch(error => {
    process.stderr.write(`[waydean-render-queue] ${String(error?.message || error).split("\n")[0]}\n`);
  }).finally(() => {
    drainPromise = null;
    if (renderJobStore.nextQueued()) void scheduleQueueDrain();
  });
  return drainPromise;
}

async function renderJob(job) {
  const outputPath = outputPathFor(job.id);
  const { cancelSignal, cancel } = makeCancelSignal();
  activeCancellations.set(job.id, { cancel, signal: cancelSignal, requested: false, progressPersistedAt: 0 });
  await renderJobStore.update(job.id, { status: "bundling", stage: "Подготовка композиции", progress: 0.01 });

  try {
    if (!renderBrowserExecutable) {
      throw new Error("Install Chrome or Edge, or set WAYDEAN_REMOTION_BROWSER to its executable path");
    }
    await mkdir(renderTempDirectory, { recursive: true });
    await mkdir(renderOutputDirectory, { recursive: true });
    const { renderMedia, selectComposition } = await import("@remotion/renderer");
    const serveUrl = await getRenderBundle(job);
    const cancellation = activeCancellations.get(job.id);
    if (cancellation?.requested) throw new Error("RENDER_CANCELLED");
    const composition = await selectComposition({
      serveUrl,
      id: REMOTION_COMPOSITION.id,
      inputProps: job.settings,
      browserExecutable: renderBrowserExecutable,
      logLevel: "error"
    });
    if (activeCancellations.get(job.id)?.requested) throw new Error("RENDER_CANCELLED");
    await renderJobStore.update(job.id, { status: "rendering", stage: "Рендер кадров" });

    await renderMedia({
      composition,
      serveUrl,
      inputProps: job.settings,
      codec: "h264",
      outputLocation: outputPath,
      cancelSignal,
      browserExecutable: renderBrowserExecutable,
      concurrency: getLocalRenderConcurrency(process.env),
      scale: LOCAL_RENDER_SCALE,
      x264Preset: "fast",
      logLevel: "error",
      onProgress: ({ progress, stitchStage }) => {
        job.progress = 0.08 + Math.max(0, Math.min(1, progress)) * 0.92;
        job.stage = stitchStage === "muxing" ? "Сборка MP4" : "Рендер кадров";
        const cancellation = activeCancellations.get(job.id);
        if (cancellation && Date.now() - cancellation.progressPersistedAt > 1500) {
          cancellation.progressPersistedAt = Date.now();
          void renderJobStore.update(job.id, { progress: job.progress, stage: job.stage });
        }
      }
    });

    await renderJobStore.update(job.id, { status: "completed", progress: 1, stage: "Видео готово" });
  } catch (error) {
    const cancellation = activeCancellations.get(job.id);
    if (cancellation?.requested || error?.message === "RENDER_CANCELLED") {
      await rm(outputPath, { force: true }).catch(() => {});
      await renderJobStore.update(job.id, { status: "cancelled", stage: "Отменено" });
    } else {
      await renderJobStore.update(job.id, { status: "failed", stage: "Ошибка рендера" });
      process.stderr.write(`[waydean-render] ${String(error?.stack || error)}\n`);
    }
  } finally {
    activeCancellations.delete(job.id);
  }
}

async function handleRenderApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/render") {
    try {
      const job = await renderJobStore.enqueue(await readJsonBody(request));
      sendJson(response, 202, job);
      void scheduleQueueDrain();
    } catch (error) {
      if (error?.code === "QUEUE_FULL") {
        sendJson(response, 429, { error: error.message });
        return;
      }
      const statusCode = error?.statusCode || 400;
      const message = statusCode === 413
        ? "Параметры экспорта слишком велики"
        : "Проверьте параметры истории и выбранного человека";
      sendJson(response, statusCode, { error: message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/render") {
    sendJson(response, 200, renderJobStore.list());
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/render\/([0-9a-f-]{36})\/(retry)$/i);
  if (actionMatch && isValidRenderJobId(actionMatch[1]) && request.method === "POST") {
    let retried;
    try {
      retried = await renderJobStore.retry(actionMatch[1]);
    } catch (error) {
      if (error?.code === "QUEUE_FULL") {
        sendJson(response, 429, { error: error.message });
        return;
      }
      throw error;
    }
    if (!retried) {
      sendJson(response, 409, { error: "Повторить можно только отменённое или неудачное задание" });
      return;
    }
    sendJson(response, 202, retried);
    void scheduleQueueDrain();
    return;
  }

  const downloadMatch = url.pathname.match(/^\/api\/render\/([0-9a-f-]{36})\/download$/i);
  const statusMatch = url.pathname.match(/^\/api\/render\/([0-9a-f-]{36})$/i);
  const match = downloadMatch ?? statusMatch;
  if (!match || !isValidRenderJobId(match[1]) || !["GET", "DELETE"].includes(request.method || "")
    || (request.method === "DELETE" && !statusMatch)) {
    sendJson(response, 404, { error: "Задание не найдено" });
    return;
  }

  if (request.method === "DELETE") {
    const job = await renderJobStore.cancel(match[1]);
    if (!job) {
      sendJson(response, 409, { error: "Это задание уже завершено или недоступно для отмены" });
      return;
    }
    const cancellation = activeCancellations.get(match[1]);
    if (cancellation) {
      cancellation.requested = true;
      if (renderJobStore.getInternal(match[1])?.status === "cancelling") cancellation.cancel();
    }
    sendJson(response, 200, job);
    return;
  }

  const job = renderJobStore.getInternal(match[1]);
  if (!job) {
    sendJson(response, 404, { error: "Задание не найдено" });
    return;
  }

  if (downloadMatch) {
    if (job.status !== "completed") {
      sendJson(response, 409, { error: "Видео ещё не готово" });
      return;
    }
    let fileStat;
    try {
      fileStat = await stat(outputPathFor(job.id));
      if (!fileStat.isFile()) throw new Error("Rendered artifact is not a file");
    } catch {
      await renderJobStore.update(job.id, { status: "failed", stage: "Ошибка рендера" }).catch(() => {});
      sendJson(response, 404, { error: "Локальный файл больше недоступен" });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": fileStat.size,
      "Content-Disposition": `attachment; filename="waydean-history-${job.id.slice(0, 8)}.mp4"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    pipeRenderDownload(createReadStream(outputPathFor(job.id)), response, async () => {
      await renderJobStore.update(job.id, { status: "failed", stage: "Ошибка рендера" });
    });
    return;
  }

  sendJson(response, 200, renderJobStore.get(job.id));
}

const resolveLocalPackages = {
  name: "resolve-local-remotion-packages",
  setup(buildContext) {
    buildContext.onResolve({ filter: /.*/ }, args => {
      if (args.path.startsWith("node:")) return { path: args.path, external: true };

      if (args.path.startsWith("./") || args.path.startsWith("../")) {
        const importPath = args.path.split(/[?#]/, 1)[0];
        const importerPath = path.isAbsolute(args.importer)
          ? args.importer
          : path.resolve(projectDirectory, args.importer);
        const unresolvedPath = path.resolve(path.dirname(importerPath), importPath);
        const candidates = path.extname(unresolvedPath)
          ? [unresolvedPath]
          : [
              unresolvedPath,
              ...[".tsx", ".ts", ".mjs", ".js", ".jsx", ".json", ".cjs"].map(extension => unresolvedPath + extension),
              ...[".tsx", ".ts", ".mjs", ".js", ".jsx", ".json", ".cjs"].map(extension => path.join(unresolvedPath, "index" + extension))
            ];
        const resolvedPath = candidates.find(candidate => existsSync(candidate));
        return resolvedPath
          ? { path: resolvedPath }
          : { errors: [{ text: `Could not resolve local import ${args.path} from ${args.importer}` }] };
      }

      try {
        return { path: require.resolve(args.path, { paths: [projectDirectory] }) };
      } catch {
        return { errors: [{ text: `Could not resolve package import ${args.path}` }] };
      }
    });
  }
};

const [html, css, built] = await Promise.all([
  readFile(path.join(prototypeDirectory, "export-studio.html")),
  readFile(path.join(prototypeDirectory, "export-studio.css")),
  readFile(path.join(projectDirectory, "src/ExportStudio.tsx")).then(contents =>
  build({
    stdin: {
      contents: contents.toString(),
      sourcefile: path.join(projectDirectory, "src/ExportStudio.tsx"),
      resolveDir: path.join(projectDirectory, "src"),
      loader: "tsx"
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    plugins: [resolveLocalPackages],
    logLevel: "info"
  })
  )
]);

const javascript = built.outputFiles[0]?.contents;
if (!javascript) throw new Error("Could not bundle the Remotion export studio");

const background = await readFile(path.join(projectDirectory, "public/waydean-cinematic-background.png"));
const routes = new Map([
  ["/", { body: html, type: "text/html; charset=utf-8" }],
  ["/export-studio.html", { body: html, type: "text/html; charset=utf-8" }],
  ["/export-studio.css", { body: css, type: "text/css; charset=utf-8" }],
  ["/export-studio.js", { body: javascript, type: "text/javascript; charset=utf-8" }],
  ["/assets/waydean-cinematic-background.png", { body: background, type: "image/png" }],
  ["/remotion-preview/public/waydean-cinematic-background.png", { body: background, type: "image/png" }]
]);

const browserExportStaticFiles = [
  ["/browser-export.html", path.join(prototypeDirectory, "browser-export.html"), "text/html; charset=utf-8"],
  ["/browser-export.css", path.join(prototypeDirectory, "browser-export.css"), "text/css; charset=utf-8"],
  ["/browser-export-studio.mjs", path.join(prototypeDirectory, "browser-export-studio.mjs"), "text/javascript; charset=utf-8"],
  ["/hoti-people.mjs", path.join(prototypeDirectory, "hoti-people.mjs"), "text/javascript; charset=utf-8"],
  ["/story.mjs", path.join(prototypeDirectory, "story.mjs"), "text/javascript; charset=utf-8"],
  ["/cinematic-timeline.mjs", path.join(prototypeDirectory, "cinematic-timeline.mjs"), "text/javascript; charset=utf-8"],
  ["/remotion-preview/src/export-studio-model.mjs", path.join(projectDirectory, "src/export-studio-model.mjs"), "text/javascript; charset=utf-8"],
  ["/remotion-preview/src/browser-export-model.mjs", path.join(projectDirectory, "src/browser-export-model.mjs"), "text/javascript; charset=utf-8"],
  ["/remotion-preview/src/browser-canvas-renderer.mjs", path.join(projectDirectory, "src/browser-canvas-renderer.mjs"), "text/javascript; charset=utf-8"],
  ["/remotion-preview/src/composition-config.mjs", path.join(projectDirectory, "src/composition-config.mjs"), "text/javascript; charset=utf-8"],
  ["/remotion-preview/src/project-model.mjs", path.join(projectDirectory, "src/project-model.mjs"), "text/javascript; charset=utf-8"],
  ["/drewo/family-tree.json", path.resolve(prototypeDirectory, "../../../../../drewo/family-tree.json"), "application/json; charset=utf-8"],
  ["/drewo/waydean-preview-model.mjs", path.resolve(prototypeDirectory, "../../../../../drewo/waydean-preview-model.mjs"), "text/javascript; charset=utf-8"]
];
const browserExportAssets = await Promise.all(browserExportStaticFiles.map(async ([url, filePath, type]) => [
  url,
  { body: await readFile(filePath), type }
]));
for (const [url, asset] of browserExportAssets) routes.set(url, asset);

const server = createServer((request, response) => {
  if (!isAllowedLocalRequest({
    host: request.headers.host,
    origin: request.headers.origin,
    port
  })) {
    sendJson(response, 403, { error: "Источник запроса не разрешён" });
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      service: "waydean-local-video-studio",
      version: "2026-10-12-local-1",
      renderAvailable: Boolean(renderBrowserExecutable)
    });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    void handleRenderApi(request, response, url).catch(error => {
      process.stderr.write(`[waydean-render-api] ${String(error?.message || error).split("\n")[0]}\n`);
      if (!response.headersSent) sendJson(response, 500, { error: "Локальный экспорт временно недоступен" });
      else response.destroy();
    });
    return;
  }
  const asset = routes.get(url.pathname);
  if (!asset || !["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": asset.type,
    "Content-Length": asset.body.byteLength,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(request.method === "HEAD" ? undefined : asset.body);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Waydean local export studio: http://127.0.0.1:${port}/\n`);
  void scheduleQueueDrain();
});
