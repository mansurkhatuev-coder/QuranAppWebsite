import * as jose from 'https://esm.sh/jose@5.9.6';

import { parseStoreDownloadTable, type StoreDownloadDay } from './parse-store-days.ts';

const API = 'https://api.appstoreconnect.apple.com';
const DEFAULT_APP_ID = '6782619598';
/** Daily ONGOING files + snapshot history; Apple pages ~200 max. */
const INSTANCE_PAGE_LIMIT = 200;

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

function reportName(row: Json): string {
  return String(asRecord(row.attributes).name || '');
}

/**
 * Prefer "App Store Downloads Standard" — one row set per day without
 * detailed dimension explosion. Fall back to any Downloads report.
 */
function pickDownloadReport(reports: Json[]): Json | null {
  const named = reports.filter((row) => {
    const label = reportName(row);
    return /download/i.test(label) && !/pre-?order/i.test(label);
  });
  const standard = named.find((row) => /app store downloads/i.test(reportName(row)) && /standard/i.test(reportName(row)));
  if (standard) return standard;
  const preferred = named.find((row) => /app store downloads/i.test(reportName(row)) && !/detailed/i.test(reportName(row)));
  if (preferred) return preferred;
  const anyDownloads = named.find((row) => /app store downloads/i.test(reportName(row)));
  return anyDownloads || named[0] || null;
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
    let id = String(asArray(again.json.data)[0]?.id || '');
    if (!id) {
      // Apple sometimes returns 409 for a "ghost" snapshot that list filters miss.
      const all = await appleFetch(
        token,
        `/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?limit=20`
      );
      const match = asArray(all.json.data).find((row) => {
        return String(asRecord(row.attributes).accessType || '') === accessType;
      });
      id = String(match?.id || '');
    }
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

async function listReports(token: string, requestId: string): Promise<Json[]> {
  const reportsRes = await appleFetch(
    token,
    `/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports?filter[category]=COMMERCE&limit=50`
  );
  let reports = asArray(reportsRes.json.data);
  if (!reports.length) {
    const all = await appleFetch(
      token,
      `/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports?limit=50`
    );
    reports = asArray(all.json.data);
  }
  return reports;
}

async function listInstances(token: string, reportId: string, granularity: 'DAILY' | 'MONTHLY'): Promise<Json[]> {
  const collected: Json[] = [];
  let path: string | null =
    `/v1/analyticsReports/${encodeURIComponent(reportId)}/instances?filter[granularity]=${granularity}&limit=${INSTANCE_PAGE_LIMIT}`;
  while (path) {
    const res = await appleFetch(token, path);
    collected.push(...asArray(res.json.data));
    const next = asRecord(res.json.links).next;
    path = typeof next === 'string' && next ? next : null;
    if (collected.length >= 2000) break;
  }
  return collected;
}

async function collectRowsFromInstances(
  token: string,
  instances: Json[]
): Promise<{ filesOk: number; rows: StoreDownloadDay[] }> {
  const byDay = new Map<string, StoreDownloadDay>();
  let filesOk = 0;
  for (const instance of instances) {
    const id = String(instance.id || '');
    if (!id) continue;
    const segmentsRes = await appleFetch(
      token,
      `/v1/analyticsReportInstances/${encodeURIComponent(id)}/segments?limit=20`
    );
    for (const segment of asArray(segmentsRes.json.data)) {
      const url = String(asRecord(segment.attributes).url || '');
      if (!url) continue;
      const fileRes = await fetch(url);
      if (!fileRes.ok) continue;
      const text = await decodeSegmentBody(await fileRes.arrayBuffer());
      const parsed = parseStoreDownloadTable(text);
      if (!parsed.ok) continue;
      filesOk += 1;
      for (const row of parsed.rows) {
        const prev = byDay.get(row.day) || { day: row.day, downloads: 0, updates: 0 };
        // Duplicate files / overlapping segments: keep the larger first-time total.
        if (row.downloads >= prev.downloads) {
          prev.downloads = row.downloads;
          prev.updates = Math.max(prev.updates, row.updates);
        }
        byDay.set(row.day, prev);
      }
    }
  }
  return { filesOk, rows: [...byDay.values()] };
}

function yearMonthOf(day: string): string {
  return day.slice(0, 7);
}

function mergeDayMaps(target: Map<string, StoreDownloadDay>, rows: StoreDownloadDay[]) {
  for (const row of rows) {
    const prev = target.get(row.day);
    if (!prev || row.downloads >= prev.downloads) {
      target.set(row.day, { ...row });
    }
  }
}

/**
 * Prefer daily rows. Monthly Apple files put the whole month on one day
 * (often YYYY-MM → last day); only keep those months with no daily coverage.
 */
function mergeMonthlyFillingGaps(
  daily: Map<string, StoreDownloadDay>,
  monthlyRows: StoreDownloadDay[]
) {
  const monthsWithDaily = new Set([...daily.keys()].map(yearMonthOf));
  for (const row of monthlyRows) {
    const ym = yearMonthOf(row.day);
    if (monthsWithDaily.has(ym)) continue;
    daily.set(row.day, { ...row });
  }
}

async function ingestRequest(
  token: string,
  requestId: string,
  merged: Map<string, StoreDownloadDay>,
  opts?: { fillMonthlyGaps?: boolean }
): Promise<{ hasReport: boolean; instanceCount: number; filesOk: number }> {
  if (!requestId) return { hasReport: false, instanceCount: 0, filesOk: 0 };
  const reports = await listReports(token, requestId);
  const report = pickDownloadReport(reports);
  if (!report?.id) return { hasReport: false, instanceCount: 0, filesOk: 0 };

  const dailyInstances = await listInstances(token, String(report.id), 'DAILY');
  const daily = await collectRowsFromInstances(token, dailyInstances);
  mergeDayMaps(merged, daily.rows);

  let monthlyFiles = 0;
  let monthlyCount = 0;
  const needMonthly = !daily.rows.length || opts?.fillMonthlyGaps;
  if (needMonthly) {
    const monthlyInstances = await listInstances(token, String(report.id), 'MONTHLY');
    monthlyCount = monthlyInstances.length;
    if (monthlyInstances.length) {
      const monthly = await collectRowsFromInstances(token, monthlyInstances);
      monthlyFiles = monthly.filesOk;
      mergeMonthlyFillingGaps(merged, monthly.rows);
    }
  }

  return {
    hasReport: true,
    instanceCount: dailyInstances.length + monthlyCount,
    filesOk: daily.filesOk + monthlyFiles,
  };
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

  let snapshotId = '';
  let snapshotCreated = false;
  try {
    const snapshot = await ensureReportRequest(token, appId, 'ONE_TIME_SNAPSHOT');
    snapshotId = snapshot.id;
    snapshotCreated = snapshot.created;
  } catch {
    // Snapshot is best-effort: Apple may 409 ghost-state or deny; ONGOING still works.
  }

  if (!ongoing.id && !snapshotId) {
    return {
      status: 'error',
      message: 'Apple не вернул id запроса отчёта.',
      rows: [],
      requested: ongoing.created || snapshotCreated,
      requestedAt,
    };
  }

  const merged = new Map<string, StoreDownloadDay>();
  // Snapshot first (history), then ONGOING overwrites overlapping recent days.
  const snapshotIngest = snapshotId
    ? await ingestRequest(token, snapshotId, merged, { fillMonthlyGaps: true })
    : { hasReport: false, instanceCount: 0, filesOk: 0 };
  const ongoingIngest = ongoing.id
    ? await ingestRequest(token, ongoing.id, merged, { fillMonthlyGaps: false })
    : { hasReport: false, instanceCount: 0, filesOk: 0 };

  const rows = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
  const total = rows.reduce((sum, row) => sum + row.downloads, 0);
  const firstDay = rows[0]?.day;
  const lastDay = rows[rows.length - 1]?.day;
  const anyReport = ongoingIngest.hasReport || snapshotIngest.hasReport;
  const anyInstances = ongoingIngest.instanceCount + snapshotIngest.instanceCount > 0;

  if (!rows.length) {
    if (!anyReport) {
      return {
        status: 'waiting',
        message: 'Отчёт заказан. Apple готовит файлы — обычно 24–48 часов. Потом нажмите «Проверить».',
        rows: [],
        requested: true,
        requestedAt: requestedAt || (snapshotCreated ? new Date().toISOString() : undefined),
      };
    }
    if (!anyInstances) {
      return {
        status: 'waiting',
        message: 'Заказ есть, дневных/месячных файлов пока нет. Подождите сутки–двое и нажмите «Проверить».',
        rows: [],
        requested: true,
        requestedAt,
      };
    }
    return {
      status: 'waiting',
      message: 'Файлы Apple скачались, но колонок скачиваний в них нет. Повторите завтра.',
      rows: [],
      requested: true,
      requestedAt,
    };
  }

  const range = firstDay && lastDay ? `${firstDay}…${lastDay}` : '';
  const sources = [
    ongoingIngest.filesOk ? 'текущие' : null,
    snapshotIngest.filesOk ? 'история' : null,
  ].filter(Boolean).join('+') || 'отчёт';

  return {
    status: 'ok',
    message: `App Store: ${total} first-time · ${rows.length} дн.${range ? ` (${range})` : ''} · ${sources}`,
    rows,
    requested: ongoing.created || snapshotCreated,
    requestedAt,
  };
}
