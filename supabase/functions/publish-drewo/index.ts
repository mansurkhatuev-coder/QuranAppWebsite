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
  | { path: string; content: string }
  | { path: string; delete: true };

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

  const writes = changes.filter((c): c is { path: string; content: string } => 'content' in c);
  const deletes = changes.filter((c): c is { path: string; delete: true } => 'delete' in c && c.delete);

  const blobShas = await Promise.all(
    writes.map(async (file) => {
      const blobRes = await githubJson(
        options.token,
        `https://api.github.com/repos/${options.repo}/git/blobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: btoa(unescape(encodeURIComponent(file.content))),
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

const ALLOWED_TREE_DIRS = ['drewo', 'drewo-dada-yurt', 'drewo-reklama'] as const;
type TreeDir = (typeof ALLOWED_TREE_DIRS)[number];
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

function resolveTreeDir(raw: unknown): TreeDir | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return 'drewo';
  return (ALLOWED_TREE_DIRS as readonly string[]).includes(value) ? (value as TreeDir) : null;
}

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
  return normalizePassword(Deno.env.get(superPasswordSecretName(treeDir)) ?? '');
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

/** Sessions with a heartbeat newer than this are counted as online.
 *  Mobile browsers throttle timers in background, so keep a wider window. */
const PRESENCE_TTL_MS = 5 * 60 * 1000;
const PRESENCE_SESSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,79}$/;

function normalizePresenceSessionId(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return PRESENCE_SESSION_RE.test(value) ? value : null;
}

async function getServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase недоступен (нет SUPABASE_URL / SERVICE_ROLE_KEY)');
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function countOnlinePresence(
  admin: Awaited<ReturnType<typeof getServiceClient>>,
  treeDir: TreeDir
): Promise<number> {
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  const { count, error } = await admin
    .from('drewo_presence')
    .select('*', { count: 'exact', head: true })
    .eq('tree_dir', treeDir)
    .gte('last_seen_at', cutoff);
  if (error) throw new Error(error.message);
  return typeof count === 'number' && count > 0 ? count : 0;
}

async function upsertPresenceHeartbeat(
  admin: Awaited<ReturnType<typeof getServiceClient>>,
  treeDir: TreeDir,
  sessionId: string
): Promise<number> {
  const now = new Date().toISOString();
  const { error } = await admin.from('drewo_presence').upsert(
    {
      tree_dir: treeDir,
      session_id: sessionId,
      last_seen_at: now,
    },
    { onConflict: 'tree_dir,session_id' }
  );
  if (error) throw new Error(error.message);

  // Drop stale rows for this tree (older than 1 day) so the table stays small.
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from('drewo_presence').delete().eq('tree_dir', treeDir).lt('last_seen_at', staleBefore);

  return countOnlinePresence(admin, treeDir);
}

async function leavePresence(
  admin: Awaited<ReturnType<typeof getServiceClient>>,
  treeDir: TreeDir,
  sessionId: string
): Promise<number> {
  await admin.from('drewo_presence').delete().eq('tree_dir', treeDir).eq('session_id', sessionId);
  return countOnlinePresence(admin, treeDir);
}

async function safeOnlineCount(treeDir: TreeDir): Promise<number | null> {
  try {
    const admin = await getServiceClient();
    return await countOnlinePresence(admin, treeDir);
  } catch {
    return null;
  }
}

async function readVisitCountFromStats(
  admin: Awaited<ReturnType<typeof getServiceClient>>,
  treeDir: TreeDir
): Promise<number | null> {
  const { data, error } = await admin
    .from('drewo_tree_stats')
    .select('visit_count')
    .eq('tree_dir', treeDir)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeVisitCount((data as { visit_count?: unknown }).visit_count);
}

async function safeVisitCount(treeDir: TreeDir, fallback: number): Promise<number> {
  try {
    const admin = await getServiceClient();
    const fromStats = await readVisitCountFromStats(admin, treeDir);
    return fromStats != null ? fromStats : fallback;
  } catch {
    return fallback;
  }
}

async function incrementVisitCount(
  treeDir: TreeDir,
  fallbackAccessCount: number
): Promise<{ visitCount: number; usedStats: boolean }> {
  try {
    const admin = await getServiceClient();
    // Seed once from access.json so we don't reset an existing GitHub counter.
    const existing = await readVisitCountFromStats(admin, treeDir);
    if (existing == null && fallbackAccessCount > 0) {
      await admin.from('drewo_tree_stats').upsert(
        {
          tree_dir: treeDir,
          visit_count: fallbackAccessCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tree_dir' }
      );
    }
    const { data, error } = await admin.rpc('drewo_increment_visit', {
      p_tree_dir: treeDir,
    });
    if (error) throw new Error(error.message);
    return { visitCount: normalizeVisitCount(data), usedStats: true };
  } catch {
    return {
      visitCount: normalizeVisitCount(fallbackAccessCount) + 1,
      usedStats: false,
    };
  }
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

    /** Aggregate live stats for the Trees hub PWA (no password; same public fields as status). */
    if (action === 'hub-overview') {
      const trees = await Promise.all(
        ALLOWED_TREE_DIRS.map(async (dir) => {
          const [accessFile, manifestFile, onlineCount] = await Promise.all([
            githubGetFile(githubToken, githubRepo, accessPath(dir)),
            githubGetFile(githubToken, githubRepo, manifestPath(dir)),
            safeOnlineCount(dir),
          ]);
          const access = parseAccess(accessFile?.content);
          const manifest = parseManifest(manifestFile?.content);
          const visitCount = await safeVisitCount(dir, access.visitCount);
          const latestWithPeople = manifest.find((item) => item.personCount > 0) ?? manifest[0] ?? null;
          const previousWithPeople =
            manifest.find(
              (item, index) => index > 0 && item.personCount > 0 && item.personCount !== latestWithPeople?.personCount
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
            locked: access.locked,
            lockedReason: access.lockedReason,
            superConfigured: Boolean(superPasswordValue(dir)),
            visitCount,
            ...(onlineCount != null ? { onlineCount } : {}),
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

    const treeDir = resolveTreeDir(body.treeDir);
    if (!treeDir) {
      return jsonResponse(
        { error: `Неизвестный treeDir. Допустимо: ${ALLOWED_TREE_DIRS.join(', ')}` },
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
      const [onlineCount, visitCount] = await Promise.all([
        safeOnlineCount(treeDir),
        safeVisitCount(treeDir, access.visitCount),
      ]);
      return jsonResponse({
        ok: true,
        treeDir,
        locked: access.locked,
        lockedReason: access.lockedReason,
        superConfigured,
        visitCount,
        ...(onlineCount != null ? { onlineCount } : {}),
      });
    }

    if (action === 'record-visit') {
      const bumped = await incrementVisitCount(treeDir, access.visitCount);
      // Do not commit access.json: stats table is source of truth, GitHub deploys are limited.
      const onlineCount = await safeOnlineCount(treeDir);
      return jsonResponse({
        ok: true,
        treeDir,
        visitCount: bumped.visitCount,
        ...(onlineCount != null ? { onlineCount } : {}),
      });
    }

    if (action === 'presence-heartbeat' || action === 'presence-leave') {
      const sessionId = normalizePresenceSessionId(body.sessionId);
      if (!sessionId) {
        return jsonResponse({ error: 'Некорректный sessionId' }, 400);
      }
      try {
        const admin = await getServiceClient();
        const onlineCount =
          action === 'presence-leave'
            ? await leavePresence(admin, treeDir, sessionId)
            : await upsertPresenceHeartbeat(admin, treeDir, sessionId);
        return jsonResponse({
          ok: true,
          treeDir,
          onlineCount,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/drewo_presence|does not exist|relation/i.test(message)) {
          return jsonResponse(
            {
              error:
                'Таблица присутствия ещё не создана. Выполните admin/supabase-migration-drewo-presence.sql',
            },
            503
          );
        }
        throw err;
      }
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

    const PHOTO_BUCKET = 'drewo-photos';
    const PHOTO_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/;

    async function getStorageAdmin() {
      return getServiceClient();
    }

    async function ensurePhotoBucket(
      admin: Awaited<ReturnType<typeof getStorageAdmin>>
    ) {
      const listed = await admin.storage.listBuckets();
      if (listed.error) throw new Error(listed.error.message);
      const exists = (listed.data || []).some((b) => b.name === PHOTO_BUCKET);
      if (exists) return;
      const created = await admin.storage.createBucket(PHOTO_BUCKET, {
        public: true,
        fileSizeLimit: 512000,
        allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
      });
      if (created.error && !/already exists|duplicate/i.test(created.error.message || '')) {
        throw new Error(created.error.message);
      }
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

    if (action === 'upload-photo') {
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
      const full = decodeDataUrl(body.full);
      const thumb = decodeDataUrl(body.thumb);
      if (!full || !thumb) {
        return jsonResponse(
          { error: 'Нужны сжатые фото full и thumb (webp/jpeg, data URL)' },
          400
        );
      }
      const admin = await getStorageAdmin();
      await ensurePhotoBucket(admin);
      const version =
        typeof body.version === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(body.version)
          ? body.version
          : String(Date.now());
      const ext = full.contentType === 'image/png' ? 'png' : full.contentType === 'image/webp' ? 'webp' : 'jpg';
      const thumbExt =
        thumb.contentType === 'image/png' ? 'png' : thumb.contentType === 'image/webp' ? 'webp' : 'jpg';
      const fullPath = `${treeDir}/${personId}.${ext}`;
      const thumbPath = `${treeDir}/${personId}-thumb.${thumbExt}`;
      const upFull = await admin.storage.from(PHOTO_BUCKET).upload(fullPath, full.bytes, {
        contentType: full.contentType,
        upsert: true,
        cacheControl: '3600',
      });
      if (upFull.error) throw new Error(upFull.error.message);
      const upThumb = await admin.storage.from(PHOTO_BUCKET).upload(thumbPath, thumb.bytes, {
        contentType: thumb.contentType,
        upsert: true,
        cacheControl: '3600',
      });
      if (upThumb.error) throw new Error(upThumb.error.message);
      const fullUrl = admin.storage.from(PHOTO_BUCKET).getPublicUrl(fullPath).data.publicUrl;
      const thumbUrl = admin.storage.from(PHOTO_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
      return jsonResponse({
        ok: true,
        treeDir,
        personId,
        version,
        photo: version,
        fullPath,
        thumbPath,
        fullUrl: `${fullUrl}?v=${encodeURIComponent(version)}`,
        thumbUrl: `${thumbUrl}?v=${encodeURIComponent(version)}`,
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
      const admin = await getStorageAdmin();
      await ensurePhotoBucket(admin);
      const candidates = ['webp', 'jpg', 'jpeg', 'png'].flatMap((ext) => [
        `${treeDir}/${personId}.${ext}`,
        `${treeDir}/${personId}-thumb.${ext}`,
      ]);
      await admin.storage.from(PHOTO_BUCKET).remove(candidates);
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

    const [jsonFile, current, existingBackups] = await Promise.all([
      githubGetFile(githubToken, githubRepo, jsonPath),
      githubGetFile(githubToken, githubRepo, indexPath),
      listBackupFiles(githubToken, githubRepo, treeDir),
    ]);

    const serverFingerprint = jsonFile?.content
      ? await fingerprintText(normalizeTreeJson(jsonFile.content))
      : '';

    if (serverFingerprint && baseFingerprint && serverFingerprint !== baseFingerprint && !force) {
      return jsonResponse(
        {
          ok: false,
          conflict: true,
          error:
            'На сайте уже другая версия дерева. Можно объединить правки или сохранить принудительно.',
          serverFingerprint,
          baseFingerprint,
          serverTreeJson: jsonFile?.content || '',
        },
        409
      );
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

    let htmlToWrite = injectOrInsertScript(htmlBase, 'tree-data', treeJson);
    if (activityJson) {
      htmlToWrite = injectOrInsertScript(htmlToWrite, 'activity-log', activityJson);
    }

    const jsonBody = treeJson.endsWith('\n') ? treeJson : `${treeJson}\n`;
    const indexWillChange = !current?.content || current.content !== htmlToWrite;
    const jsonWillChange = !jsonFile?.content || normalizeTreeJson(jsonFile.content) !== normalizedTree;

    if (!indexWillChange && !jsonWillChange) {
      return jsonResponse(
        {
          ok: false,
          error: 'На GitHub уже такая же версия дерева.',
          indexChanged: false,
          jsonChanged: false,
          fingerprint: await fingerprintText(normalizedTree),
          publishedAt: new Date().toISOString(),
        },
        409
      );
    }

    const backupName = `${backupPrefix}-${stamp}.json`;
    const record = makeSnapshotRecord(treeJson, activityJson, { kind: 'auto' });
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
      { path: `${backupsDir}/${backupName}`, content: record.json + '\n' },
      { path: manifestPath(treeDir), content: serializeManifest(nextManifest) },
      ...pruneDeletes,
    ];

    const commit = await githubCommitChanges({
      token: githubToken,
      repo: githubRepo,
      message,
      changes,
    });

    const fingerprint = await fingerprintText(normalizedTree);
    return jsonResponse({
      ok: true,
      publishedAt: new Date().toISOString(),
      treeDir,
      path: indexPath,
      indexChanged: indexWillChange,
      jsonChanged: jsonWillChange,
      fingerprint,
      backupCreated: true,
      backupCount: nextManifest.length,
      commitSha: commit.commitSha,
      repo: githubRepo,
      forced: force,
      locked: access.locked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
