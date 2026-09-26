import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { executeAzkarTajweedOperation, readPublishBody, TajweedPublishError } from './azkar-tajweed-control.ts';

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
  azkarTajweedControl?: unknown;
  azkarTajweedExpectedVersion?: unknown;
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
    const githubRepo = Deno.env.get('GITHUB_REPO');

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Supabase env is not configured' }, 500);
    }
    if (!githubToken || !githubRepo) {
      return jsonResponse({ error: 'GITHUB_TOKEN and GITHUB_REPO secrets are required' }, 500);
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

    const body = (await readPublishBody(request)) as PublishBody;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    if (['azkarTajweed', 'azkarTajweedManifest', 'azkarTajweedControl', 'azkarTajweedExpectedVersion']
      .some(key => Object.prototype.hasOwnProperty.call(body, key))) {
      const { data: editorRole, error: editorRoleError } = await supabase
        .from('azkar_tajweed_admins')
        .select('user_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (editorRoleError || !editorRole) {
        return jsonResponse({ error: 'Azkar tajweed publishing requires editor access' }, 403);
      }
      const result = await executeAzkarTajweedOperation(body, {
        token: githubToken,
        repo: githubRepo,
        isEditor: true,
        contentOrigin: Deno.env.get('AZKAR_TAJWEED_CONTENT_ORIGIN'),
      });
      let mirrorWarning: string | undefined;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (result.files.length && serviceKey) {
        // Git is already authoritative. Mirror failure must never report that the
        // successful commit failed, or tempt the editor into repeating a toggle.
        try {
          const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
          const { error } = await serviceClient.from('content_manifest').upsert({
            id: 1,
            published_at: result.publishedAt,
            published_by: userData.user.email,
            remote_azkar_tajweed: result.azkarTajweedManifest,
          });
          if (error) mirrorWarning = 'Saved to GitHub; the Supabase mirror could not be updated';
        } catch {
          mirrorWarning = 'Saved to GitHub; the Supabase mirror could not be updated';
        }
      }
      return jsonResponse({ ...result, ...(mirrorWarning ? { mirrorWarning } : {}) });
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
      await serviceClient.from('content_manifest').upsert(upsertRow);
    }

    return jsonResponse({
      ok: true,
      publishedAt: new Date().toISOString(),
      files: files.map((file) => file.path),
      repo: githubRepo,
    });
  } catch (error) {
    if (error instanceof TajweedPublishError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    const message = error instanceof Error ? error.message : 'Unknown publish error';
    return jsonResponse({ error: message }, 500);
  }
});
