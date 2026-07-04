import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PublishBody = {
  supportDua?: unknown[];
  generalDua?: unknown[];
  manifest?: Record<string, unknown>;
  appRelease?: Record<string, unknown>;
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

async function githubGetFileSha(token: string, repo: string, path: string): Promise<string | undefined> {
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.message || `GitHub read failed ${response.status}`);
  }
  const json = await response.json();
  return typeof json.sha === 'string' ? json.sha : undefined;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const githubToken = Deno.env.get('GITHUB_TOKEN');
    const githubRepo = Deno.env.get('GITHUB_REPO') ?? 'mansurkhatuev-coder/QuranAppWebsite';

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Supabase env is not configured' }, 500);
    }
    if (!githubToken) {
      return jsonResponse({ error: 'GITHUB_TOKEN secret is missing' }, 500);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = (await request.json()) as PublishBody;
    const supportDua = Array.isArray(body.supportDua) ? body.supportDua : [];
    const generalDua = Array.isArray(body.generalDua) ? body.generalDua : [];
    const manifest = body.manifest ?? {};
    const appRelease = body.appRelease ?? {};

    const files = [
      { path: 'data/support-dua.json', content: `${JSON.stringify(supportDua, null, 2)}\n` },
      { path: 'data/general-dua.json', content: `${JSON.stringify(generalDua, null, 2)}\n` },
      { path: 'data/remote-dua.manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
      { path: 'data/app-release.json', content: `${JSON.stringify(appRelease, null, 2)}\n` },
    ];

    for (const file of files) {
      const sha = await githubGetFileSha(githubToken, githubRepo, file.path);
      await githubPutFile({
        token: githubToken,
        repo: githubRepo,
        path: file.path,
        content: file.content,
        message: `Publish remote content from Supabase (${userData.user.email ?? 'admin'})`,
        sha,
      });
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    });

    if (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      await serviceClient.from('content_manifest').upsert({
        id: 1,
        remote_dua: manifest,
        app_release: appRelease,
        published_at: new Date().toISOString(),
        published_by: userData.user.email,
      });
    }

    return jsonResponse({
      ok: true,
      publishedAt: new Date().toISOString(),
      files: files.map((file) => file.path),
      repo: githubRepo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
