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

const ALLOWED_TREE_DIRS = ['drewo', 'drewo-dada-yurt'] as const;
type TreeDir = (typeof ALLOWED_TREE_DIRS)[number];

function resolveTreeDir(raw: unknown): TreeDir | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return 'drewo';
  return (ALLOWED_TREE_DIRS as readonly string[]).includes(value) ? (value as TreeDir) : null;
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
        (String(item.name).endsWith('.html') || String(item.name).endsWith('.json'))
    )
    .map((item) => ({
      path: String(item.path),
      sha: String(item.sha),
      name: String(item.name),
    }))
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
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
    const treeDir = resolveTreeDir(body.treeDir);
    if (!treeDir) {
      return jsonResponse(
        { error: `Неизвестный treeDir. Допустимо: ${ALLOWED_TREE_DIRS.join(', ')}` },
        400
      );
    }

    const expectedPassword = normalizePassword(
      treeDir === 'drewo-dada-yurt'
        ? Deno.env.get('DREWO_DADA_YURT_PASSWORD') ?? 'баташ'
        : Deno.env.get('DREWO_PASSWORD') ?? 'гуно'
    );
    if (normalizePassword(body.password) !== expectedPassword) {
      return jsonResponse({ error: 'Неверный пароль' }, 401);
    }
    const indexPath = `${treeDir}/index.html`;
    const jsonPath = `${treeDir}/family-tree.json`;
    const backupsDir = `${treeDir}/backups`;
    const backupPrefix = backupNamePrefix(treeDir);
    const labelPrefixRe = new RegExp(`^${backupPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-`);

    const action = typeof body.action === 'string' && body.action.trim() ? body.action.trim() : 'publish';

    if (action === 'list-backups') {
      const backups = await listBackupFiles(githubToken, githubRepo, treeDir);
      return jsonResponse({
        ok: true,
        treeDir,
        backups: backups.slice(0, 10).map((b) => ({
          name: b.name,
          path: b.path,
          label: b.name
            .replace(labelPrefixRe, '')
            .replace(/\.(html|json)$/, '')
            .replace(/_/g, ' '),
        })),
      });
    }

    if (action === 'restore') {
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
      const snapshot = JSON.stringify(
        {
          treeJson: parsed.treeJson,
          activityJson: parsed.activityJson,
          restoredFrom: backupName,
          savedAt: new Date().toISOString(),
        },
        null,
        2
      );

      const keepNames = new Set(
        existingBackups
          .map((b) => b.name)
          .filter((n) => n !== backupName)
          .slice(0, 9)
      );
      const changes: TreeChange[] = [
        { path: indexPath, content: htmlToWrite },
        { path: jsonPath, content: jsonBody },
        { path: `${backupsDir}/${backupPrefix}-${stamp}.json`, content: snapshot + '\n' },
        ...existingBackups
          .filter((b) => !keepNames.has(b.name) && b.name !== `${backupPrefix}-${stamp}.json`)
          .map((b) => ({ path: b.path, delete: true as const })),
      ];

      await githubCommitChanges({
        token: githubToken,
        repo: githubRepo,
        message: `Restore ${treeDir} family tree from ${backupName}`,
        changes,
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
            'На сайте уже другая версия дерева. Обновите у себя или сохраните принудительно (ваши правки перезапишут сайт).',
          serverFingerprint,
          baseFingerprint,
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

    const snapshot = JSON.stringify(
      {
        treeJson,
        activityJson,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const backupPath = `${backupsDir}/${backupPrefix}-${stamp}.json`;

    // Keep newest 9 existing + this new backup (=10). Delete the rest in the same commit.
    const keepExisting = existingBackups.slice(0, 9).map((b) => b.path);
    const keepSet = new Set([...keepExisting, backupPath]);
    const pruneDeletes = existingBackups
      .filter((b) => !keepSet.has(b.path))
      .map((b) => ({ path: b.path, delete: true as const }));

    const changes: TreeChange[] = [
      ...(indexWillChange ? [{ path: indexPath, content: htmlToWrite }] : []),
      ...(jsonWillChange ? [{ path: jsonPath, content: jsonBody }] : []),
      { path: backupPath, content: snapshot + '\n' },
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
      backupCount: Math.min(existingBackups.length + 1, 10),
      commitSha: commit.commitSha,
      repo: githubRepo,
      forced: force,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
