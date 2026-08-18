/**
 * Store download stats for Waydean admin analytics.
 * Secrets: APP_STORE_ISSUER_ID, APP_STORE_KEY_ID, APP_STORE_PRIVATE_KEY, optional APP_STORE_APP_ID.
 * Requires authenticated Supabase user.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { syncAppleDownloads } from './apple-reports.ts';
import { parseStoreDownloadTable, type StoreDownloadDay } from './parse-store-days.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

async function requireUser(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase env is not configured');
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    const error = new Error('Unauthorized');
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const err = new Error('Unauthorized');
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return data.user;
}

function serviceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) throw new Error('Service role is not configured');
  return createClient(supabaseUrl, serviceKey);
}

async function readDays(store: 'rustore' | 'appstore'): Promise<StoreDownloadDay[]> {
  const client = serviceClient();
  const { data, error } = await client
    .from('store_download_days')
    .select('day,downloads,updates')
    .eq('store', store)
    .order('day', { ascending: true })
    .limit(4000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    day: String(row.day),
    downloads: Number(row.downloads) || 0,
    updates: Number(row.updates) || 0,
  }));
}

async function upsertDays(
  store: 'rustore' | 'appstore',
  rows: StoreDownloadDay[],
  source: string
) {
  if (!rows.length) return;
  const client = serviceClient();
  const payload = rows.map((row) => ({
    store,
    day: row.day,
    downloads: row.downloads,
    updates: row.updates,
    source,
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await client.from('store_download_days').upsert(payload, { onConflict: 'store,day' });
  if (error) throw error;
}

async function readMeta(key: string): Promise<Json> {
  const client = serviceClient();
  const { data } = await client.from('store_download_meta').select('payload').eq('key', key).maybeSingle();
  return asRecord(data?.payload);
}

async function writeMeta(key: string, payload: Json) {
  const client = serviceClient();
  const { error } = await client.from('store_download_meta').upsert({
    key,
    payload,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

function storeSummary(rows: StoreDownloadDay[], meta: Json) {
  const lastDay = rows.length ? rows[rows.length - 1].day : null;
  const total = rows.reduce((sum, row) => sum + row.downloads, 0);
  return {
    days: rows.length,
    total,
    lastDay,
    status: meta.status || (rows.length ? 'ok' : 'empty'),
    message: meta.message || '',
    fetchedAt: meta.fetchedAt || null,
  };
}

async function snapshot() {
  const rustoreRows = await readDays('rustore');
  const appleRows = await readDays('appstore');
  const rustoreMeta = await readMeta('rustore');
  const appleMeta = await readMeta('apple');
  return {
    ok: true,
    rustore: { ...storeSummary(rustoreRows, rustoreMeta), rows: rustoreRows },
    apple: { ...storeSummary(appleRows, appleMeta), rows: appleRows },
  };
}

async function refreshApple() {
  const result = await syncAppleDownloads({
    issuerId: Deno.env.get('APP_STORE_ISSUER_ID') || undefined,
    keyId: Deno.env.get('APP_STORE_KEY_ID') || undefined,
    privateKey: Deno.env.get('APP_STORE_PRIVATE_KEY') || undefined,
    appId: Deno.env.get('APP_STORE_APP_ID') || undefined,
  });
  await writeMeta('apple', {
    status: result.status,
    message: result.message,
    fetchedAt: new Date().toISOString(),
    requested: result.requested,
  });
  if (result.rows.length) {
    await upsertDays('appstore', result.rows, 'apple_report');
  }
  return result;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await requireUser(request);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.get('refresh') === '1') {
        await refreshApple();
      }
      return jsonResponse(await snapshot());
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const body = asRecord(await request.json().catch(() => ({})));
    const action = String(body.action || '');

    if (action === 'refresh-apple') {
      const apple = await refreshApple();
      const snap = await snapshot();
      return jsonResponse({ ...snap, appleSync: apple });
    }

    if (action === 'upload-rustore') {
      const csv = String(body.csv || '');
      const parsed = parseStoreDownloadTable(csv);
      if (!parsed.ok) {
        return jsonResponse({ error: `CSV: ${parsed.reason}` }, 400);
      }
      await upsertDays('rustore', parsed.rows, 'csv');
      await writeMeta('rustore', {
        status: 'ok',
        message: `Загружено ${parsed.rows.length} дн.`,
        fetchedAt: new Date().toISOString(),
      });
      return jsonResponse(await snapshot());
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error) {
    const status = typeof (error as { status?: number }).status === 'number'
      ? (error as { status: number }).status
      : 500;
    const message = error instanceof Error ? error.message : 'Unknown store-downloads error';
    if (/store_download/i.test(message) && /does not exist|relation/i.test(message)) {
      return jsonResponse({ error: 'Таблица store_download_days ещё не создана. Выполните SQL миграцию.' }, 503);
    }
    return jsonResponse({ error: message }, status);
  }
});
