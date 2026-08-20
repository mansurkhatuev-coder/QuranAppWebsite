import { mergeActivityLogs, mergeTreesForPublish } from './merge-tree.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  LEGACY_TREE_DIRS,
  REGISTRY_PATH,
  TEMPLATE_DIR,
  assertCreatableTreeDir,
  buildManifest,
  buildReadme,
  buildRootTreeJson,
  customizeTemplateHtml,
  isValidTreeCode,
  normalizeTreeCode,
  parseRegistry,
  serializeRegistry,
  templateAssetNames,
  treeDirFromCode,
  type RegistryEntry,
  type RegistryFile,
  type RegistryOwnership,
} from './create-tree.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizePassword(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru-RU');
}

function normalizeTreeJson(raw: string): string {
  return JSON.stringify(JSON.parse(raw));
}

async function fingerprintText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Replace or insert a JSON <script id="..."> block. */
function injectOrInsertScript(html: string, scriptId: string, jsonText: string): string {
  const normalized = String(jsonText ?? '').trim();
  if (!normalized) return html;

  const patterns = [
    new RegExp(
      `(<script\\b[^>]*\\bid\\s*=\\s*["']${scriptId}["'][^>]*>)([\\s\\S]*?)(<\\/script>)`,
      'i'
    ),
    new RegExp(
      `(<script\\b[^>]*\\bid\\s*=\\s*${scriptId}(?=[\\s>])[^>]*>)([\\s\\S]*?)(<\\/script>)`,
      'i'
    ),
  ];

  for (const re of patterns) {
    const next = html.replace(re, (_m, open: string, _body: string, close: string) => {
      return `${open}\n${normalized}\n${close}`;
    });
    if (next !== html) return next;
  }

  const tag = `\n<script type="application/json" id="${scriptId}">\n${normalized}\n</script>\n`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}</body>`);
  }
  return html + tag;
}

function extractScriptJson(html: string, scriptId: string): string | null {
  const patterns = [
    new RegExp(
      `<script\\b[^>]*\\bid\\s*=\\s*["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
      'i'
    ),
    new RegExp(
      `<script\\b[^>]*\\bid\\s*=\\s*${scriptId}(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/script>`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match && typeof match[1] === 'string') {
      const trimmed = match[1].trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function stampNow() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
}

function githubHeaders(token: string, json = false): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function githubJson(
  token: string,
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(token, Boolean(init?.body)),
      ...(init?.headers || {}),
    },
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, json };
}

async function githubGetFile(
  token: string,
  repo: string,
  path: string
): Promise<{ sha?: string; content?: string } | null> {
  const { ok, status, json } = await githubJson(
    token,
    `https://api.github.com/repos/${repo}/contents/${path}`
  );
  if (status === 404) return null;
  if (!ok) {
    throw new Error(String(json.message || `GitHub read failed ${status}`));
  }
  const content =
    typeof json.content === 'string'
      ? decodeURIComponent(escape(atob(String(json.content).replace(/\n/g, ''))))
      : undefined;
  return {
    sha: typeof json.sha === 'string' ? json.sha : undefined,
    content,
  };
}

type TreeChange =
  | { path: string; content: string; encoding?: 'utf-8' | 'base64' }
  | { path: string; sha: string }
  | { path: string; delete: true };

type GithubDirItem = {
  name: string;
  path: string;
  sha: string;
  type: string;
};

async function requireHubUser(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env is not configured');
  }
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    const error = new Error('Войдите в Trees');
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const err = new Error('Войдите в Trees');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return data.user;
}

async function githubListDir(
  token: string,
  repo: string,
  path: string
): Promise<GithubDirItem[]> {
  const { ok, status, json } = await githubJson(
    token,
    `https://api.github.com/repos/${repo}/contents/${path}`
  );
  if (status === 404) return [];
  if (!ok) {
    throw new Error(String(json.message || `GitHub list failed ${status}`));
  }
  if (!Array.isArray(json)) {
    throw new Error(`Ожидалась папка: ${path}`);
  }
  return (json as Array<Record<string, unknown>>)
    .map((item) => ({
      name: String(item.name || ''),
      path: String(item.path || ''),
      sha: String(item.sha || ''),
      type: String(item.type || ''),
    }))
    .filter((item) => item.name && item.path && item.sha);
}

const PHOTO_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeDataUrl(dataUrl: unknown): { bytes: Uint8Array; contentType: string } | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const match = dataUrl.match(/^data:(image\/(?:webp|jpeg|jpg|png));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const binary = atob(match[2].replace(/\s/g, ''));
  if (binary.length < 32 || binary.length > 480000) return null;
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

function collectPhotoGitChanges(treeDir: string, photos: unknown, deletes: unknown): TreeChange[] {
  const out: TreeChange[] = [];
  const list = Array.isArray(photos) ? photos : [];
  if (list.length > 20) {
    throw new Error('Слишком много фото за одно сохранение (макс. 20)');
  }
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const personId = typeof rec.personId === 'string' ? rec.personId.trim() : '';
    if (!PHOTO_ID_RE.test(personId)) {
      throw new Error('Некорректный id человека для фото');
    }
    const full = decodeDataUrl(rec.full);
    const thumb = decodeDataUrl(rec.thumb);
    if (!full || !thumb) {
      throw new Error(`Нужны сжатые jpeg full и thumb для ${personId}`);
    }
    out.push({
      path: `${treeDir}/photos/${personId}.jpg`,
      content: bytesToBase64(full.bytes),
      encoding: 'base64',
    });
    out.push({
      path: `${treeDir}/photos/${personId}-thumb.jpg`,
      content: bytesToBase64(thumb.bytes),
      encoding: 'base64',
    });
  }
  const del = Array.isArray(deletes) ? deletes : [];
  for (const raw of del) {
    const personId = String(raw || '').trim();
    if (!PHOTO_ID_RE.test(personId)) continue;
    out.push({ path: `${treeDir}/photos/${personId}.jpg`, delete: true });
    out.push({ path: `${treeDir}/photos/${personId}-thumb.jpg`, delete: true });
  }
  return out;
}

