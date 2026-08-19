import * as jose from 'https://esm.sh/jose@5.9.6';

import { parseStoreDownloadTable, type StoreDownloadDay } from './parse-store-days.ts';

const API = 'https://api.appstoreconnect.apple.com';
const DEFAULT_APP_ID = '6782619598';
const MAX_INSTANCES = 12;

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Json[] : [];
}

function normalizePem(raw: string): string {
  const trimmed = raw.trim().replace(/\\n/g, '\n');
  if (trimmed.includes('BEGIN')) return trimmed;
  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [body];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

export async function createAppleJwt(issuerId: string, keyId: string, privateKey: string): Promise<string> {
  const pem = normalizePem(privateKey);
  const key = await jose.importPKCS8(pem, 'ES256');
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('12m')
    .sign(key);
}

async function appleFetch(token: string, path: string, init?: RequestInit): Promise<{ status: number; json: Json }> {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json: asRecord(json) };
}

async function decodeSegmentBody(bytes: ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes);
  const looksGzip = view.length >= 2 && view[0] === 0x1f && view[1] === 0x8b;
  if (looksGzip) {
    const ds = new DecompressionStream('gzip');
    return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
  }
  return new TextDecoder().decode(bytes);
}

function pickDownloadReport(reports: Json[]): Json | null {
  const named = reports.filter((row) => {
    const label = String(asRecord(row.attributes).name || '');
    return /download/i.test(label) && !/pre-?order/i.test(label);
  });
  const preferred = named.find((row) => /app store downloads/i.test(String(asRecord(row.attributes).name || '')));
  return preferred || named[0] || null;
}

async function ensureReportRequest(token: string, appId: string, accessType: 'ONGOING' | 'ONE_TIME_SNAPSHOT') {
  const listed = await appleFetch(
    token,
    `/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?filter[accessType]=${accessType}&limit=5`
  );
  if (listed.status === 200 && asArray(listed.json.data).length > 0) {
    return { id: String(asArray(listed.json.data)[0].id || ''), created: false };
  }
  const created = await appleFetch(token, '/v1/analyticsReportRequests', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'analyticsReportRequests',
        attributes: { accessType },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    }),
  });
  if (created.status === 409) {
    const again = await appleFetch(
      token,
      `/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?filter[accessType]=${accessType}&limit=5`
    );
    const id = String(asArray(again.json.data)[0]?.id || '');
    return { id, created: false };
  }
  if (created.status >= 400) {
    const err = asArray(created.json.errors)[0];
    const title = String(asRecord(err).detail || asRecord(err).title || created.json.error || `Apple ${created.status}`);
    throw new Error(title);
  }
  const id = String(asRecord(created.json.data).id || '');
  return { id, created: true };
}

export type AppleSyncResult = {
  status: 'ok' | 'waiting' | 'error' | 'needs_secrets';
  message: string;
  rows: StoreDownloadDay[];
  requested: boolean;
  requestedAt?: string;
};

export async function syncAppleDownloads(env: {
  issuerId?: string;
  keyId?: string;
  privateKey?: string;
  appId?: string;
}): Promise<AppleSyncResult> {
  const issuerId = env.issuerId?.trim();
  const keyId = env.keyId?.trim();
  const privateKey = env.privateKey?.trim();
  const appId = env.appId?.trim() || DEFAULT_APP_ID;
  if (!issuerId || !keyId || !privateKey) {
    return {
      status: 'needs_secrets',
      message: 'Нет секретов App Store Connect в Supabase (APP_STORE_ISSUER_ID / KEY_ID / PRIVATE_KEY).',
      rows: [],
      requested: false,
    };
  }

  const token = await createAppleJwt(issuerId, keyId, privateKey);
  const ongoing = await ensureReportRequest(token, appId, 'ONGOING');
  const requestedAt = ongoing.created ? new Date().toISOString() : undefined;
  try {
    await ensureReportRequest(token, appId, 'ONE_TIME_SNAPSHOT');
  } catch {
    // snapshot is optional; ongoing is enough going forward
  }

  if (!ongoing.id) {
    return {
      status: 'error',
      message: 'Apple не вернул id запроса отчёта.',
      rows: [],
      requested: ongoing.created,
      requestedAt,
    };
  }

  const reportsRes = await appleFetch(
    token,
    `/v1/analyticsReportRequests/${encodeURIComponent(ongoing.id)}/reports?filter[category]=COMMERCE&limit=50`
  );
  let reports = asArray(reportsRes.json.data);
  if (!reports.length) {
    const all = await appleFetch(
      token,
      `/v1/analyticsReportRequests/${encodeURIComponent(ongoing.id)}/reports?limit=50`
    );
    reports = asArray(all.json.data);
  }
  const report = pickDownloadReport(reports);
  if (!report?.id) {
    return {
      status: 'waiting',
      message: 'Отчёт заказан. Apple готовит файлы — обычно 24–48 часов. Потом нажмите «Проверить».',
      rows: [],
      requested: true,
      requestedAt,
    };
  }

  const instancesRes = await appleFetch(
    token,
    `/v1/analyticsReports/${encodeURIComponent(String(report.id))}/instances?filter[granularity]=DAILY&limit=20`
  );
  const instances = asArray(instancesRes.json.data).slice(0, MAX_INSTANCES);
  if (!instances.length) {
    return {
      status: 'waiting',
      message: 'Заказ есть, дневных файлов пока нет. Подождите сутки–двое и нажмите «Проверить».',
      rows: [],
      requested: true,
      requestedAt,
    };
  }

  const merged = new Map<string, StoreDownloadDay>();
  for (const instance of instances) {
    const id = String(instance.id || '');
    if (!id) continue;
    const segmentsRes = await appleFetch(
      token,
      `/v1/analyticsReportInstances/${encodeURIComponent(id)}/segments?limit=10`
    );
    for (const segment of asArray(segmentsRes.json.data)) {
      const url = String(asRecord(segment.attributes).url || '');
      if (!url) continue;
      const fileRes = await fetch(url);
      if (!fileRes.ok) continue;
      const text = await decodeSegmentBody(await fileRes.arrayBuffer());
      const parsed = parseStoreDownloadTable(text);
      if (!parsed.ok) continue;
      for (const row of parsed.rows) {
        const prev = merged.get(row.day) || { day: row.day, downloads: 0, updates: 0 };
        prev.downloads += row.downloads;
        prev.updates += row.updates;
        merged.set(row.day, prev);
      }
    }
  }

  const rows = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (!rows.length) {
    return {
      status: 'waiting',
      message: 'Файлы Apple скачались, но колонок скачиваний в них нет. Повторите завтра.',
      rows: [],
      requested: true,
      requestedAt,
    };
  }
  return {
    status: 'ok',
    message: `App Store: ${rows.length} дн.`,
    rows,
    requested: ongoing.created,
    requestedAt,
  };
}
