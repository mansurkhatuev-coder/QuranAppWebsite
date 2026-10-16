import test from "node:test";
import assert from "node:assert/strict";
import {
  createWaydeanVideoLink,
  listWaydeanVideos,
  uploadWaydeanVideo,
  WAYDEAN_VIDEO_BUCKET,
  WAYDEAN_VIDEO_LOCAL_FILE_NOTE,
  WAYDEAN_VIDEO_MAX_BYTES
} from "./browser-video-storage.mjs";

const session = {
  access_token: "user-jwt",
  user: { id: "123e4567-e89b-12d3-a456-426614174000" }
};

function makeClient({ activeSession = session, videoRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getSession: async () => ({ data: { session: activeSession }, error: null }) },
    storage: {
      from: bucket => ({
        list: async (folder, options) => {
          calls.push(["list", bucket, folder, options]);
          return { data: videoRows, error: null };
        },
        createSignedUrl: async (path, expires) => {
          calls.push(["signed", bucket, path, expires]);
          return { data: { signedUrl: "https://storage.example/signed-video" }, error: null };
        }
      })
    }
  };
}

test("uploads a rendered video to a user-owned private path with resumable TUS and returns a temporary link", async () => {
  const client = makeClient();
  const events = [];
  let selectedPath = "";
  class TusUpload {
    constructor(file, options) { this.file = file; this.options = options; events.push(["create", file, options]); }
    async findPreviousUploads() { return []; }
    start() {
      events.push(["start"]);
      this.options.onProgress(6, 10);
      this.options.onSuccess();
    }
  }
  const blob = new Blob(["rendered"], { type: "video/mp4" });

  const result = await uploadWaydeanVideo({
    blob,
    client,
    tusClient: { Upload: TusUpload },
    config: { url: "https://rivjkiksknnesahrvamf.supabase.co", anonKey: "public-key" },
    fileName: "waydean-story.mp4",
    title: "Семейный путь",
    now: () => 123,
    randomUUID: () => "video-id",
    onObjectPath: path => { selectedPath = path; },
    onProgress: (current, total) => events.push(["progress", current, total])
  });

  const tusOptions = events.find(event => event[0] === "create")[2];
  assert.equal(result.path, `${session.user.id}/123-video-id.mp4`);
  assert.equal(selectedPath, result.path);
  assert.equal(result.signedUrl, "https://storage.example/signed-video");
  assert.equal(result.bucket, WAYDEAN_VIDEO_BUCKET);
  assert.equal(result.sizeBytes, blob.size);
  assert.equal(tusOptions.endpoint, "https://rivjkiksknnesahrvamf.storage.supabase.co/storage/v1/upload/resumable");
  assert.equal(tusOptions.headers.authorization, "Bearer user-jwt");
  assert.equal(tusOptions.headers.apikey, "public-key");
  assert.equal(tusOptions.chunkSize, 6 * 1024 * 1024);
  assert.equal(await tusOptions.fingerprint(), `waydean-video:${result.path}`);
  assert.equal(tusOptions.metadata.bucketName, WAYDEAN_VIDEO_BUCKET);
  assert.equal(tusOptions.metadata.objectName, result.path);
  assert.equal(tusOptions.metadata.contentType, "video/mp4");
  assert.deepEqual(JSON.parse(tusOptions.metadata.metadata), { title: "Семейный путь" });
  assert.deepEqual(client.calls[0], ["signed", WAYDEAN_VIDEO_BUCKET, result.path, 7 * 24 * 60 * 60]);
  assert.equal(events.some(event => event[0] === "progress" && event[1] === 6), true);
});

test("lists only rendered videos in the signed-in user's storage folder", async () => {
  const client = makeClient({ videoRows: [
    { name: "recent.mp4", created_at: "2026-10-16T10:00:00Z", metadata: { size: 4096 }, user_metadata: { title: "История семьи" } },
    { name: "not-a-video.txt", created_at: "2026-10-16T09:00:00Z" }
  ] });

  const videos = await listWaydeanVideos({ client, limit: 20 });

  assert.equal(videos.length, 1);
  assert.deepEqual(videos[0], {
    path: `${session.user.id}/recent.mp4`,
    name: "recent.mp4",
    title: "История семьи",
    sizeBytes: 4096,
    createdAt: "2026-10-16T10:00:00Z"
  });
  assert.equal(client.calls[0][2], session.user.id);
});

test("generates a fresh signed link only for files in the current account folder", async () => {
  const client = makeClient();
  const path = `${session.user.id}/video.mp4`;
  assert.equal(await createWaydeanVideoLink({ client, path }), "https://storage.example/signed-video");
  await assert.rejects(createWaydeanVideoLink({ client, path: "another-user/video.mp4" }), /не принадлежит текущему аккаунту/i);
});

test("does not upload when the user is signed out", async () => {
  await assert.rejects(
    uploadWaydeanVideo({
      blob: new Blob(["x"], { type: "video/webm" }),
      client: makeClient({ activeSession: null }),
      tusClient: { Upload: class {} },
      config: { url: "https://project.supabase.co", anonKey: "public-key" },
      fileName: "story.webm"
    }),
    /войдите в аккаунт/i
  );
});

test("tells the user the rendered file stays available on the open page when account login is required", async () => {
  await assert.rejects(
    uploadWaydeanVideo({
      blob: new Blob(["x"], { type: "video/webm" }),
      client: makeClient({ activeSession: null }),
      tusClient: { Upload: class {} },
      config: { url: "https://project.supabase.co", anonKey: "public-key" },
      fileName: "story.webm"
    }),
    error => {
      assert.match(error.message, /войдите в аккаунт/i);
      assert.ok(error.message.includes(WAYDEAN_VIDEO_LOCAL_FILE_NOTE));
      return true;
    }
  );
});

test("keeps an oversize video local without starting a TUS upload", async () => {
  let created = false;
  class TusUpload { constructor() { created = true; } }
  const oversizedBlob = { size: WAYDEAN_VIDEO_MAX_BYTES + 1, type: "video/mp4" };

  await assert.rejects(
    uploadWaydeanVideo({
      blob: oversizedBlob,
      client: makeClient(),
      tusClient: { Upload: TusUpload },
      config: { url: "https://project.supabase.co", anonKey: "public-key" },
      fileName: "story.mp4"
    }),
    /50 МБ/i
  );
  assert.equal(created, false);
});

test("rejects an upload if the signed-link request fails after transfer", async () => {
  class TusUpload {
    async findPreviousUploads() { return []; }
    start() { this.options.onSuccess(); }
    constructor(_file, options) { this.options = options; }
  }
  const client = makeClient();
  client.storage.from = () => ({ createSignedUrl: async () => ({ data: null, error: new Error("RLS denied") }) });

  await assert.rejects(
    uploadWaydeanVideo({
      blob: new Blob(["x"], { type: "video/webm" }), client,
      tusClient: { Upload: TusUpload },
      config: { url: "https://project.supabase.co", anonKey: "public-key" },
      fileName: "story.webm", now: () => 1, randomUUID: () => "id"
    }),
    /ссылку/i
  );
});
