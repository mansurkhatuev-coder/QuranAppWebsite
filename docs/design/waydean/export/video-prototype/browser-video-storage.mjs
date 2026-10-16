export const WAYDEAN_VIDEO_BUCKET = "waydean-videos";
export const WAYDEAN_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const WAYDEAN_VIDEO_SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;
export const WAYDEAN_VIDEO_LOCAL_FILE_NOTE = "Готовый файл пока доступен на этой странице — сохраните его в Фото или Файлы.";
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

function localVideoError(message) {
  return new Error(message + " " + WAYDEAN_VIDEO_LOCAL_FILE_NOTE);
}

async function getCurrentSession(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error("Не удалось проверить вход в аккаунт.");
  return data?.session ?? null;
}

function requireUserId(session, { preserveRenderedFile = false } = {}) {
  const userId = String(session?.user?.id ?? "").trim();
  if (!session?.access_token || !userId) {
    const error = new Error(preserveRenderedFile
      ? "Войдите в аккаунт Waydean и повторите загрузку. " + WAYDEAN_VIDEO_LOCAL_FILE_NOTE
      : "Войдите в аккаунт Waydean, чтобы открыть список сохранённых видео.");
    error.code = "WAYDEAN_VIDEO_AUTH_REQUIRED";
    throw error;
  }
  return userId;
}

export async function listWaydeanVideos({ client, limit = 30 } = {}) {
  if (!client?.auth?.getSession || !client?.storage?.from) return [];
  const session = await getCurrentSession(client);
  const userId = requireUserId(session);
  const { data, error } = await client.storage.from(WAYDEAN_VIDEO_BUCKET).list(userId, {
    limit: Math.min(100, Math.max(1, Math.floor(Number(limit) || 30))),
    sortBy: { column: "created_at", order: "desc" }
  });
  if (error) throw new Error("Не удалось открыть список видео аккаунта.");
  return (Array.isArray(data) ? data : [])
    .filter(item => item?.name && /\.(mp4|webm)$/i.test(item.name))
    .map(item => {
      const metadata = item.user_metadata ?? item.metadata ?? {};
      return {
        path: `${userId}/${item.name}`,
        name: item.name,
        title: String(metadata.title ?? "").trim().slice(0, 80),
        sizeBytes: Number(item.metadata?.size ?? item.size) || 0,
        createdAt: item.created_at ?? item.createdAt ?? null
      };
    });
}

export async function createWaydeanVideoLink({ client, path } = {}) {
  if (!client?.auth?.getSession || !client?.storage?.from) throw new Error("Не удалось подключить хранилище видео аккаунта.");
  const session = await getCurrentSession(client);
  const userId = requireUserId(session);
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..")) {
    throw new Error("Это видео не принадлежит текущему аккаунту.");
  }
  const { data, error } = await client.storage.from(WAYDEAN_VIDEO_BUCKET).createSignedUrl(path, WAYDEAN_VIDEO_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error("Не удалось открыть сохранённое видео.");
  return data.signedUrl;
}

function abortError() {
  return new DOMException("Загрузка видео отменена", "AbortError");
}

function makeObjectPath(userId, mimeType, now, randomUUID) {
  const safeUserId = String(userId ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safeUserId)) {
    throw new Error("Не удалось определить ваш аккаунт для загрузки видео.");
  }
  const extension = String(mimeType).toLowerCase().includes("mp4") ? "mp4" : "webm";
  return `${safeUserId}/${Math.max(0, Number(now()) || 0)}-${randomUUID()}.${extension}`;
}

