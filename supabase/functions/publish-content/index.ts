import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PublishBody = {
  supportDua?: unknown[];
  generalDua?: unknown[];
  manifest?: Record<string, unknown>;
  homeManifest?: Record<string, unknown>;
  homeAnnouncements?: unknown[];
  dailyAyahPool?: unknown[];
  dailyDuaPool?: unknown[];
  appRelease?: Record<string, unknown>;
  azkarTajweed?: { version?: number; docs?: unknown[]; builtAt?: string; publishedAt?: string };
  azkarTajweedManifest?: Record<string, unknown>;
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
    if (body.azkarTajweed || body.azkarTajweedManifest) {
      const { data: editorRole, error: editorRoleError } = await supabase
        .from('azkar_tajweed_admins')
        .select('user_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (editorRoleError || !editorRole) {
        return jsonResponse({ error: 'Azkar tajweed publishing requires editor access' }, 403);
      }
    }
    const files: { path: string; content: string }[] = [];

    // Selective publish: only write keys that were explicitly provided.
    // Avoids wiping dua when publishing azkar tajweed alone (and vice versa).
    if (Array.isArray(body.supportDua)) {
      files.push({
        path: 'data/support-dua.json',
        content: `${JSON.stringify(body.supportDua, null, 2)}\n`,
      });
    }
    if (Array.isArray(body.generalDua)) {
      files.push({
        path: 'data/general-dua.json',
        content: `${JSON.stringify(body.generalDua, null, 2)}\n`,
      });
    }
    if (body.manifest && typeof body.manifest === 'object') {
      files.push({
        path: 'data/remote-dua.manifest.json',
        content: `${JSON.stringify(body.manifest, null, 2)}\n`,
      });
    }
    if (Array.isArray(body.homeAnnouncements)) {
      files.push({
        path: 'data/home-announcements.json',
        content: `${JSON.stringify(body.homeAnnouncements, null, 2)}\n`,
      });
    }
    if (Array.isArray(body.dailyAyahPool)) {
      files.push({
        path: 'data/daily-ayah-pool.json',
        content: `${JSON.stringify(body.dailyAyahPool, null, 2)}\n`,
      });
    }
    if (Array.isArray(body.dailyDuaPool)) {
      files.push({
        path: 'data/daily-dua-pool.json',
        content: `${JSON.stringify(body.dailyDuaPool, null, 2)}\n`,
      });
    }
    if (body.homeManifest && typeof body.homeManifest === 'object') {
      files.push({
        path: 'data/remote-home.manifest.json',
        content: `${JSON.stringify(body.homeManifest, null, 2)}\n`,
      });
    }
    if (body.appRelease && typeof body.appRelease === 'object') {
      files.push({
        path: 'data/app-release.json',
        content: `${JSON.stringify(body.appRelease, null, 2)}\n`,
      });
    }

    if (body.azkarTajweed && typeof body.azkarTajweed === 'object') {
      const docs = Array.isArray(body.azkarTajweed.docs) ? body.azkarTajweed.docs : [];
      const pack = {
        version: typeof body.azkarTajweed.version === 'number' ? body.azkarTajweed.version : 2,
        publishedAt: new Date().toISOString(),
        docs,
      };
      files.push({
        path: 'data/azkar-tajweed-translit.json',
        content: `${JSON.stringify(pack, null, 2)}\n`,
      });

      const tajweedManifest =
        body.azkarTajweedManifest && typeof body.azkarTajweedManifest === 'object'
          ? body.azkarTajweedManifest
          : {
              version: pack.version,
              publishedAt: pack.publishedAt,
              url: '/data/azkar-tajweed-translit.json',
              docCount: docs.length,
            };
      files.push({
        path: 'data/remote-azkar-tajweed.manifest.json',
        content: `${JSON.stringify(tajweedManifest, null, 2)}\n`,
      });
    } else if (body.azkarTajweedManifest && typeof body.azkarTajweedManifest === 'object') {
      files.push({
        path: 'data/remote-azkar-tajweed.manifest.json',
        content: `${JSON.stringify(body.azkarTajweedManifest, null, 2)}\n`,
      });
    }

    if (!files.length) {
      return jsonResponse({ error: 'Nothing to publish' }, 400);
    }

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
      const upsertRow: Record<string, unknown> = {
        id: 1,
        published_at: new Date().toISOString(),
        published_by: userData.user.email,
      };
      if (body.manifest && typeof body.manifest === 'object') upsertRow.remote_dua = body.manifest;
      if (body.homeManifest && typeof body.homeManifest === 'object') {
        upsertRow.remote_home = body.homeManifest;
      }
      if (body.appRelease && typeof body.appRelease === 'object') {
        upsertRow.app_release = body.appRelease;
      }
      if (body.azkarTajweedManifest && typeof body.azkarTajweedManifest === 'object') {
        upsertRow.remote_azkar_tajweed = body.azkarTajweedManifest;
      } else if (body.azkarTajweed && typeof body.azkarTajweed === 'object') {
        const docs = Array.isArray(body.azkarTajweed.docs) ? body.azkarTajweed.docs : [];
        upsertRow.remote_azkar_tajweed = {
          version: typeof body.azkarTajweed.version === 'number' ? body.azkarTajweed.version : 2,
          publishedAt: new Date().toISOString(),
          url: '/data/azkar-tajweed-translit.json',
          docCount: docs.length,
        };
      }
      await serviceClient.from('content_manifest').upsert(upsertRow);
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
