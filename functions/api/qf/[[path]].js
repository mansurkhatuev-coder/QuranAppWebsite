/** Cloudflare Pages proxy for Quran Foundation content API (keeps client_secret server-side). */

const QF_PATH_PREFIX = '/content/api/v4/';
const TOKEN_TTL_MS = 50 * 60 * 1000;

/** @type {{ token: string | null; fetchedAt: number }} */
const tokenCache = { token: null, fetchedAt: 0 };

function getQfBases(env) {
  const production = env.QF_ENV === 'production';
  if (production) {
    return {
      authBase: 'https://oauth2.quran.foundation',
      apiBase: 'https://apis.quran.foundation',
    };
  }
  return {
    authBase: 'https://prelive-oauth2.quran.foundation',
    apiBase: 'https://apis-prelive.quran.foundation',
  };
}

function toBasicAuth(clientId, clientSecret) {
  return btoa(`${clientId}:${clientSecret}`);
}

/**
 * @param {import('@cloudflare/workers-types').ExecutionContext} env
 */
async function fetchQfToken(env) {
  const ageMs = Date.now() - tokenCache.fetchedAt;
  if (tokenCache.token && ageMs < TOKEN_TTL_MS) {
    return tokenCache.token;
  }

  const { authBase } = getQfBases(env);
  const response = await fetch(`${authBase}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${toBasicAuth(env.QF_CLIENT_ID, env.QF_CLIENT_SECRET)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=content',
  });

  if (!response.ok) {
    throw new Error(`QF auth failed (${response.status})`);
  }

  const json = await response.json();
  if (!json?.access_token) {
    throw new Error('QF auth response missing access_token');
  }

  tokenCache.token = json.access_token;
  tokenCache.fetchedAt = Date.now();
  return tokenCache.token;
}

function buildUpstreamPath(pathParam, search) {
  const segments = Array.isArray(pathParam) ? pathParam : pathParam ? [pathParam] : [];
  const joined = segments.map((part) => String(part).trim()).filter(Boolean).join('/');
  const upstreamPath = `/${joined}`;
  if (!upstreamPath.startsWith(QF_PATH_PREFIX)) return null;
  return `${upstreamPath}${search || ''}`;
}

/**
 * @param {import('@cloudflare/workers-types').EventContext<Env, string, unknown>} context
 */
export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!env.QF_CLIENT_ID || !env.QF_CLIENT_SECRET) {
    return new Response('QF proxy is not configured', { status: 503 });
  }

  const incoming = new URL(request.url);
  const upstreamPath = buildUpstreamPath(params.path, incoming.search);
  if (!upstreamPath) {
    return new Response('Forbidden', { status: 403 });
  }

  const { apiBase } = getQfBases(env);
  const targetUrl = `${apiBase}${upstreamPath}`;

  try {
    const token = await fetchQfToken(env);
    const upstream = await fetch(targetUrl, {
      headers: {
        'x-auth-token': token,
        'x-client-id': env.QF_CLIENT_ID,
      },
    });

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('Cache-Control', 'private, max-age=120');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return new Response('QF proxy error', { status: 502 });
  }
}
