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

async function githubGetFile(
  token: string,
  repo: string,
  path: string
): Promise<{ sha?: string; content?: string } | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || `GitHub read failed ${response.status}`);
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

async function githubPutFile(options: {
  token: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  sha?: string;
}) {
  const encoded = btoa(unescape(encodeURIComponent(options.content)));
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
      content: encoded,
      sha: options.sha,
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || `GitHub API error ${response.status} for ${options.path}`);
  }
  return json;
}

async function githubPutFileRetry(options: {
  token: string;
  repo: string;
  path: string;
  content: string;
  message: string;
}) {
  const current = await githubGetFile(options.token, options.repo, options.path);
  if (current?.content === options.content) {
    return { skipped: true as const, sha: current.sha };
  }
  try {
    const result = await githubPutFile({
      ...options,
      sha: current?.sha,
    });
    return { skipped: false as const, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/sha|conflict|409|422/i.test(message)) throw error;
    const again = await githubGetFile(options.token, options.repo, options.path);
    if (again?.content === options.content) {
      return { skipped: true as const, sha: again.sha };
    }
    const result = await githubPutFile({
      ...options,
      sha: again?.sha,
    });
    return { skipped: false as const, result };
  }
}

async function githubDeleteFile(options: {
  token: string;
  repo: string;
  path: string;
  sha: string;
  message: string;
}) {
  const response = await fetch(`https://api.github.com/repos/${options.repo}/contents/${options.path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: options.message,
      sha: options.sha,
    }),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.message || `GitHub delete failed ${response.status}`);
  }
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
  return new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.html$`).test(name);
}

async function listBackupFiles(token: string, repo: string, treeDir: TreeDir) {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${treeDir}/backups`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return [] as Array<{ path: string; sha: string; name: string }>;
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || `GitHub list backups failed ${response.status}`);
  }
  if (!Array.isArray(json)) return [];
  return json
    .filter(
      (item) =>
        item &&
        item.type === 'file' &&
        typeof item.name === 'string' &&
        String(item.name).endsWith('.html')
    )
    .map((item) => ({
      path: String(item.path),
      sha: String(item.sha),
      name: String(item.name),
    }))
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

async function pruneBackups(token: string, repo: string, treeDir: TreeDir) {
  const backups = await listBackupFiles(token, repo, treeDir);
  for (const old of backups.slice(10)) {
    await githubDeleteFile({
      token,
      repo,
      path: old.path,
      sha: old.sha,
      message: `Prune old family tree backup ${old.name}`,
    });
  }
  return backups;
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
          label: b.name.replace(labelPrefixRe, '').replace(/\.html$/, '').replace(/_/g, ' '),
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
      const treeJson = extractScriptJson(backupFile.content, 'tree-data');
      if (!treeJson) {
        return jsonResponse({ error: 'В бэкапе нет дерева (#tree-data)' }, 400);
      }
      try {
        JSON.parse(treeJson);
      } catch {
        return jsonResponse({ error: 'Дерево в бэкапе повреждено' }, 400);
      }
      const activityJson = extractScriptJson(backupFile.content, 'activity-log') || '[]';
      const stamp = stampNow();
      const current = await githubGetFile(githubToken, githubRepo, indexPath);
      if (!current?.content || current.content.length < 100) {
        return jsonResponse({ error: 'Нет текущей страницы для восстановления' }, 400);
      }

      await githubPutFile({
        token: githubToken,
        repo: githubRepo,
        path: `${backupsDir}/${backupPrefix}-${stamp}.html`,
        content: current.content,
        message: `Backup before restore (${treeDir} ${stamp})`,
      });

      let htmlToWrite = injectOrInsertScript(current.content, 'tree-data', treeJson);
      htmlToWrite = injectOrInsertScript(htmlToWrite, 'activity-log', activityJson);

      await githubPutFileRetry({
        token: githubToken,
        repo: githubRepo,
        path: indexPath,
        content: htmlToWrite,
        message: `Restore ${treeDir} family tree from ${backupName}`,
      });

      const jsonBody = treeJson.endsWith('\n') ? treeJson : `${treeJson}\n`;
      await githubPutFileRetry({
        token: githubToken,
        repo: githubRepo,
        path: jsonPath,
        content: jsonBody,
        message: `Restore ${jsonPath} from ${backupName}`,
      });

      await pruneBackups(githubToken, githubRepo, treeDir);
      const fingerprint = await fingerprintText(normalizeTreeJson(treeJson));

      return jsonResponse({
        ok: true,
        treeDir,
        restoredFrom: backupName,
        treeJson,
        activityJson,
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
        : '';
    const force = body.force === true;
    const baseFingerprint =
      typeof body.baseFingerprint === 'string' ? body.baseFingerprint.trim() : '';

    const jsonFile = await githubGetFile(githubToken, githubRepo, jsonPath);
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

    const current = await githubGetFile(githubToken, githubRepo, indexPath);
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

    const indexWillChange = !current?.content || current.content !== htmlToWrite;

    if (current?.content && indexWillChange) {
      await githubPutFile({
        token: githubToken,
        repo: githubRepo,
        path: `${backupsDir}/${backupPrefix}-${stamp}.html`,
        content: current.content,
        message: `Backup ${treeDir} family tree before update (${stamp})`,
      });
    }

    let indexChanged = false;
    if (indexWillChange) {
      const put = await githubPutFileRetry({
        token: githubToken,
        repo: githubRepo,
        path: indexPath,
        content: htmlToWrite,
        message,
      });
      indexChanged = !put.skipped;
    }

    const jsonBody = treeJson.endsWith('\n') ? treeJson : `${treeJson}\n`;
    const jsonPut = await githubPutFileRetry({
      token: githubToken,
      repo: githubRepo,
      path: jsonPath,
      content: jsonBody,
      message: `Update ${jsonPath} (${stamp})`,
    });
    const jsonChanged = !jsonPut.skipped;

    if (!indexChanged && !jsonChanged) {
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

    const backups = await pruneBackups(githubToken, githubRepo, treeDir);
    const fingerprint = await fingerprintText(normalizedTree);

    return jsonResponse({
      ok: true,
      publishedAt: new Date().toISOString(),
      treeDir,
      path: indexPath,
      indexChanged,
      jsonChanged,
      fingerprint,
      backupCreated: Boolean(current?.content && indexWillChange),
      backupCount: Math.min(backups.length + (current?.content && indexWillChange ? 1 : 0), 10),
      repo: githubRepo,
      forced: force,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
