/**
 * RuStore live version for Waydean admin (command center + release form).
 * Secrets: RUSTORE_KEY_ID, RUSTORE_API_TOKEN (Base64 PKCS#8), optional RUSTORE_PACKAGE_NAME.
 * Requires authenticated Supabase user (Authorization Bearer).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const API_BASE = 'https://public-api.rustore.ru';
const DEFAULT_PACKAGE = 'com.sheyhmansur.quranapp';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=60',
    },
  });
}

function rustoreTimestamp() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${oh}:${om}`
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

async function createSignature(keyId: string, privateKeyB64: string, timestamp: string) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(privateKeyB64),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const message = new TextEncoder().encode(`${keyId}${timestamp}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, message);
  return bytesToBase64(signature);
}

async function obtainPublicToken(keyId: string, privateKeyB64: string) {
  const timestamp = rustoreTimestamp();
  const signature = await createSignature(keyId, privateKeyB64, timestamp);
  const response = await fetch(`${API_BASE}/public/auth/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId, timestamp, signature }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json?.code && String(json.code).toUpperCase() !== 'OK')) {
    throw new Error(json?.message || `RuStore auth failed (${response.status})`);
  }
  const jwe = json?.body?.jwe;
  if (!jwe || typeof jwe !== 'string') throw new Error('RuStore auth: missing jwe');
  return jwe;
}

type RuStoreVersion = {
  versionId?: number;
  versionName?: string;
  versionCode?: number;
  versionStatus?: string;
  publishDateTime?: string | null;
  whatsNew?: string | null;
};

function pickActive(versions: RuStoreVersion[]) {
  const active = versions.find((v) => v.versionStatus === 'ACTIVE' || v.versionStatus === 'PARTIAL_ACTIVE');
  return active ?? versions[0] ?? null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const keyId = Deno.env.get('RUSTORE_KEY_ID')?.trim();
    const privateKeyB64 =
      Deno.env.get('RUSTORE_API_TOKEN')?.trim() || Deno.env.get('RUSTORE_PRIVATE_KEY')?.trim();
    const packageName = Deno.env.get('RUSTORE_PACKAGE_NAME')?.trim() || DEFAULT_PACKAGE;

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Supabase env is not configured' }, 500);
    }
    if (!keyId || !privateKeyB64) {
      return jsonResponse({ error: 'RuStore secrets are not configured' }, 503);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const jwe = await obtainPublicToken(keyId, privateKeyB64);
    const qs = new URLSearchParams({
      page: '0',
      size: '20',
      versionStatuses: 'ACTIVE,PARTIAL_ACTIVE,READY_FOR_PUBLICATION,MODERATION,REJECTED,DRAFT',
    });
    const response = await fetch(
      `${API_BASE}/public/v1/application/${encodeURIComponent(packageName)}/version?${qs}`,
      { headers: { 'Public-Token': jwe } }
    );
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json?.code && String(json.code).toUpperCase() !== 'OK')) {
      throw new Error(json?.message || `RuStore versions failed (${response.status})`);
    }

    const body = json?.body ?? json;
    const list: RuStoreVersion[] = Array.isArray(body?.content)
      ? body.content
      : Array.isArray(body)
        ? body
        : [];
    const active = pickActive(list);
    if (!active?.versionName) {
      return jsonResponse({ error: 'No RuStore versions found', packageName }, 404);
    }

    return jsonResponse({
      ok: true,
      packageName,
      versionName: active.versionName,
      versionCode: active.versionCode ?? null,
      versionStatus: active.versionStatus ?? null,
      versionId: active.versionId ?? null,
      publishDateTime: active.publishDateTime ?? null,
      whatsNew: active.whatsNew ?? null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown RuStore error';
    return jsonResponse({ error: message }, 500);
  }
});
