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

/** Replace or insert a JSON <script id="..."> block. */
function injectOrInsertScript(html: string, scriptId: string, jsonText: string): string {
  const normalized = String(jsonText ?? '').trim();
  if (!normalized) return html;

  const patterns = [
    // id="tree-data" or id='tree-data'
    new RegExp(
      `(<script\\b[^>]*\\bid\\s*=\\s*["']${scriptId}["'][^>]*>)([\\s\\S]*?)(<\\/script>)`,
      'i'
    ),
    // id=tree-data (unquoted, browser outerHTML quirk)
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

  const tag =
    `\n<script type="application/json" id="${scriptId}">\n${normalized}\n</script>\n`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}</body>`);
  }
  return html + tag;
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

async function listBackupFiles(token: string, repo: string) {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/drewo/backups`, {
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
    .filter((item) => item && item.type === 'file' && typeof item.name === 'string')
    .map((item) => ({
      path: String(item.path),
      sha: String(item.sha),
      name: String(item.name),
    }))
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
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
    const expectedPassword = normalizePassword(Deno.env.get('DREWO_PASSWORD') ?? 'гуно');

    if (!githubToken) {
      return jsonResponse({ error: 'GITHUB_TOKEN secret is missing' }, 500);
    }

    const body = await request.json();
    if (normalizePassword(body.password) !== expectedPassword) {
      return jsonResponse({ error: 'Неверный пароль' }, 401);
    }

    const treeJson = typeof body.treeJson === 'string' ? body.treeJson.trim() : '';
    if (!treeJson) {
      return jsonResponse({ error: 'Пустое дерево (treeJson)' }, 400);
    }
    try {
      JSON.parse(treeJson);
    } catch {
      return jsonResponse({ error: 'treeJson не является JSON' }, 400);
    }

    const activityJson =
      typeof body.activityJson === 'string' && body.activityJson.trim()
        ? body.activityJson.trim()
        : '';

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : `Update family tree (${stamp})`;

    // Use the live HTML on GitHub as the shell. Browser outerHTML often breaks #tree-data.
    const current = await githubGetFile(githubToken, githubRepo, 'drewo/index.html');
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
        path: `drewo/backups/drewo-${stamp}.html`,
        content: current.content,
        message: `Backup family tree before update (${stamp})`,
      });
    }

    let indexChanged = false;
    if (indexWillChange) {
      const put = await githubPutFileRetry({
        token: githubToken,
        repo: githubRepo,
        path: 'drewo/index.html',
        content: htmlToWrite,
        message,
      });
      indexChanged = !put.skipped;
    }

    const jsonBody = treeJson.endsWith('\n') ? treeJson : `${treeJson}\n`;
    const jsonPut = await githubPutFileRetry({
      token: githubToken,
      repo: githubRepo,
      path: 'drewo/family-tree.json',
      content: jsonBody,
      message: `Update family-tree.json (${stamp})`,
    });
    const jsonChanged = !jsonPut.skipped;

    if (!indexChanged && !jsonChanged) {
      return jsonResponse(
        {
          ok: false,
          error:
            'На GitHub уже такая же версия дерева. Если сын пропал после обновления — откройте waydean.ru/drewo/?v=1 или подождите до 10 минут (кэш).',
          indexChanged: false,
          jsonChanged: false,
          publishedAt: new Date().toISOString(),
        },
        409
      );
    }

    const backups = await listBackupFiles(githubToken, githubRepo);
    for (const old of backups.slice(10)) {
      await githubDeleteFile({
        token: githubToken,
        repo: githubRepo,
        path: old.path,
        sha: old.sha,
        message: `Prune old family tree backup ${old.name}`,
      });
    }

    return jsonResponse({
      ok: true,
      publishedAt: new Date().toISOString(),
      path: 'drewo/index.html',
      indexChanged,
      jsonChanged,
      backupCreated: Boolean(current?.content && indexWillChange),
      backupCount: Math.min(backups.length + (current?.content && indexWillChange ? 1 : 0), 10),
      repo: githubRepo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
