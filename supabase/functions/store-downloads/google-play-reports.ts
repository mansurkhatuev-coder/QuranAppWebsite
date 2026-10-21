import type { StoreDownloadDay } from './parse-store-days.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
const GOOGLE_STORAGE_API = 'https://storage.googleapis.com/storage/v1';
const MAX_LIST_PAGES = 20;
const DOWNLOAD_BATCH_SIZE = 8;

type GooglePlayReportDay = StoreDownloadDay & {
  uninstalls: number;
  currentUserInstalls: number | null;
  activeDeviceInstalls: number | null;
};

type GooglePlayObject = {
  name: string;
  generation?: string;
};

type GooglePlayServiceAccount = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type GooglePlaySyncStage = 'service_account' | 'token' | 'listing' | 'download';

class GoogleRequestError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(`Google request failed (${status})`);
  }
}

export type GooglePlaySyncResult = {
  status: 'ok' | 'needs_secrets' | 'waiting' | 'error';
  message: string;
  rows: GooglePlayReportDay[];
  requested: number;
};

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodePrivateKey(pem: string): Uint8Array {
  const normalized = pem.trim().replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!body) throw new Error('Google Play service account key is invalid');
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeGoogleErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (typeof error === 'string') {
    return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error) ? error : null;
  }
  if (!error || typeof error !== 'object') return null;

  const errorBody = error as Record<string, unknown>;
  const errors = Array.isArray(errorBody.errors) ? errorBody.errors : [];
  const firstError = errors.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  const candidates = [firstError?.reason, errorBody.status, errorBody.code];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate)) return candidate;
  }
  return null;
}

async function googleRequestError(response: Response): Promise<GoogleRequestError> {
  const payload = await response.clone().json().catch(() => null);
  return new GoogleRequestError(response.status, safeGoogleErrorCode(payload));
}

async function createAccessToken(serviceAccount: GooglePlayServiceAccount): Promise<string> {
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google Play service account key is incomplete');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: GOOGLE_STORAGE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const privateKeyBytes = decodePrivateKey(serviceAccount.private_key);
  const privateKeyBuffer = new ArrayBuffer(privateKeyBytes.byteLength);
  new Uint8Array(privateKeyBuffer).set(privateKeyBytes);
  const signingKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!tokenResponse.ok) throw await googleRequestError(tokenResponse);

  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: unknown };
  if (typeof tokenBody.access_token !== 'string' || !tokenBody.access_token) {
    throw new Error('Google token response did not contain an access token');
  }
  return tokenBody.access_token;
}

function reportMonth(name: string): string | null {
  return /_(\d{6})_(?:overview|country)\.csv$/i.exec(name)?.[1] ?? null;
}

function chooseMonthlyInstallReports(objects: GooglePlayObject[]): GooglePlayObject[] {
  const byMonth = new Map<string, { overview?: GooglePlayObject; country?: GooglePlayObject }>();
  for (const object of objects) {
    const month = reportMonth(object.name);
    if (!month) continue;
    const entry = byMonth.get(month) || {};
    if (/_overview\.csv$/i.test(object.name)) entry.overview = object;
    if (/_country\.csv$/i.test(object.name)) entry.country = object;
    byMonth.set(month, entry);
  }
  return [...byMonth.values()]
    .map((entry) => entry.overview || entry.country)
    .filter((object): object is GooglePlayObject => Boolean(object))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listReportObjects(bucket: string, prefix: string, token: string): Promise<GooglePlayObject[]> {
  const objects: GooglePlayObject[] = [];
  let pageToken = '';

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const url = new URL(`${GOOGLE_STORAGE_API}/b/${encodeURIComponent(bucket)}/o`);
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('maxResults', '1000');
    url.searchParams.set('fields', 'items(name,generation),nextPageToken');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw await googleRequestError(response);
    const body = await response.json().catch(() => ({})) as {
      items?: unknown;
      nextPageToken?: unknown;
    };
    if (Array.isArray(body.items)) {
      for (const item of body.items) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        if (typeof record.name === 'string') {
          objects.push({
            name: record.name,
            generation: typeof record.generation === 'string' ? record.generation : undefined,
          });
        }
      }
    }
    if (typeof body.nextPageToken !== 'string' || !body.nextPageToken) return objects;
    pageToken = body.nextPageToken;
  }
  throw new Error('Google Play returned too many report files');
}