/** One atomic commit for multiple file writes/deletes (much faster than Contents API). */
async function githubCommitChanges(options: {
  token: string;
  repo: string;
  message: string;
  branch?: string;
  changes: TreeChange[];
}) {
  const branch = options.branch || 'main';
  const changes = options.changes.filter((c) => {
    if ('delete' in c && c.delete) return true;
    if ('sha' in c && typeof c.sha === 'string' && c.sha) return true;
    return 'content' in c && typeof c.content === 'string';
  });
  if (!changes.length) {
    return { skipped: true as const, commitSha: null as string | null };
  }

  const refRes = await githubJson(
    options.token,
    `https://api.github.com/repos/${options.repo}/git/ref/heads/${branch}`
  );
  if (!refRes.ok) {
    throw new Error(String(refRes.json.message || `Cannot read ref ${branch}`));
  }
  const headSha = String((refRes.json.object as { sha?: string } | undefined)?.sha || '');
  if (!headSha) throw new Error('Empty branch SHA');

  const commitRes = await githubJson(
    options.token,
    `https://api.github.com/repos/${options.repo}/git/commits/${headSha}`
  );
  if (!commitRes.ok) {
    throw new Error(String(commitRes.json.message || 'Cannot read head commit'));
  }
  const baseTreeSha = String((commitRes.json.tree as { sha?: string } | undefined)?.sha || '');
  if (!baseTreeSha) throw new Error('Empty base tree');

  const writes = changes.filter(
    (c): c is { path: string; content: string; encoding?: 'utf-8' | 'base64' } =>
      'content' in c && typeof (c as { content?: string }).content === 'string'
  );
  const copies = changes.filter(
    (c): c is { path: string; sha: string } =>
      'sha' in c && typeof (c as { sha?: string }).sha === 'string' && !('content' in c)
  );
  const deletes = changes.filter((c): c is { path: string; delete: true } => 'delete' in c && c.delete);

  const blobShas = await Promise.all(
    writes.map(async (file) => {
      const rawBase64 =
        file.encoding === 'base64'
          ? file.content.replace(/\s/g, '')
          : btoa(unescape(encodeURIComponent(file.content)));
      const blobRes = await githubJson(
        options.token,
        `https://api.github.com/repos/${options.repo}/git/blobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: rawBase64,
            encoding: 'base64',
          }),
        }
      );
      if (!blobRes.ok) {
        throw new Error(String(blobRes.json.message || `Blob create failed for ${file.path}`));
      }
      return { path: file.path, sha: String(blobRes.json.sha) };
    })
  );

  const treeItems: Array<Record<string, string>> = [
    ...blobShas.map((b) => ({
      path: b.path,
      mode: '100644',
      type: 'blob',
      sha: b.sha,
    })),
    ...copies.map((b) => ({
      path: b.path,
      mode: '100644',
      type: 'blob',
      sha: b.sha,
    })),
    ...deletes.map((d) => ({
      path: d.path,
      mode: '100644',
      type: 'blob',
      sha: '',
    })),
  ];

  const treeRes = await githubJson(
    options.token,
    `https://api.github.com/repos/${options.repo}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems.map((item) =>
          item.sha === ''
            ? { path: item.path, mode: item.mode, type: item.type, sha: null }
            : item
        ),
      }),
    }
  );
  if (!treeRes.ok) {
    throw new Error(String(treeRes.json.message || 'Tree create failed'));
  }

  const newCommitRes = await githubJson(
    options.token,
    `https://api.github.com/repos/${options.repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: options.message,
        tree: treeRes.json.sha,
        parents: [headSha],
      }),
    }
  );
  if (!newCommitRes.ok) {
    throw new Error(String(newCommitRes.json.message || 'Commit create failed'));
  }
  const newCommitSha = String(newCommitRes.json.sha || '');

  const updateRes = await githubJson(
    options.token,
    `https://api.github.com/repos/${options.repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha }),
    }
  );
  if (!updateRes.ok) {
    throw new Error(String(updateRes.json.message || 'Branch update failed'));
  }

  return { skipped: false as const, commitSha: newCommitSha };
}

const ALLOWED_TREE_DIRS_UNUSED_REMOVED = true; // placeholder remove
type TreeDir = string;

async function loadRegistry(token: string, repo: string): Promise<RegistryFile> {
  const file = await githubGetFile(token, repo, REGISTRY_PATH);
  return parseRegistry(file?.content);
}

function knownTreeDirs(registry: RegistryFile): string[] {
  const dirs = new Set<string>(LEGACY_TREE_DIRS);
  for (const item of registry.trees) dirs.add(item.treeDir);
  return Array.from(dirs);
}

function resolveTreeDir(raw: unknown, registry?: RegistryFile): TreeDir | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return 'drewo';
  const dirs = registry ? knownTreeDirs(registry) : [...LEGACY_TREE_DIRS];
  return dirs.includes(value) ? value : null;
}

function registryEntryFor(registry: RegistryFile, treeDir: string): RegistryEntry | null {
  return registry.trees.find((item) => item.treeDir === treeDir) || null;
}

type AuthRole = 'editor' | 'super';

const AUTO_BACKUP_KEEP = 30;

type AccessState = {
  passwordHash: string | null;
  locked: boolean;
  lockedReason: string;
  pinnedBackups: string[];
  visitCount: number;
};

type ManifestItem = {
  name: string;
  savedAt: string;
  personCount: number;
  pinned: boolean;
  label: string;
};

function fallbackEditorPassword(treeDir: TreeDir) {
  if (treeDir === 'drewo-dada-yurt') {
    return normalizePassword(Deno.env.get('DREWO_DADA_YURT_PASSWORD') ?? 'баташ');
  }
  if (treeDir === 'drewo-reklama') {
    return normalizePassword(Deno.env.get('DREWO_REKLAMA_PASSWORD') ?? 'демо');
  }
  return normalizePassword(Deno.env.get('DREWO_PASSWORD') ?? 'гуно');
}

function superPasswordSecretName(treeDir: TreeDir) {
  if (treeDir === 'drewo-dada-yurt') return 'DREWO_DADA_YURT_SUPER_PASSWORD';
  if (treeDir === 'drewo-reklama') return 'DREWO_REKLAMA_SUPER_PASSWORD';
  return 'DREWO_SUPER_PASSWORD';
}

