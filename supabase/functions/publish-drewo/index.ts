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

    const html = typeof body.html === 'string' ? body.html : '';
    if (!html || html.length < 100) {
      return jsonResponse({ error: 'Пустой HTML' }, 400);
    }

    const treeJson = typeof body.treeJson === 'string' ? body.treeJson : '';
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : `Update family tree (${stamp})`;

    const current = await githubGetFile(githubToken, githubRepo, 'drewo/index.html');
    if (current?.content) {
      await githubPutFile({
        token: githubToken,
        repo: githubRepo,
        path: `drewo/backups/drewo-${stamp}.html`,
        content: current.content,
        message: `Backup family tree before update (${stamp})`,
      });
    }

    await githubPutFile({
      token: githubToken,
      repo: githubRepo,
      path: 'drewo/index.html',
      content: html,
      message,
      sha: current?.sha,
    });

    if (treeJson) {
      const jsonFile = await githubGetFile(githubToken, githubRepo, 'drewo/family-tree.json');
      await githubPutFile({
        token: githubToken,
        repo: githubRepo,
        path: 'drewo/family-tree.json',
        content: treeJson.endsWith('\n') ? treeJson : `${treeJson}\n`,
        message: `Update family-tree.json (${stamp})`,
        sha: jsonFile?.sha,
      });
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
      backupCount: Math.min(backups.length + (current?.content ? 1 : 0), 10),
      repo: githubRepo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
