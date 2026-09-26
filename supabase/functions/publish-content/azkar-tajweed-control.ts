// Kept runtime-independent so the GitHub transaction can be tested without Deno or network writes.
const MANIFEST_PATH = 'data/remote-azkar-tajweed.manifest.json';
const PACK_PATH = 'data/azkar-tajweed-translit.json';
const MANIFEST_LIMIT = 64 * 1024;
const PACK_LIMIT = 2 * 1024 * 1024;
const RULES = new Set(['madd2', 'madd246', 'madd45', 'madd6', 'ghunna', 'qalqala', 'tafkheem', 'silent', 'interdental']);

export class TajweedPublishError extends Error {
  constructor(message: string, public readonly status: number, public readonly code = 'invalid_request') {
    super(message);
  }
}

type JsonObject = Record<string, unknown>;
export type TajweedManifest = JsonObject & { version: number; enabled: boolean; url?: string; docCount?: number };
type FileChange = { path: string; content: string };
type Options = {
  token: string;
  repo: string;
  isEditor: boolean;
  contentOrigin?: string;
  transport?: typeof fetch;
  now?: () => string;
};

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function jsonFile(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength; }
function invalidPack(message: string): never { throw new TajweedPublishError(message, 422, 'invalid_pack'); }

export function validateTajweedPack(value: unknown): { version: number; docs: JsonObject[] } {
  if (!object(value) || (value.version !== 1 && value.version !== 2) || !Array.isArray(value.docs) || value.docs.length === 0 || value.docs.length > 1000) {
    return invalidPack('Published tajweed pack must contain 1–1000 valid documents');
  }
  if (byteLength(JSON.stringify(value)) > PACK_LIMIT) return invalidPack('Tajweed pack exceeds 2 MiB');
  const ids = new Set<string>();
  const links = new Set<string>();
  let totalMarks = 0;
  const docs = value.docs.map((doc: unknown): JsonObject => {
    if (!object(doc) || typeof doc.id !== 'string' || !doc.id.trim() || doc.id.length > 256 || ids.has(doc.id)
      || typeof doc.title !== 'string' || typeof doc.arabic !== 'string'
      || typeof doc.transliteration !== 'string' || doc.transliteration.length > 10000
      || !Array.isArray(doc.azkarIds) || doc.azkarIds.length === 0 || doc.azkarIds.length > 1000
      || (doc.marks !== undefined && !Array.isArray(doc.marks))) {
      return invalidPack('Invalid or duplicate tajweed document');
    }
    ids.add(doc.id);
    for (const link of doc.azkarIds) {
      if (typeof link !== 'string' || !link.trim() || link.length > 256 || links.has(link)) return invalidPack('Invalid or conflicting azkar link');
      links.add(link);
    }
    const marks = (doc.marks ?? []) as unknown[];
    totalMarks += marks.length;
    if (marks.length > 2000 || totalMarks > 50000) return invalidPack('Tajweed mark limit exceeded');
    const textLength = doc.transliteration.length;
    const cleanedMarks = marks.flatMap(mark => {
      if (!object(mark) || typeof mark.start !== 'number' || !Number.isSafeInteger(mark.start)
        || typeof mark.end !== 'number' || !Number.isSafeInteger(mark.end)) return [];
      const start = Math.max(0, Math.min(mark.start, textLength));
      const end = Math.max(0, Math.min(mark.end, textLength));
      if (end <= start) return [];
      return [{
        start, end,
        rules: Array.isArray(mark.rules) ? [...new Set(mark.rules.filter((rule): rule is string => typeof rule === 'string' && RULES.has(rule)))] : [],
        accent: mark.accent === true,
        hidden: mark.hidden === true,
        ...(typeof mark.note === 'string' ? { note: mark.note } : {}),
      }];
    });
    return { id: doc.id, title: doc.title, arabic: doc.arabic, azkarIds: doc.azkarIds, transliteration: doc.transliteration, marks: cleanedMarks };
  });
  return { version: value.version, docs };
}

function packPath(manifest: JsonObject, origin?: string): string {
  if (manifest.url === undefined || manifest.url === `/${PACK_PATH}`) return PACK_PATH;
  if (typeof manifest.url !== 'string' || !origin) throw new TajweedPublishError('Invalid manifest pack URL', 422);
  try {
    const url = new URL(manifest.url);
    if (url.protocol === 'https:' && url.origin === new URL(origin).origin && !url.username && !url.password
      && url.pathname === `/${PACK_PATH}` && !url.hash && !url.search) return PACK_PATH;
  } catch { /* Reject malformed configuration or URL below. */ }
  throw new TajweedPublishError('Manifest pack URL must use the configured content source', 422);
}

