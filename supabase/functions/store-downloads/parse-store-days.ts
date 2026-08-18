export type StoreDownloadDay = {
  day: string;
  downloads: number;
  updates: number;
};

export type ParseStoreTableResult =
  | { ok: true; rows: StoreDownloadDay[] }
  | { ok: false; reason: string };

const FIRST_TIME_TYPE =
  /first[\s-]*time|перв|install(?!.*(update|обнов))/i;

function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi >= comma && semi > 0) return ';';
  return ',';
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

function headerKind(value: string): 'date' | 'downloads' | 'updates' | 'type' | 'counts' | 'other' {
  const h = normalizeHeader(value);
  if (!h) return 'other';
  if (/^(date|дата|day|день)$/i.test(h) || /(^| )(date|дата)($| )/.test(h)) return 'date';
  if (/download type|тип.*скач|тип.*загруз/.test(h) || h === 'type') return 'type';
  if (/обнов|update/.test(h)) return 'updates';
  if (/установ|install|скач|download/.test(h)) return 'downloads';
  if (/^counts?$/.test(h) || h === 'количество') return 'counts';
  return 'other';
}

function parseCount(raw: string): number {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function parseDay(raw: string): string | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
  if (dotted) {
    const day = dotted[1].padStart(2, '0');
    const month = dotted[2].padStart(2, '0');
    return `${dotted[3]}-${month}-${day}`;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (us) {
    const month = us[1].padStart(2, '0');
    const day = us[2].padStart(2, '0');
    return `${us[3]}-${month}-${day}`;
  }
  return null;
}

function isFirstTimeType(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/re-?download|update|обнов/i.test(v) && !FIRST_TIME_TYPE.test(v)) return false;
  if (FIRST_TIME_TYPE.test(v)) return true;
  return !/re-?download|redownload/i.test(v);
}

export function parseStoreDownloadTable(input: string): ParseStoreTableResult {
  const text = String(input || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  if (lines.length < 2) return { ok: false, reason: 'no-rows' };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map(normalizeHeader);
  const kinds = headers.map(headerKind);
  const dateIdx = kinds.indexOf('date');
  if (dateIdx < 0) return { ok: false, reason: 'no-date-column' };

  const typeIdx = kinds.indexOf('type');
  const updatesIdx = kinds.indexOf('updates');
  let downloadsIdx = kinds.indexOf('downloads');
  const countsIdx = kinds.indexOf('counts');
  if (downloadsIdx < 0 && countsIdx >= 0) downloadsIdx = countsIdx;
  if (downloadsIdx < 0) return { ok: false, reason: 'no-downloads-column' };

  const merged = new Map<string, StoreDownloadDay>();
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const day = parseDay(cells[dateIdx] || '');
    if (!day) continue;
    if (typeIdx >= 0 && !isFirstTimeType(cells[typeIdx] || '')) continue;
    const downloads = parseCount(cells[downloadsIdx] || '0');
    const updates = updatesIdx >= 0 ? parseCount(cells[updatesIdx] || '0') : 0;
    const prev = merged.get(day) || { day, downloads: 0, updates: 0 };
    prev.downloads += downloads;
    prev.updates += updates;
    merged.set(day, prev);
  }

  const rows = [...merged.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (!rows.length) return { ok: false, reason: 'no-valid-rows' };
  return { ok: true, rows };
}

export function sumDownloadsInRange(
  rows: StoreDownloadDay[],
  withinDays: number,
  nowMs = Date.now()
): number {
  if (!withinDays) {
    return rows.reduce((sum, row) => sum + row.downloads, 0);
  }
  const cutoff = nowMs - withinDays * 24 * 60 * 60 * 1000;
  return rows.reduce((sum, row) => {
    const t = Date.parse(`${row.day}T00:00:00.000Z`);
    if (!Number.isFinite(t) || t < cutoff) return sum;
    return sum + row.downloads;
  }, 0);
}