function getTusEndpoint(projectUrl) {
  let apiUrl;
  try {
    apiUrl = new URL(projectUrl);
  } catch {
    throw new Error("Не настроено хранилище видео аккаунта.");
  }
  const projectHost = /^([a-z0-9-]+)\.supabase\.co$/i.exec(apiUrl.hostname);
  if (projectHost && apiUrl.protocol === "https:") {
    return `https://${projectHost[1]}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${apiUrl.origin}/storage/v1/upload/resumable`;
}

export async function uploadWaydeanVideo({
  blob,
  fileName = "waydean-family-story",
  title = "История семьи",
  objectPath = "",
  client,
  tusClient = globalThis.tus,
  config = globalThis.SUPABASE_CONFIG,
  onProgress = () => {},
  onObjectPath = () => {},
  signal,
  now = Date.now,
  randomUUID = () => globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
} = {}) {
  return (async () => {
    if (!blob || !Number.isFinite(Number(blob.size))) throw new Error("Не найден готовый видеофайл для загрузки.");
    if (Number(blob.size) > WAYDEAN_VIDEO_MAX_BYTES) {
      throw localVideoError("Ролик больше лимита хранилища 50 МБ.");
    }
    if (!client?.auth?.getSession || !client?.storage?.from) {
      throw localVideoError("Не удалось подключить хранилище аккаунта.");
    }
    if (typeof tusClient?.Upload !== "function") {
      throw localVideoError("Не удалось запустить загрузку видео.");
    }
    if (signal?.aborted) throw abortError();

    const session = await getCurrentSession(client);
    const userId = requireUserId(session, { preserveRenderedFile: true });
    if (!config?.url || !config?.anonKey) {
      throw localVideoError("Не настроено хранилище аккаунта.");
    }

    const path = objectPath || makeObjectPath(userId, blob.type, now, randomUUID);
    if (!path.startsWith(`${userId}/`) || path.includes("..") || !/\.(mp4|webm)$/i.test(path)) {
      throw new Error("Не удалось проверить путь сохранения видео в аккаунте.");
    }
    onObjectPath(path);
    const endpoint = getTusEndpoint(config.url);
    const mimeType = blob.type || (String(fileName).toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm");

    await new Promise((resolve, reject) => {
      let upload;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener?.("abort", handleAbort);
        callback(value);
      };
      const handleAbort = () => {
        Promise.resolve(upload?.abort?.(true)).finally(() => finish(reject, abortError()));
      };
      const options = {
        endpoint,
        retryDelays: [0, 3000, 5000, 10_000, 20_000],
        chunkSize: TUS_CHUNK_BYTES,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        fingerprint: async () => `waydean-video:${path}`,
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: config.anonKey
        },
        metadata: {
          bucketName: WAYDEAN_VIDEO_BUCKET,
          objectName: path,
          contentType: mimeType,
          cacheControl: "3600",
          metadata: JSON.stringify({ title: String(title).trim().slice(0, 80) || "История семьи" })
        },
        onError: error => finish(reject, new Error(`Не удалось загрузить видео в аккаунт. ${error?.message || "Проверьте соединение и повторите попытку."}`)),
        onProgress: (uploaded, total) => onProgress(Number(uploaded) || 0, Number(total) || Number(blob.size)),
        onSuccess: () => finish(resolve)
      };

      try {
        upload = new tusClient.Upload(blob, options);
        signal?.addEventListener?.("abort", handleAbort, { once: true });
        Promise.resolve(upload.findPreviousUploads?.())
          .then(previous => {
            if (signal?.aborted) return handleAbort();
            if (previous?.length) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
          })
          .catch(() => {
            if (signal?.aborted) return handleAbort();
            try { upload.start(); } catch (error) { finish(reject, error); }
          });
      } catch (error) {
        finish(reject, error);
      }
    });

    let signedUrl;
    try {
      signedUrl = await createWaydeanVideoLink({ client, path });
    } catch {
      const error = new Error("Видео загрузилось, но ссылку на него создать не удалось. Откройте список своих видео и попробуйте позже.");
      error.uploaded = true;
      error.path = path;
      throw error;
    }

    return {
      bucket: WAYDEAN_VIDEO_BUCKET,
      path,
      signedUrl,
      sizeBytes: Number(blob.size)
    };
  })();
}