export async function readPublishBody(request: Request): Promise<unknown> {
  try { return await boundedJson(request, 8 * 1024 * 1024); }
  catch (error) {
    if (error instanceof TajweedPublishError && error.code === 'size_limit') throw new TajweedPublishError('Publish request exceeds 8 MiB', 413);
    throw new TajweedPublishError('Invalid publish request JSON', 400);
  }
}

async function boundedJson(response: Pick<Response, 'body'>, limit: number): Promise<unknown> {
  if (!response.body) throw new TajweedPublishError('Empty GitHub response', 502, 'upstream_error');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new TajweedPublishError('Repository document exceeds its size limit', 422, 'size_limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof TajweedPublishError) throw error;
    throw new TajweedPublishError('Invalid repository JSON', 422);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function executeAzkarTajweedOperation(body: unknown, options: Options): Promise<{
  ok: true; azkarTajweedManifest: TajweedManifest; azkarTajweedPackDigest?: string | null; files: string[]; repo: string; commitSha?: string; publishedAt?: string;
}> {
  if (!options.isEditor) throw new TajweedPublishError('Azkar tajweed publishing requires editor access', 403, 'forbidden');
  if (!object(body)) throw new TajweedPublishError('Invalid request body', 400);
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo) || !options.token) throw new TajweedPublishError('GitHub environment is not configured', 500);
  const control = body.azkarTajweedControl;
  const allowed = control !== undefined ? ['azkarTajweedControl'] : ['azkarTajweed', 'azkarTajweedManifest', 'azkarTajweedExpectedVersion'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new TajweedPublishError('Tajweed operations cannot be mixed with other content or repository settings', 400);
  let expected: number | undefined;
  let requestedEnabled: boolean | undefined;
  let readOnly = false;
  let newPack: ReturnType<typeof validateTajweedPack> | undefined;
  if (control !== undefined) {
    if (!object(control)) throw new TajweedPublishError('Invalid tajweed control operation', 400);
    readOnly = control.action === 'read';
    const keys = readOnly ? ['action'] : ['action', 'enabled', 'expectedVersion'];
    if (Object.keys(control).some(key => !keys.includes(key)) || (!readOnly && control.action !== 'set')) throw new TajweedPublishError('Invalid tajweed control action', 400);
    if (!readOnly) {
      if (typeof control.enabled !== 'boolean' || !positiveInteger(control.expectedVersion)) throw new TajweedPublishError('Set requires Boolean enabled and positive expectedVersion', 400);
      requestedEnabled = control.enabled;
      expected = control.expectedVersion;
    }
  } else {
    if (!object(body.azkarTajweed)) throw new TajweedPublishError('Publish documents with azkarTajweed; use the control operation to change enabled', 400);
    if (body.azkarTajweedManifest !== undefined && !object(body.azkarTajweedManifest)) throw new TajweedPublishError('Invalid legacy manifest', 400);
    if (body.azkarTajweedExpectedVersion !== undefined) {
      if (!positiveInteger(body.azkarTajweedExpectedVersion)) throw new TajweedPublishError('Invalid expected manifest version', 400);
      expected = body.azkarTajweedExpectedVersion;
    }
    newPack = validateTajweedPack(body.azkarTajweed);
  }
  const transport = options.transport ?? fetch;
  const base = `https://api.github.com/repos/${options.repo}`;
  async function github(path: string, init: RequestInit = {}, limit = MANIFEST_LIMIT): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let acceptedWrite = false;
    try {
      const response = await transport(`${base}${path}`, {
        ...init, signal: controller.signal,
        headers: { Authorization: `Bearer ${options.token}`, Accept: path.startsWith('/contents/') ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (init.method === 'PATCH' && [409, 422].includes(response.status)) throw new TajweedPublishError('Content changed concurrently; reload before publishing', 409, 'conflict');
        if (init.method === 'PATCH' && response.status >= 500) throw new TajweedPublishError('GitHub write outcome is unknown; reread server state', 503, 'unknown_outcome');
        throw new TajweedPublishError(`GitHub request failed (${response.status})`, 502, 'upstream_error');
      }
      acceptedWrite = init.method === 'PATCH';
      return await boundedJson(response, limit);
    } catch (error) {
      if (acceptedWrite) throw new TajweedPublishError('GitHub write outcome is unknown; reread server state', 503, 'unknown_outcome');
      if (error instanceof TajweedPublishError && !(init.method === 'PATCH' && error.code === 'invalid_request')) throw error;
      throw new TajweedPublishError(init.method === 'PATCH' ? 'GitHub write outcome is unknown; reread server state' : 'GitHub request failed', 503, init.method === 'PATCH' ? 'unknown_outcome' : 'upstream_error');
    } finally { clearTimeout(timer); }
  }
  function field(value: unknown, name: string): string {
    if (!object(value) || typeof value[name] !== 'string' || !value[name]) throw new TajweedPublishError('Invalid GitHub metadata', 502, 'upstream_error');
    return value[name];
  }
  const branch = field(await github(''), 'default_branch');
  const branchPath = branch.split('/').map(encodeURIComponent).join('/');
  const ref = await github(`/git/ref/heads/${branchPath}`);
  const parent = field(object(ref) ? ref.object : undefined, 'sha');
  const rawManifest = await github(`/contents/${MANIFEST_PATH}?ref=${encodeURIComponent(parent)}`);
  if (!object(rawManifest) || !positiveInteger(rawManifest.version)
    || (rawManifest.docCount !== undefined && (typeof rawManifest.docCount !== 'number' || !Number.isSafeInteger(rawManifest.docCount) || rawManifest.docCount < 0))) {
    throw new TajweedPublishError('Invalid authoritative tajweed manifest', 422);
  }
  packPath(rawManifest, options.contentOrigin);
  const current = { ...rawManifest, enabled: rawManifest.enabled === true } as TajweedManifest;
  if (readOnly) {
    let azkarTajweedPackDigest: string | null = null;
    try {
      const rawPack = await github(`/contents/${packPath(current, options.contentOrigin)}?ref=${encodeURIComponent(parent)}`, {}, PACK_LIMIT);
      validateTajweedPack(rawPack);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rawPack)));
      azkarTajweedPackDigest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch { /* OFF must remain available when the packet is broken or unavailable. */ }
    return { ok: true, azkarTajweedManifest: current, azkarTajweedPackDigest, files: [], repo: options.repo };
  }
  if (expected !== undefined && expected !== current.version) throw new TajweedPublishError('Manifest version changed; reload before publishing', 409, 'conflict');
  if (current.version === Number.MAX_SAFE_INTEGER) throw new TajweedPublishError('Manifest version exhausted', 422);
  if (requestedEnabled === true) {
    validateTajweedPack(await github(`/contents/${packPath(current, options.contentOrigin)}?ref=${encodeURIComponent(parent)}`, {}, PACK_LIMIT));
  }
  const publishedAt = (options.now ?? (() => new Date().toISOString()))();
  const canonical: TajweedManifest = { ...current, version: current.version + 1, enabled: requestedEnabled ?? current.enabled, publishedAt };
  const files: FileChange[] = [];
  if (newPack) {
    canonical.docCount = newPack.docs.length;
    canonical.url = current.url ?? `/${PACK_PATH}`;
    const content = jsonFile({ ...newPack, publishedAt });
    if (byteLength(content) > PACK_LIMIT) return invalidPack('Serialized tajweed pack exceeds 2 MiB');
    files.push({ path: PACK_PATH, content });
  }
  const manifestContent = jsonFile(canonical);
  if (byteLength(manifestContent) > MANIFEST_LIMIT) throw new TajweedPublishError('Manifest exceeds 64 KiB', 422);
  files.push({ path: MANIFEST_PATH, content: manifestContent });
  const commit = await github(`/git/commits/${encodeURIComponent(parent)}`);
  const baseTree = field(object(commit) ? commit.tree : undefined, 'sha');
  const tree = await github('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree: files.map(file => ({ ...file, mode: '100644', type: 'blob' })) }) });
  const newCommit = await github('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Publish azkar tajweed content', tree: field(tree, 'sha'), parents: [parent] }) });
  const commitSha = field(newCommit, 'sha');
  // The commit's only parent is the exact read snapshot. A competing writer creates
  // a sibling: non-force ref update rejects it instead of overwriting their OFF.
  await github(`/git/refs/heads/${branchPath}`, { method: 'PATCH', body: JSON.stringify({ sha: commitSha, force: false }) });
  return { ok: true, azkarTajweedManifest: canonical, files: files.map(file => file.path), repo: options.repo, commitSha, publishedAt };
}