function superPasswordValue(treeDir: TreeDir) {
  const specific = normalizePassword(Deno.env.get(superPasswordSecretName(treeDir)) ?? '');
  if (specific) return specific;
  // New (registry) trees share the main super password — no per-tree secret.
  if (!(LEGACY_TREE_DIRS as readonly string[]).includes(treeDir)) {
    return normalizePassword(Deno.env.get('DREWO_SUPER_PASSWORD') ?? '');
  }
  return '';
}

function accessPath(treeDir: TreeDir) {
  return `${treeDir}/access.json`;
}

function manifestPath(treeDir: TreeDir) {
  return `${treeDir}/backups/manifest.json`;
}

function emptyAccess(): AccessState {
  return {
    passwordHash: null,
    locked: false,
    lockedReason: '',
    pinnedBackups: [],
    visitCount: 0,
  };
}

function normalizeVisitCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

function parseAccess(raw?: string): AccessState {
  const base = emptyAccess();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.passwordHash === 'string' && /^[a-f0-9]{64}$/i.test(parsed.passwordHash)) {
      base.passwordHash = parsed.passwordHash.toLowerCase();
    }
    base.locked = parsed.locked === true;
    if (typeof parsed.lockedReason === 'string') {
      base.lockedReason = parsed.lockedReason.trim().slice(0, 200);
    }
    if (Array.isArray(parsed.pinnedBackups)) {
      base.pinnedBackups = parsed.pinnedBackups.filter((n): n is string => typeof n === 'string');
    }
    base.visitCount = normalizeVisitCount(parsed.visitCount);
  } catch {
    return emptyAccess();
  }
  return base;
}

function serializeAccess(access: AccessState) {
  return `${JSON.stringify(
    {
      passwordHash: access.passwordHash,
      locked: access.locked,
      lockedReason: access.lockedReason,
      pinnedBackups: access.pinnedBackups,
      visitCount: normalizeVisitCount(access.visitCount),
    },
    null,
    2
  )}\n`;
}

async function hashPassword(normalized: string) {
  return fingerprintText(`drewo-pw:${normalized}`);
}

async function resolveRole(
  password: unknown,
  treeDir: TreeDir,
  access: AccessState
): Promise<AuthRole | null> {
  const given = normalizePassword(password);
  if (!given) return null;
  const superPw = superPasswordValue(treeDir);
  if (superPw && given === superPw) return 'super';
  if (access.passwordHash) {
    const hashed = await hashPassword(given);
    return hashed === access.passwordHash ? 'editor' : null;
  }
  return given === fallbackEditorPassword(treeDir) ? 'editor' : null;
}

/** Brute-force guard for password checks (per tree + client IP, in-memory). */
type AuthAttemptState = {
  fails: number;
  windowStart: number;
  lockedUntil: number;
};

const AUTH_ATTEMPTS = new Map<string, AuthAttemptState>();
const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_FAILS = 5;
const AUTH_LOCK_MS = 15 * 60 * 1000;

function clientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf?.trim()) return cf.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real?.trim()) return real.trim();
  return 'unknown';
}

function authAttemptKey(treeDir: TreeDir, request: Request) {
  return `${treeDir}:${clientIp(request)}`;
}

function getAuthAttempt(key: string): AuthAttemptState {
  const now = Date.now();
  let state = AUTH_ATTEMPTS.get(key);
  if (!state) {
    state = { fails: 0, windowStart: now, lockedUntil: 0 };
    AUTH_ATTEMPTS.set(key, state);
    return state;
  }
  if (state.lockedUntil > now) return state;
  if (now - state.windowStart > AUTH_FAIL_WINDOW_MS) {
    state = { fails: 0, windowStart: now, lockedUntil: 0 };
    AUTH_ATTEMPTS.set(key, state);
  }
  return state;
}

function authLockResponse(state: AuthAttemptState) {
  const retryAfterSec = Math.max(1, Math.ceil((state.lockedUntil - Date.now()) / 1000));
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  return new Response(
    JSON.stringify({
      error: `Слишком много попыток. Подождите ${mins} мин.`,
      retryAfterSec,
      lockedUntil: state.lockedUntil,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    }
  );
}

function recordAuthFailure(key: string): AuthAttemptState {
  const now = Date.now();
  let state = AUTH_ATTEMPTS.get(key);
  if (!state || (state.lockedUntil <= now && now - state.windowStart > AUTH_FAIL_WINDOW_MS)) {
    state = { fails: 0, windowStart: now, lockedUntil: 0 };
  }
  state.fails += 1;
  if (state.fails >= AUTH_MAX_FAILS) {
    state.lockedUntil = now + AUTH_LOCK_MS;
  }
  AUTH_ATTEMPTS.set(key, state);
  return state;
}

function clearAuthFailures(key: string) {
  AUTH_ATTEMPTS.delete(key);
}

function countPeopleFromTreeJson(treeJson: string): number {
  try {
    const tree = JSON.parse(treeJson) as { sons?: unknown[] };
    let n = 0;
    const walk = (node: { sons?: unknown[] } | null) => {
      if (!node || typeof node !== 'object') return;
      n += 1;
      (Array.isArray(node.sons) ? node.sons : []).forEach((child) => {
        walk(child as { sons?: unknown[] });
      });
    };
    walk(tree);
    return n;
  } catch {
    return 0;
  }
}

function parseManifest(raw?: string): ManifestItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown } | unknown[];
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray(parsed.items)
        ? parsed.items
        : [];
    return items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const rec = item as Record<string, unknown>;
        if (typeof rec.name !== 'string') return null;
        return {
          name: rec.name,
          savedAt: typeof rec.savedAt === 'string' ? rec.savedAt : '',
          personCount: Number(rec.personCount) || 0,
          pinned: rec.pinned === true,
          label: typeof rec.label === 'string' ? rec.label : '',
        } satisfies ManifestItem;
      })
      .filter((item): item is ManifestItem => !!item);
  } catch {
    return [];
  }
}

function serializeManifest(items: ManifestItem[]) {
  return `${JSON.stringify({ items }, null, 2)}\n`;
}

function guessSavedAt(name: string) {
  const match = name.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`;
}

function backupListLabel(name: string, treeDir: TreeDir) {
  const prefix = backupNamePrefix(treeDir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name
    .replace(new RegExp(`^${prefix}-`), '')
    .replace(/\.(html|json)$/, '')
    .replace(/_/g, ' ');
}

function backupNamePrefix(treeDir: TreeDir) {
  return treeDir;
}

function isSafeBackupName(name: string, treeDir: TreeDir) {
  const prefix = backupNamePrefix(treeDir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.(html|json)$`).test(
    name
  );
}

