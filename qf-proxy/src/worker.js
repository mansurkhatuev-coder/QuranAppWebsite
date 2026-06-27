/** Standalone Cloudflare Worker — QF OAuth proxy (secrets stay server-side). */

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

async function fetchQfToken(env) {
  const ageMs = Date.now() - tokenCache.fetchedAt;
  if (tokenCache.token && ageMs < TOKEN_TTL_MS) {
    return tokenCache.token;
  }

  if (!env.QF_CLIENT_ID || !env.QF_CLIENT_SECRET) {
    throw new Error('QF credentials missing on worker');
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  /** @param {Request} request @param {Record<string, string>} env */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }

    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith(QF_PATH_PREFIX)) {
      return new Response('Not Found', { status: 404, headers: corsHeaders() });
    }

    const { apiBase } = getQfBases(env);
    const targetUrl = `${apiBase}${incoming.pathname}${incoming.search}`;

    try {
      const token = await fetchQfToken(env);
      const upstream = await fetch(targetUrl, {
        headers: {
          'x-auth-token': token,
          'x-client-id': env.QF_CLIENT_ID,
        },
      });

      const headers = new Headers(corsHeaders());
      const contentType = upstream.headers.get('content-type');
      if (contentType) headers.set('content-type', contentType);
      headers.set('Cache-Control', 'private, max-age=120');

      return new Response(upstream.body, {
        status: upstream.status,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QF proxy error';
      const status = message.includes('credentials missing') ? 503 : 502;
      return new Response(message, { status, headers: corsHeaders() });
    }
  },
};
