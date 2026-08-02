/**
 * Sync store release channels into data/app-release.json.
 * Schedule every 30 minutes with header x-cron-secret = SYNC_APP_RELEASE_CRON_SECRET.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { normalizeReleaseForSync, type AppRelease, type JsonObject } from './normalize-release.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const API_BASE = 'https://public-api.rustore.ru';
const DEFAULT_PACKAGE = 'com.sheyhmansur.quranapp';
const DEFAULT_GITHUB_REPO = 'mansurkhatuev-coder/QuranAppWebsite';
const RELEASE_PATH = 'data/app-release.json';
const APP_STORE_LOOKUP_URL = 'https://itunes.apple.com/lookup?id=6782619598';

type GitHubFile = {
  sha?: string;
  content?: string;
};

type RuStoreVersion = {
  versionId?: number;
  versionName?: string;
  versionCode?: number;
  versionStatus?: string;
  publishDateTime?: string | null;
  whatsNew?: string | null;
};

type RuStoreLive = {
  versionName: string | null;
  versionCode: number | null;
  versionStatus: string | null;
  versionId: number | null;
  publishDateTime: string | null;
  whatsNew: string | null;
};

type IosLive = {
  version: string | null;
  buildNumber: number | null;
  appStoreUrl: string | null;
};

function jsonResponse(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function rustoreTimestamp() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${oh}:${om}`
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToText(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64.replace(/\s/g, '')));
}

async function createSignature(keyId: string, privateKeyB64: string, timestamp: string) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyB64),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const message = new TextEncoder().encode(`${keyId}${timestamp}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, message);
  return bytesToBase64(signature);
}

async function obtainPublicToken(keyId: string, privateKeyB64: string) {
  const timestamp = rustoreTimestamp();
  const signature = await createSignature(keyId, privateKeyB64, timestamp);
  const response = await fetch(`${API_BASE}/public/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId, timestamp, signature }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json?.code && String(json.code).toUpperCase() !== 'OK')) {
    throw new Error(json?.message || `RuStore auth failed (${response.status})`);
  }
  const jwe = json?.body?.jwe;
  if (!jwe || typeof jwe !== 'string') throw new Error('RuStore auth: missing jwe');
  return jwe;
}

function pickActive(versions: RuStoreVersion[]) {
  return (
    versions.find((version) => version.versionStatus === 'ACTIVE') ??
    versions.find((version) => version.versionStatus === 'PARTIAL_ACTIVE') ??
    null
  );
}

async function loadRuStoreLive(keyId: string, privateKeyB64: string, packageName: string): Promise<RuStoreLive> {
  const jwe = await obtainPublicToken(keyId, privateKeyB64);
  const qs = new URLSearchParams({
    page: '0',
    size: '20',
    versionStatuses: 'ACTIVE,PARTIAL_ACTIVE,READY_FOR_PUBLICATION,MODERATION,REJECTED,DRAFT',
  });
  const response = await fetch(
    `${API_BASE}/public/v1/application/${encodeURIComponent(packageName)}/version?${qs}`,
    { headers: { 'Public-Token': jwe } }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json?.code && String(json.code).toUpperCase() !== 'OK')) {
    throw new Error(json?.message || `RuStore versions failed (${response.status})`);
  }

  const body = json?.body ?? json;
  const list: RuStoreVersion[] = Array.isArray(body?.content)
    ? body.content
    : Array.isArray(body)
      ? body
      : [];
  const active = pickActive(list);
  return {
    versionName: active?.versionName ?? null,
    versionCode: active?.versionCode ?? null,
    versionStatus: active?.versionStatus ?? null,
    versionId: active?.versionId ?? null,
    publishDateTime: active?.publishDateTime ?? null,
    whatsNew: active?.whatsNew ?? null,
  };
}

async function loadIosLive(): Promise<IosLive> {
  const response = await fetch(`${APP_STORE_LOOKUP_URL}&_=${Date.now()}`, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`App Store lookup failed (${response.status})`);
  const result = Array.isArray(json?.results) ? getObject(json.results[0]) : {};
  return {
    version: asString(result.version) ?? asString(result.trackVersion) ?? null,
    buildNumber: asNumber(result.buildNumber) ?? asNumber(result.bundleVersion) ?? null,
    appStoreUrl: asString(result.trackViewUrl) ?? null,
  };
}

async function githubGetFile(token: string, repo: string, path: string): Promise<GitHubFile> {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return {};
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || `GitHub read failed ${response.status}`);
  }
  return {
    sha: typeof json.sha === 'string' ? json.sha : undefined,
    content: typeof json.content === 'string' ? base64ToText(json.content) : undefined,
  };
}

async function githubPutFile(options: {
  token: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  sha?: string;
}) {
  const response = await fetch(`https://api.github.com/repos/${options.repo}/contents/${options.path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: options.message,
      content: textToBase64(options.content),
      sha: options.sha,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || `GitHub API error ${response.status} for ${options.path}`);
  }
  return json;
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const a = parse(left);
  const b = parse(right);
  const max = Math.max(a.length, b.length, 3);
  for (let i = 0; i < max; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

async function authorize(request: Request) {
  const cronSecret = Deno.env.get('SYNC_APP_RELEASE_CRON_SECRET')?.trim();
  const providedSecret = request.headers.get('x-cron-secret')?.trim();
  if (cronSecret && providedSecret && providedSecret === cronSecret) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Response(JSON.stringify({ error: 'Supabase env is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return userData.user;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    await authorize(request);

    const githubToken = Deno.env.get('GITHUB_TOKEN');
    const githubRepo = Deno.env.get('GITHUB_SITE_REPO') ?? Deno.env.get('GITHUB_REPO') ?? DEFAULT_GITHUB_REPO;
    const keyId = Deno.env.get('RUSTORE_KEY_ID')?.trim();
    const privateKeyB64 =
      Deno.env.get('RUSTORE_API_TOKEN')?.trim() || Deno.env.get('RUSTORE_PRIVATE_KEY')?.trim();
    const packageName = Deno.env.get('RUSTORE_PACKAGE_NAME')?.trim() || DEFAULT_PACKAGE;
    const defaultRustoreUrl = `https://www.rustore.ru/catalog/app/${packageName}`;

    if (!githubToken) return jsonResponse({ error: 'GITHUB_TOKEN secret is missing' }, 500);
    if (!keyId || !privateKeyB64) {
      return jsonResponse({ error: 'RuStore secrets are not configured' }, 503);
    }

    const [githubFile, rustoreLive, iosLive] = await Promise.all([
      githubGetFile(githubToken, githubRepo, RELEASE_PATH),
      loadRuStoreLive(keyId, privateKeyB64, packageName),
      loadIosLive(),
    ]);
    const release = normalizeReleaseForSync(githubFile.content ? JSON.parse(githubFile.content) : {});
    const changed = { ios: false, rustore: false };

    if (
      rustoreLive.versionName &&
      rustoreLive.versionCode != null &&
      rustoreLive.versionCode > (release.android.rustore.versionCode ?? 0)
    ) {
      release.android.rustore = {
        ...release.android.rustore,
        latestVersion: rustoreLive.versionName,
        versionCode: rustoreLive.versionCode,
        url: release.android.rustore.url || defaultRustoreUrl,
      };
      if (!release.messageRu && rustoreLive.whatsNew) {
        release.messageRu = rustoreLive.whatsNew;
      }
      changed.rustore = true;
    }

    if (iosLive.version) {
      const currentVersion = release.ios.latestVersion;
      const liveIsNewer = !currentVersion || compareSemver(iosLive.version, currentVersion) > 0;
      const sameVersion = currentVersion ? compareSemver(iosLive.version, currentVersion) === 0 : false;
      const liveBuildIsNewer =
        sameVersion && iosLive.buildNumber != null && iosLive.buildNumber > (release.ios.buildNumber ?? 0);

      if (liveIsNewer || liveBuildIsNewer) {
        release.ios = {
          ...release.ios,
          latestVersion: iosLive.version,
          appStoreUrl: release.ios.appStoreUrl || iosLive.appStoreUrl || undefined,
        };
        if (iosLive.buildNumber != null && iosLive.buildNumber >= (release.ios.buildNumber ?? 0)) {
          release.ios.buildNumber = iosLive.buildNumber;
        }
        changed.ios = true;
      }
    }

    if (changed.ios || changed.rustore) {
      await githubPutFile({
        token: githubToken,
        repo: githubRepo,
        path: RELEASE_PATH,
        content: `${JSON.stringify(release, null, 2)}\n`,
        message: 'chore(release): sync store channels to app-release.json',
        sha: githubFile.sha,
      });
    }

    return jsonResponse({
      ok: true,
      changed,
      release,
      live: {
        rustore: rustoreLive,
        ios: iosLive,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : 'Unknown sync app release error';
    return jsonResponse({ error: message }, 500);
  }
});