async function listBackupFiles(token: string, repo: string, treeDir: TreeDir) {
  const { ok, status, json } = await githubJson(
    token,
    `https://api.github.com/repos/${repo}/contents/${treeDir}/backups`
  );
  if (status === 404) return [] as Array<{ path: string; sha: string; name: string }>;
  if (!ok) {
    throw new Error(String(json.message || `GitHub list backups failed ${status}`));
  }
  if (!Array.isArray(json)) return [];
  return (json as Array<Record<string, unknown>>)
    .filter(
      (item) =>
        item &&
        item.type === 'file' &&
        typeof item.name === 'string' &&
        isSafeBackupName(String(item.name), treeDir)
    )
    .map((item) => ({
      path: String(item.path),
      sha: String(item.sha),
      name: String(item.name),
    }))
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

function pruneBackupDeletes(
  existing: Array<{ path: string; name: string }>,
  pinned: Set<string>,
  extraKeep: string[]
) {
  const keep = new Set<string>([...pinned, ...extraKeep]);
  const extraUnpinned = extraKeep.filter((name) => !pinned.has(name)).length;
  const room = Math.max(0, AUTO_BACKUP_KEEP - extraUnpinned);
  existing
    .filter((b) => !keep.has(b.name) && !pinned.has(b.name))
    .slice(0, room)
    .forEach((b) => keep.add(b.name));
  return existing
    .filter((b) => !keep.has(b.name))
    .map((b) => ({ path: b.path, delete: true as const }));
}

function mergeManifest(
  previous: ManifestItem[],
  remainingNames: string[],
  pinned: Set<string>,
  incoming: ManifestItem[]
) {
  const byName = new Map<string, ManifestItem>();
  previous.forEach((item) => byName.set(item.name, item));
  incoming.forEach((item) => byName.set(item.name, item));
  return remainingNames.map((name) => {
    const prev = byName.get(name);
    return {
      name,
      savedAt: prev?.savedAt || guessSavedAt(name),
      personCount: prev?.personCount || 0,
      pinned: pinned.has(name),
      label: prev?.label || '',
    } satisfies ManifestItem;
  });
}

function parseBackupPayload(raw: string): { treeJson: string; activityJson: string } | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.treeJson === 'string') {
      JSON.parse(parsed.treeJson);
      return {
        treeJson: parsed.treeJson.trim(),
        activityJson:
          typeof parsed.activityJson === 'string' && parsed.activityJson.trim()
            ? parsed.activityJson.trim()
            : '[]',
      };
    }
    // Plain tree JSON backup.
    if (parsed && typeof parsed === 'object' && parsed.id) {
      return { treeJson: JSON.stringify(parsed, null, 2), activityJson: '[]' };
    }
  } catch {
    // fall through to HTML extract
  }
  const treeJson = extractScriptJson(trimmed, 'tree-data');
  if (!treeJson) return null;
  try {
    JSON.parse(treeJson);
  } catch {
    return null;
  }
  return {
    treeJson,
    activityJson: extractScriptJson(trimmed, 'activity-log') || '[]',
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const githubToken = Deno.env.get('GITHUB_TOKEN');
    const githubRepo = Deno.env.get('GITHUB_REPO') ?? 'mansurkhatuev-coder/QuranAppWebsite';
    if (!githubToken) {
      return jsonResponse({ error: 'GITHUB_TOKEN secret is missing' }, 500);
    }

    const body = await request.json();
    const action =
      typeof body.action === 'string' && body.action.trim() ? body.action.trim() : 'publish';

    const registry = await loadRegistry(githubToken, githubRepo);
    const allowedDirs = knownTreeDirs(registry);

    /** Aggregate live stats for the Trees hub PWA (no password; same public fields as status). */
    if (action === 'hub-overview') {
      const trees = await Promise.all(
        allowedDirs.map(async (dir) => {
          const meta = registryEntryFor(registry, dir) || {
            treeDir: dir,
            code: dir.replace(/^drewo-?/, '') || dir,
            title: dir,
            ownership: 'mine' as RegistryOwnership,
            note: '',
            createdAt: '',
          };
          const [accessFile, manifestFile] = await Promise.all([
            githubGetFile(githubToken, githubRepo, accessPath(dir)),
            githubGetFile(githubToken, githubRepo, manifestPath(dir)),
          ]);
          const access = parseAccess(accessFile?.content);
          const manifest = parseManifest(manifestFile?.content);
          const latestWithPeople = manifest.find((item) => item.personCount > 0) ?? manifest[0] ?? null;
          const previousWithPeople =
            manifest.find(
              (item, index) =>
                index > 0 && item.personCount > 0 && item.personCount !== latestWithPeople?.personCount
            ) ?? null;
          const baseline =
            [...manifest].reverse().find((item) => item.personCount > 0) ?? null;
          const personCount = latestWithPeople?.personCount ?? 0;
          const addedSinceBaseline =
            baseline && personCount >= baseline.personCount
              ? personCount - baseline.personCount
              : null;
          const addedSincePrevious =
            previousWithPeople && personCount >= previousWithPeople.personCount
              ? personCount - previousWithPeople.personCount
              : null;

          return {
            treeDir: dir,
            code: meta.code,
            title: meta.title,
            ownership: meta.ownership,
            note: meta.note,
            path: `/${dir}/`,
            locked: access.locked,
            lockedReason: access.lockedReason,
            superConfigured: Boolean(superPasswordValue(dir)),
            personCount,
            backupCount: manifest.length,
            lastSavedAt: latestWithPeople?.savedAt ?? null,
            addedSinceBaseline,
            addedSincePrevious,
          };
        })
      );

      return jsonResponse({
        ok: true,
        generatedAt: new Date().toISOString(),
        trees,
      });
    }

    if (action === 'create-tree') {
      try {
        await requireHubUser(request);
      } catch (err) {
        const status = (err as Error & { status?: number }).status || 401;
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Войдите в Trees' },
          status
        );
      }

      const code = normalizeTreeCode(body.code);
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const rootName = typeof body.rootName === 'string' ? body.rootName.trim() : '';
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
      const ownership: RegistryOwnership = body.ownership === 'customer' ? 'customer' : 'mine';
      const password = normalizePassword(body.password);

      if (!isValidTreeCode(code)) {
        return jsonResponse(
          {
            error:
              'Код: латиница, 2–25 символов, начинается с буквы (например ahmad или rod-ali)',
          },
          400
        );
      }
      if (title.length < 2) {
        return jsonResponse({ error: 'Укажите название древа' }, 400);
      }
      if (rootName.length < 1) {
        return jsonResponse({ error: 'Укажите имя корня' }, 400);
      }
      if (password.length < 2 || password.length > 64) {
        return jsonResponse({ error: 'Пароль семьи: от 2 до 64 символов' }, 400);
      }

      const treeDir = treeDirFromCode(code);
      try {
        assertCreatableTreeDir(treeDir, allowedDirs);
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Код занят' },
          400
        );
      }

      const existingIndex = await githubGetFile(githubToken, githubRepo, `${treeDir}/index.html`);
      if (existingIndex?.content) {
        return jsonResponse({ error: 'Папка древа уже есть на сайте' }, 409);
      }

      const templateHtml = await githubGetFile(
        githubToken,
        githubRepo,
        `${TEMPLATE_DIR}/index.html`
      );
      if (!templateHtml?.content || templateHtml.content.length < 100) {
        return jsonResponse({ error: 'Не найден шаблон drewo-reklama/index.html' }, 500);
      }

      const templateFiles = await githubListDir(githubToken, githubRepo, TEMPLATE_DIR);
      const assetNames = new Set(templateAssetNames());
      const assetCopies = templateFiles
        .filter((item) => item.type === 'file' && assetNames.has(item.name))
        .map((item) => ({
          path: `${treeDir}/${item.name}`,
          sha: item.sha,
        }));

      if (assetCopies.length < 3) {
        return jsonResponse(
          { error: 'В шаблоне не хватает картинок (bg/icon). Проверьте drewo-reklama/' },
          500
        );
      }

      const treeJson = buildRootTreeJson(rootName);
      const html = customizeTemplateHtml({
        html: templateHtml.content,
        treeDir,
        title,
        rootName,
        treeJson,
      });
      const passwordHash = await hashPassword(password);
      const access: AccessState = {
        ...emptyAccess(),
        passwordHash,
      };
      const entry: RegistryEntry = {
        treeDir,
        code,
        title: title.slice(0, 80),
        ownership,
        note,
        createdAt: new Date().toISOString(),
      };
      const nextRegistry: RegistryFile = {
        version: 1,
        trees: [...registry.trees.filter((item) => item.treeDir !== treeDir), entry],
      };

      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message: `Create family tree ${treeDir} (${title})`,
        changes: [
          ...assetCopies,
          { path: `${treeDir}/index.html`, content: html },
          { path: `${treeDir}/family-tree.json`, content: treeJson },
          { path: `${treeDir}/access.json`, content: serializeAccess(access) },
          {
            path: `${treeDir}/backups/manifest.json`,
            content: serializeManifest([]),
          },
          { path: `${treeDir}/manifest.webmanifest`, content: buildManifest(title) },
          { path: `${treeDir}/README.md`, content: buildReadme(title, treeDir, code) },
          { path: REGISTRY_PATH, content: serializeRegistry(nextRegistry) },
        ],
      });

      return jsonResponse({
        ok: true,
        treeDir,
        code,
        title: entry.title,
        ownership: entry.ownership,
        note: entry.note,
        path: `/${treeDir}/`,
        inviteUrl: `https://waydean.ru/${treeDir}/`,
        createdAt: entry.createdAt,
      });
    }

    const treeDir = resolveTreeDir(body.treeDir, registry);
    if (!treeDir) {
      return jsonResponse(
        { error: `Неизвестный treeDir. Допустимо: ${allowedDirs.join(', ')}` },
        400
      );
    }

    const indexPath = `${treeDir}/index.html`;
    const jsonPath = `${treeDir}/family-tree.json`;
    const backupsDir = `${treeDir}/backups`;
    const backupPrefix = backupNamePrefix(treeDir);

    const [accessFile, manifestFile] = await Promise.all([
      githubGetFile(githubToken, githubRepo, accessPath(treeDir)),
      githubGetFile(githubToken, githubRepo, manifestPath(treeDir)),
    ]);
    const access = parseAccess(accessFile?.content);
    const manifest = parseManifest(manifestFile?.content);
    const pinned = new Set(access.pinnedBackups.filter((name) => isSafeBackupName(name, treeDir)));
    const superConfigured = Boolean(superPasswordValue(treeDir));

    if (action === 'status') {
      return jsonResponse({
        ok: true,
        treeDir,
        locked: access.locked,
        lockedReason: access.lockedReason,
        superConfigured,
      });
    }

    if (action === 'record-visit' || action === 'presence-heartbeat' || action === 'presence-leave') {
      return jsonResponse({ ok: true, treeDir, ignored: true });
    }

    const attemptKey = authAttemptKey(treeDir, request);
    const attemptState = getAuthAttempt(attemptKey);
    if (attemptState.lockedUntil > Date.now()) {
      return authLockResponse(attemptState);
    }

    const role = await resolveRole(body.password, treeDir, access);
    if (!role) {
      const failed = recordAuthFailure(attemptKey);
      if (failed.lockedUntil > Date.now()) {
        return authLockResponse(failed);
      }
      const attemptsLeft = Math.max(0, AUTH_MAX_FAILS - failed.fails);
      return jsonResponse(
        {
          error:
            attemptsLeft > 0
              ? `Неверный пароль. Осталось попыток: ${attemptsLeft}`
              : 'Неверный пароль',
          attemptsLeft,
        },
        401
      );
    }
    clearAuthFailures(attemptKey);

    if (action === 'auth') {
      return jsonResponse({
        ok: true,
        treeDir,
        role,
        locked: access.locked,
        lockedReason: access.lockedReason,
        superConfigured,
      });
    }

    if (action === 'upload-photo') {
      if (access.locked && role !== 'super') {
        return jsonResponse(
          { error: 'Правки заблокированы. Нужен суперпароль.', locked: true },
          403
        );
      }
      const personId = typeof body.personId === 'string' ? body.personId.trim() : '';
      const version =
        typeof body.version === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(body.version)
          ? body.version
          : String(Date.now());
      let photoChanges: TreeChange[] = [];
      try {
        photoChanges = collectPhotoGitChanges(
          treeDir,
          [{ personId, full: body.full, thumb: body.thumb }],
          []
        );
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Некорректное фото' },
          400
        );
      }
      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message: `Add photo ${personId} on ${treeDir}`,
        changes: photoChanges,
      });
      return jsonResponse({
        ok: true,
        treeDir,
        personId,
        version,
        photo: version,
        fullPath: `${treeDir}/photos/${personId}.jpg`,
        thumbPath: `${treeDir}/photos/${personId}-thumb.jpg`,
      });
    }

    if (action === 'delete-photo') {
      if (access.locked && role !== 'super') {
        return jsonResponse(
          { error: 'Правки заблокированы. Нужен суперпароль.', locked: true },
          403
        );
      }
      const personId = typeof body.personId === 'string' ? body.personId.trim() : '';
      if (!PHOTO_ID_RE.test(personId)) {
        return jsonResponse({ error: 'Некорректный id человека' }, 400);
      }
      const candidates = [
        `${treeDir}/photos/${personId}.jpg`,
        `${treeDir}/photos/${personId}-thumb.jpg`,
      ];
      const existing = await Promise.all(
        candidates.map(async (path) => ((await githubGetFile(githubToken, githubRepo, path)) ? path : null))
      );
      const deletes = existing
        .filter((path): path is string => Boolean(path))
        .map((path) => ({ path, delete: true as const }));
      if (deletes.length) {
        await githubCommitChanges({
          token: githubToken,
          repo: githubRepo,
          message: `Remove photo ${personId} on ${treeDir}`,
          changes: deletes,
        });
      }
      return jsonResponse({ ok: true, treeDir, personId, deleted: true });
    }

    const requireSuper = (act: string, allowEditorUntilConfigured = false) => {
      if (role === 'super') return null;
      if (!superConfigured) {
        if (allowEditorUntilConfigured && role === 'editor') return null;
        return jsonResponse(
          { error: `Суперпароль не настроен. Задайте секрет ${superPasswordSecretName(treeDir)} и задеплойте функцию.` },
          503
        );
      }
      return jsonResponse({ error: `Для действия «${act}» нужен суперпароль` }, 403);
    };

    const writeAccess = async (next: AccessState, message: string) => {
      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message,
        changes: [{ path: accessPath(treeDir), content: serializeAccess(next) }],
      });
    };

    if (action === 'list-backups') {
      const backups = await listBackupFiles(githubToken, githubRepo, treeDir);
      const byName = new Map(manifest.map((item) => [item.name, item]));
      return jsonResponse({
        ok: true,
        treeDir,
        locked: access.locked,
        role,
        backups: backups.map((b) => {
          const meta = byName.get(b.name);
          return {
            name: b.name,
            path: b.path,
            label: meta?.label || backupListLabel(b.name, treeDir),
            savedAt: meta?.savedAt || guessSavedAt(b.name),
            personCount: meta?.personCount || 0,
            pinned: pinned.has(b.name),
          };
        }),
      });
    }

    if (action === 'set-lock') {
      const denied = requireSuper('set-lock');
      if (denied) return denied;
      const next: AccessState = {
        ...access,
        locked: body.locked === true,
        lockedReason:
          typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : access.lockedReason,
      };
      await writeAccess(
        next,
        `${next.locked ? 'Lock' : 'Unlock'} ${treeDir} family tree edits`
      );
      return jsonResponse({
        ok: true,
        treeDir,
        locked: next.locked,
        lockedReason: next.lockedReason,
      });
    }

    if (action === 'set-password') {
      const denied = requireSuper('set-password');
      if (denied) return denied;
      const nextPassword = normalizePassword(body.newPassword);
      if (nextPassword.length < 2) {
        return jsonResponse({ error: 'Новый пароль слишком короткий' }, 400);
      }
      if (nextPassword.length > 64) {
        return jsonResponse({ error: 'Новый пароль слишком длинный' }, 400);
      }
      const next: AccessState = {
        ...access,
        passwordHash: await hashPassword(nextPassword),
      };
      await writeAccess(next, `Change ${treeDir} editor password`);
      return jsonResponse({ ok: true, treeDir, passwordChanged: true });
    }

    if (action === 'pin-backup') {
      const denied = requireSuper('pin-backup', true);
      if (denied) return denied;
      const backupName = typeof body.backup === 'string' ? body.backup.trim() : '';
      if (!isSafeBackupName(backupName, treeDir)) {
        return jsonResponse({ error: 'Некорректное имя бэкапа' }, 400);
      }
      const nextPinned = new Set(pinned);
      if (body.pinned === false) nextPinned.delete(backupName);
      else nextPinned.add(backupName);
      const next: AccessState = { ...access, pinnedBackups: Array.from(nextPinned) };
      const nextManifest = mergeManifest(
        manifest,
        (await listBackupFiles(githubToken, githubRepo, treeDir)).map((b) => b.name),
        nextPinned,
        []
      );
      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message: `${nextPinned.has(backupName) ? 'Pin' : 'Unpin'} ${treeDir} backup ${backupName}`,
        changes: [
          { path: accessPath(treeDir), content: serializeAccess(next) },
          { path: manifestPath(treeDir), content: serializeManifest(nextManifest) },
        ],
      });
      return jsonResponse({
        ok: true,
        treeDir,
        backup: backupName,
        pinned: nextPinned.has(backupName),
      });
    }

    const makeSnapshotRecord = (
      treeJson: string,
      activityJson: string,
      extra: Record<string, unknown> = {}
    ) => {
      const savedAt = new Date().toISOString();
      const personCount = countPeopleFromTreeJson(treeJson);
      const label = typeof extra.label === 'string' ? extra.label : '';
      return {
        json: JSON.stringify(
          {
            treeJson,
            activityJson,
            savedAt,
            personCount,
            ...extra,
          },
          null,
          2
        ),
        savedAt,
        personCount,
        label,
      };
    };

    if (action === 'snapshot') {
      if (access.locked && role !== 'super') {
        return jsonResponse({ error: 'Правки заблокированы. Нужен суперпароль.' }, 403);
      }
      const [jsonFile, current, existingBackups] = await Promise.all([
        githubGetFile(githubToken, githubRepo, jsonPath),
        githubGetFile(githubToken, githubRepo, indexPath),
        listBackupFiles(githubToken, githubRepo, treeDir),
      ]);
      const treeJson = jsonFile?.content?.trim() || extractScriptJson(current?.content || '', 'tree-data');
      if (!treeJson) {
        return jsonResponse({ error: 'Нет дерева для снимка' }, 400);
      }
      const activityJson = extractScriptJson(current?.content || '', 'activity-log') || '[]';
      const stamp = stampNow();
      const backupName = `${backupPrefix}-${stamp}.json`;
      const label =
        typeof body.label === 'string' ? body.label.trim().slice(0, 80) : 'Ручной снимок';
      const record = makeSnapshotRecord(treeJson, activityJson, { label, kind: 'snapshot' });
      const remaining = [
        backupName,
        ...existingBackups
          .filter((b) => !pruneBackupDeletes(existingBackups, pinned, [backupName]).some((d) => d.path === b.path))
          .map((b) => b.name),
      ];
      const uniqueRemaining = Array.from(new Set(remaining));
      const nextManifest = mergeManifest(manifest, uniqueRemaining, pinned, [
        {
          name: backupName,
          savedAt: record.savedAt,
          personCount: record.personCount,
          pinned: false,
          label,
        },
      ]);
      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message: `Snapshot ${treeDir} family tree (${stamp})`,
        changes: [
          { path: `${backupsDir}/${backupName}`, content: record.json + '\n' },
          { path: manifestPath(treeDir), content: serializeManifest(nextManifest) },
          ...pruneBackupDeletes(existingBackups, pinned, [backupName]),
        ],
      });
      return jsonResponse({
        ok: true,
        treeDir,
        backup: backupName,
        personCount: record.personCount,
        savedAt: record.savedAt,
      });
    }

    if (action === 'restore') {
      const denied = requireSuper('restore', true);
      if (denied) return denied;
      const backupName = typeof body.backup === 'string' ? body.backup.trim() : '';
      if (!isSafeBackupName(backupName, treeDir)) {
        return jsonResponse({ error: 'Некорректное имя бэкапа' }, 400);
      }
      const backupFile = await githubGetFile(
        githubToken,
        githubRepo,
        `${backupsDir}/${backupName}`
      );
      if (!backupFile?.content) {
        return jsonResponse({ error: 'Бэкап не найден' }, 404);
      }
      const parsed = parseBackupPayload(backupFile.content);
      if (!parsed) {
        return jsonResponse({ error: 'В бэкапе нет дерева' }, 400);
      }
      const stamp = stampNow();
      const [current, existingBackups] = await Promise.all([
        githubGetFile(githubToken, githubRepo, indexPath),
        listBackupFiles(githubToken, githubRepo, treeDir),
      ]);
      if (!current?.content || current.content.length < 100) {
        return jsonResponse({ error: 'Нет текущей страницы для восстановления' }, 400);
      }

      let htmlToWrite = injectOrInsertScript(current.content, 'tree-data', parsed.treeJson);
      htmlToWrite = injectOrInsertScript(htmlToWrite, 'activity-log', parsed.activityJson);
      const jsonBody = parsed.treeJson.endsWith('\n') ? parsed.treeJson : `${parsed.treeJson}\n`;
      const newBackupName = `${backupPrefix}-${stamp}.json`;
      const record = makeSnapshotRecord(parsed.treeJson, parsed.activityJson, {
        restoredFrom: backupName,
        kind: 'restore-point',
        label: 'До восстановления',
      });
      const pruneDeletes = pruneBackupDeletes(existingBackups, pinned, [newBackupName, backupName]);
      const remainingNames = [
        newBackupName,
        ...existingBackups.filter((b) => !pruneDeletes.some((d) => d.path === b.path)).map((b) => b.name),
      ];
      const nextManifest = mergeManifest(manifest, Array.from(new Set(remainingNames)), pinned, [
        {
          name: newBackupName,
          savedAt: record.savedAt,
          personCount: record.personCount,
          pinned: false,
          label: 'До восстановления',
        },
      ]);

      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message: `Restore ${treeDir} family tree from ${backupName}`,
        changes: [
          { path: indexPath, content: htmlToWrite },
          { path: jsonPath, content: jsonBody },
          { path: `${backupsDir}/${newBackupName}`, content: record.json + '\n' },
          { path: manifestPath(treeDir), content: serializeManifest(nextManifest) },
          ...pruneDeletes,
        ],
      });

      const fingerprint = await fingerprintText(normalizeTreeJson(parsed.treeJson));
      return jsonResponse({
        ok: true,
        treeDir,
        restoredFrom: backupName,
        treeJson: parsed.treeJson,
        activityJson: parsed.activityJson,
        fingerprint,
        publishedAt: new Date().toISOString(),
      });
    }

    if (action !== 'publish') {
      return jsonResponse({ error: `Неизвестное действие: ${action}` }, 400);
    }

    if (access.locked && role !== 'super') {
      return jsonResponse({ error: 'Правки заблокированы. Нужен суперпароль.' }, 403);
    }

    const treeJson = typeof body.treeJson === 'string' ? body.treeJson.trim() : '';
    if (!treeJson) {
      return jsonResponse({ error: 'Пустое дерево (treeJson)' }, 400);
    }
    let normalizedTree: string;
    try {
      normalizedTree = normalizeTreeJson(treeJson);
    } catch {
      return jsonResponse({ error: 'treeJson не является JSON' }, 400);
    }

    const activityJson =
      typeof body.activityJson === 'string' && body.activityJson.trim()
        ? body.activityJson.trim()
        : '[]';
    const force = body.force === true;
    const baseFingerprint =
      typeof body.baseFingerprint === 'string' ? body.baseFingerprint.trim() : '';
    const baseTreeJson =
      typeof body.baseTreeJson === 'string' ? body.baseTreeJson.trim() : '';

    const [jsonFile, current, existingBackups] = await Promise.all([
      githubGetFile(githubToken, githubRepo, jsonPath),
      githubGetFile(githubToken, githubRepo, indexPath),
      listBackupFiles(githubToken, githubRepo, treeDir),
    ]);

    const serverTreeRaw =
      jsonFile?.content?.trim() || extractScriptJson(current?.content || '', 'tree-data') || '';
    const serverFingerprint = serverTreeRaw
      ? await fingerprintText(normalizeTreeJson(serverTreeRaw))
      : '';

    let merged = false;
    let mergeStats: Record<string, unknown> | null = null;
    let publishTreeJson = treeJson;
    let publishActivityJson = activityJson;
    let publishNormalized = normalizedTree;

    if (serverFingerprint && baseFingerprint && serverFingerprint !== baseFingerprint && !force) {
      try {
        const mergedTrees = mergeTreesForPublish(serverTreeRaw, treeJson, baseTreeJson);
        const serverActivity = extractScriptJson(current?.content || '', 'activity-log') || '[]';
        publishTreeJson = mergedTrees.treeJson.endsWith('\n')
          ? mergedTrees.treeJson
          : `${mergedTrees.treeJson}\n`;
        publishActivityJson = mergeActivityLogs(serverActivity, activityJson);
        publishNormalized = normalizeTreeJson(publishTreeJson);
        merged = true;
        mergeStats = {
          ...mergedTrees.stats,
          usedThreeWay: mergedTrees.usedThreeWay,
        };
      } catch {
        return jsonResponse(
          {
            ok: false,
            conflict: true,
            error:
              'На сайте уже другая версия дерева. Можно объединить правки или сохранить принудительно.',
            serverFingerprint,
            baseFingerprint,
            serverTreeJson: serverTreeRaw,
            serverActivityJson: extractScriptJson(current?.content || '', 'activity-log') || '[]',
          },
          409
        );
      }
    }

    const stamp = stampNow();
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : `Update ${treeDir} family tree (${stamp})`;

    let htmlBase =
      current?.content && current.content.length > 100
        ? current.content
        : typeof body.html === 'string'
          ? body.html
          : '';
    if (!htmlBase || htmlBase.length < 100) {
      return jsonResponse({ error: 'Нет HTML страницы для обновления' }, 400);
    }

    let htmlToWrite = injectOrInsertScript(htmlBase, 'tree-data', publishTreeJson);
    if (publishActivityJson) {
      htmlToWrite = injectOrInsertScript(htmlToWrite, 'activity-log', publishActivityJson);
    }

    const jsonBody = publishTreeJson.endsWith('\n') ? publishTreeJson : `${publishTreeJson}\n`;
    const indexWillChange = !current?.content || current.content !== htmlToWrite;
    const jsonWillChange =
      !jsonFile?.content || normalizeTreeJson(jsonFile.content) !== publishNormalized;

    let photoWrites: TreeChange[] = [];
    try {
      photoWrites = collectPhotoGitChanges(treeDir, body.photos, []);
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Некорректные фото' },
        400
      );
    }
    const photoDeleteIds = Array.from(
      new Set(
        (Array.isArray(body.photoDeletes) ? body.photoDeletes : [])
          .map((value) => String(value || '').trim())
          .filter((id) => PHOTO_ID_RE.test(id))
      )
    );
    const photoDeleteCandidates = photoDeleteIds.flatMap((id) => [
      `${treeDir}/photos/${id}.jpg`,
      `${treeDir}/photos/${id}-thumb.jpg`,
    ]);
    const photoDeleteExisting = await Promise.all(
      photoDeleteCandidates.map(async (path) =>
        (await githubGetFile(githubToken, githubRepo, path)) ? path : null
      )
    );
    const photoDeletes: TreeChange[] = photoDeleteExisting
      .filter((path): path is string => Boolean(path))
      .map((path) => ({ path, delete: true as const }));
    const photoGitChanges = [...photoWrites, ...photoDeletes];

    if (!indexWillChange && !jsonWillChange && !photoGitChanges.length) {
      return jsonResponse({
        ok: true,
        unchanged: true,
        merged,
        mergeStats,
        treeJson: publishTreeJson,
        activityJson: publishActivityJson,
        indexChanged: false,
        jsonChanged: false,
        fingerprint: await fingerprintText(publishNormalized),
        publishedAt: new Date().toISOString(),
        photosWritten: 0,
        photoDeletesWritten: 0,
        forced: force,
        locked: access.locked,
      });
    }

    const treeFilesChange = indexWillChange || jsonWillChange;
    const backupName = `${backupPrefix}-${stamp}.json`;
    const record = makeSnapshotRecord(publishTreeJson, publishActivityJson, {
      kind: 'auto',
      merged,
    });
    const pruneDeletes = pruneBackupDeletes(existingBackups, pinned, [backupName]);
    const remainingNames = [
      backupName,
      ...existingBackups.filter((b) => !pruneDeletes.some((d) => d.path === b.path)).map((b) => b.name),
    ];
    const nextManifest = mergeManifest(manifest, Array.from(new Set(remainingNames)), pinned, [
      {
        name: backupName,
        savedAt: record.savedAt,
        personCount: record.personCount,
        pinned: false,
        label: '',
      },
    ]);

    const changes: TreeChange[] = [
      ...(indexWillChange ? [{ path: indexPath, content: htmlToWrite }] : []),
      ...(jsonWillChange ? [{ path: jsonPath, content: jsonBody }] : []),
      ...(treeFilesChange
        ? [
            { path: `${backupsDir}/${backupName}`, content: record.json + '\n' },
            { path: manifestPath(treeDir), content: serializeManifest(nextManifest) },
            ...pruneDeletes,
          ]
        : []),
      ...photoGitChanges,
    ];

    const commit = await githubCommitChanges({
      token: githubToken,
      repo: githubRepo,
      message,
      changes,
    });

    const fingerprint = await fingerprintText(publishNormalized);
    return jsonResponse({
      ok: true,
      publishedAt: new Date().toISOString(),
      treeDir,
      path: indexPath,
      indexChanged: indexWillChange,
      jsonChanged: jsonWillChange,
      fingerprint,
      backupCreated: treeFilesChange,
      backupCount: treeFilesChange ? nextManifest.length : manifest.length,
      photosWritten: photoWrites.length / 2,
      photoDeletesWritten: photoDeletes.length / 2,
      commitSha: commit.commitSha,
      repo: githubRepo,
      forced: force,
      locked: access.locked,
      merged,
      mergeStats,
      treeJson: publishTreeJson,
      activityJson: publishActivityJson,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