async function downloadReport(bucket: string, name: string, token: string): Promise<string> {
  const objectName = encodeURIComponent(name);
  const response = await fetch(`${GOOGLE_STORAGE_API}/b/${encodeURIComponent(bucket)}/o/${objectName}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await googleRequestError(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let offset = 0;
  let encoding = 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le';
    offset = 2;
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be';
    offset = 2;
  } else {
    const sampleLength = Math.min(bytes.length, 2000);
    let oddNulls = 0;
    let evenNulls = 0;
    for (let index = 0; index < sampleLength; index += 1) {
      if (bytes[index] !== 0) continue;
      if (index % 2) oddNulls += 1;
      else evenNulls += 1;
    }
    if (oddNulls > sampleLength / 8 && oddNulls > evenNulls * 3) encoding = 'utf-16le';
    if (evenNulls > sampleLength / 8 && evenNulls > oddNulls * 3) encoding = 'utf-16be';
  }
  return new TextDecoder(encoding).decode(bytes.subarray(offset));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((cell) => cell)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function headerIndex(headers: string[], accepted: string[]): number {
  const normalized = new Set(accepted.map(normalizeHeader));
  return headers.findIndex((header) => normalized.has(normalizeHeader(header)));
}

function parseCount(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[\s,]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function parseGooglePlayInstallReport(text: string): GooglePlayReportDay[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const dateIndex = headerIndex(headers, ['Date']);
  const installsIndex = headerIndex(headers, ['Daily User Installs']);
  if (dateIndex < 0 || installsIndex < 0) return [];

  const uninstallsIndex = headerIndex(headers, ['Daily User Uninstalls']);
  const updatesIndex = headerIndex(headers, ['Daily Device Upgrades']);
  const currentIndex = headerIndex(headers, ['Current User Installs']);
  const activeDevicesIndex = headerIndex(headers, ['Installs on active devices']);
  const dimensionIndex = headerIndex(headers, ['Country']);
  const merged = new Map<string, GooglePlayReportDay>();

  for (const cells of rows.slice(1)) {
    const day = (cells[dateIndex] || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const dimension = dimensionIndex >= 0 ? normalizeHeader(cells[dimensionIndex] || '') : '';
    if (/^(total|all countries|all countries\/regions)$/.test(dimension)) continue;
    const previous = merged.get(day) || {
      day,
      downloads: 0,
      updates: 0,
      uninstalls: 0,
      currentUserInstalls: currentIndex >= 0 ? 0 : null,
      activeDeviceInstalls: activeDevicesIndex >= 0 ? 0 : null,
    };
    previous.downloads += parseCount(cells[installsIndex]);
    previous.updates += updatesIndex >= 0 ? parseCount(cells[updatesIndex]) : 0;
    previous.uninstalls += uninstallsIndex >= 0 ? parseCount(cells[uninstallsIndex]) : 0;
    if (currentIndex >= 0) previous.currentUserInstalls = (previous.currentUserInstalls || 0) + parseCount(cells[currentIndex]);
    if (activeDevicesIndex >= 0) previous.activeDeviceInstalls = (previous.activeDeviceInstalls || 0) + parseCount(cells[activeDevicesIndex]);
    merged.set(day, previous);
  }
  return [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
}

async function mapConcurrent<T, R>(items: T[], mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  for (let offset = 0; offset < items.length; offset += DOWNLOAD_BATCH_SIZE) {
    output.push(...await Promise.all(items.slice(offset, offset + DOWNLOAD_BATCH_SIZE).map(mapper)));
  }
  return output;
}

export async function syncGooglePlayInstalls(config: {
  serviceAccountJson?: string;
  bucket: string;
  packageName: string;
}): Promise<GooglePlaySyncResult> {
  if (!config.serviceAccountJson) {
    return {
      status: 'needs_secrets',
      message: 'Не добавлен сервисный ключ Google Play в Secrets Supabase.',
      rows: [],
      requested: 0,
    };
  }

  let stage: GooglePlaySyncStage = 'service_account';
  try {
    const parsedAccount = JSON.parse(config.serviceAccountJson) as GooglePlayServiceAccount;
    stage = 'token';
    const token = await createAccessToken(parsedAccount);
    const prefix = `stats/installs/installs_${config.packageName}_`;
    stage = 'listing';
    const listed = await listReportObjects(config.bucket, prefix, token);
    const reports = chooseMonthlyInstallReports(listed);
    if (!reports.length) {
      return {
        status: 'waiting',
        message: 'В Google Play пока нет доступных месячных отчётов по установкам.',
        rows: [],
        requested: 0,
      };
    }

    stage = 'download';
    const rows = await mapConcurrent(reports, async (report) =>
      parseGooglePlayInstallReport(await downloadReport(config.bucket, report.name, token)));
    const merged = new Map<string, GooglePlayReportDay>();
    for (const reportRows of rows) {
      for (const row of reportRows) merged.set(row.day, row);
    }
    const resultRows = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
    if (!resultRows.length) {
      return {
        status: 'waiting',
        message: 'Отчёты Google Play найдены, но пока не содержат распознаваемых дневных данных.',
        rows: [],
        requested: reports.length,
      };
    }
    return {
      status: 'ok',
      message: `Синхронизировано ${resultRows.length} дн. из ${reports.length} месячных отчётов Google Play.`,
      rows: resultRows,
      requested: reports.length,
    };
  } catch (error) {
    const requestError = error instanceof GoogleRequestError ? error : null;
    const stageNames: Record<GooglePlaySyncStage, string> = {
      service_account: 'разборе ключа сервисного аккаунта',
      token: 'получении OAuth-токена Google',
      listing: 'чтении списка отчётов в Cloud Storage',
      download: 'скачивании CSV отчёта',
    };
    const stageName = stageNames[stage];
    const httpDetails = requestError
      ? ` (HTTP ${requestError.status}${requestError.reason ? `, код ${requestError.reason}` : ''})`
      : '';
    const message = requestError
      ? requestError.status === 403
        ? `Google Play запретил доступ при ${stageName}${httpDetails}. Проверьте настройки этого этапа.`
        : requestError.status === 404 && stage === 'listing'
          ? `Не найден bucket отчётов Google Play при ${stageName}${httpDetails}.`
          : `Ошибка Google Play при ${stageName}${httpDetails}.`
      : `Не удалось обработать ключ или получить отчёты Google Play при ${stageName}.`;
    return { status: 'error', message, rows: [], requested: 0 };
  }
}

